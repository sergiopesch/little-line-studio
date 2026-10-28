import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('scotland', 'scripts/scotland-narration.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class ScotlandPlanTests(unittest.TestCase):
    def test_current_plan_covers_every_authored_key_and_is_deterministic(self):
        first, texts, lessons = s.make_plan()
        second, _, _ = s.make_plan()
        self.assertEqual(first, second)
        self.assertEqual(len(lessons), 30)
        self.assertEqual(set(first['entries']), set(texts))
        self.assertEqual(first['locale'], 'en-GB-x-scotland')
        self.assertEqual(first['voiceId'], s.VOICE)
        self.assertNotIn('music', ''.join(first['entries']))
        self.assertEqual(first['speechCharacters'], sum(len(s.gen.speech_text(x)) for x in first['requests'].values()))
        for key, identity in first['entries'].items():
            request = first['requests'][identity]
            self.assertEqual(request['payload']['inputs'], [{'voice_id': s.VOICE, 'text': texts[key]}])
            self.assertEqual(request['payload']['model_id'], s.MODEL)
            self.assertEqual(identity, s.gen.sha(s.gen.canonical({k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')})))

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),
                     'synthetic audio fixtures require ffmpeg and ffprobe')
class ScotlandBundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / '.gitignore').write_text('/media/elevenlabs/\n')
        self.directory = self.root / 'media/elevenlabs'
        self.directory.mkdir(parents=True)
        self.texts = {'sample': 'Hello.', 'cat/head/instruction': 'Draw a circle.', 'cat/head/hint': 'Try a soft curve.'}
        self.lessons = ['cat']
        self.patches = [patch.object(s, 'ROOT', self.root), patch.object(s.gen, 'ROOT', self.root),
                        patch.object(s.activation, 'ROOT', self.root),
                        patch.object(s, 'catalogue', return_value=(self.texts, self.lessons))]
        for p in self.patches: p.start()
        self.plan, _, _ = s.make_plan()
        self.audio = self.root / 'fixture.mp3'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                        'sine=frequency=440:duration=1', '-ar', '44100', '-ac', '1',
                        '-codec:a', 'libmp3lame', '-b:a', '128k', str(self.audio)], check=True)
        self.duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
            'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(self.audio)], text=True))
        self.bundle = self.write_bundle(self.audio.read_bytes())

    def write_bundle(self, content):
        records = {}
        for identity, request in self.plan['requests'].items():
            folder = self.directory / 'cache' / identity
            folder.mkdir(parents=True, exist_ok=True)
            (folder / 'normalised.mp3').write_bytes(content)
            record = {'status': 'complete', 'provider': 'ElevenLabs', 'cacheKey': identity,
                      'apiPath': request['path'], 'model': s.MODEL, 'voiceId': s.VOICE,
                      'sha256': s.gen.sha(content), 'bytes': len(content), 'duration': self.duration}
            s.gen.write_json(folder / 'receipt.json', record)
            records[identity] = record
        return s.gen.build_bundle(self.directory, self.plan, records).parent

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()

    def test_verified_stage_is_separate_and_marks_reviews_pending(self):
        with patch.object(s, 'decode_assets', wraps=s.decode_assets) as decode:
            result = s.stage_release(self.bundle)
            self.assertEqual(decode.call_count, 1)
            assets = decode.call_args.args[0]
            self.assertEqual(len(assets), 1)  # Three keys share one verified byte sequence.
            self.assertEqual(next(iter(assets.values()))['data'], self.audio.read_bytes())
        stage = Path(result['stage'])
        self.assertEqual(result['narrationKeys'], 3)
        meta = json.loads((stage / f'src/narration-manifest.{s.LOCALE}.json').read_text())
        self.assertEqual(meta['review']['nativeSpeakerReview'], 'pending')
        self.assertEqual(meta['review']['fullHumanListeningReview'], 'pending')
        self.assertFalse(meta['review']['operatorConfirmedReviewed'])
        self.assertNotIn('activatedAt', meta)
        self.assertFalse((self.root / f'src/narration-availability.{s.LOCALE}.json').exists())
        self.assertFalse((self.root / 'public/narration').exists())
        durations = json.loads((stage / f'src/narration-durations.{s.LOCALE}.json').read_text())
        self.assertEqual(set(durations), set(self.texts))
        with self.assertRaises(s.SafeError): s.stage_release(self.bundle)

    def test_full_decode_rejects_corruption_after_hash_and_probe_validation(self):
        self.write_bundle(b'not an mp3' * 200)
        with patch.object(s.activation, 'probe_mp3', return_value=self.duration):
            with self.assertRaisesRegex(s.SafeError, 'failed full decode'):
                s.stage_release(self.bundle)
        self.assertFalse(any(self.directory.glob('scotland-release-*')))

    def test_decoder_uses_verified_bytes_and_fails_closed(self):
        verified = self.audio.read_bytes()
        assets = {'/narration/example.mp3': {'data': verified}}
        with patch.object(s.subprocess, 'run') as run:
            s.decode_assets(assets)
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.kwargs['input'], verified)
            self.assertIn('pipe:0', run.call_args.args[0])
            self.assertTrue(run.call_args.kwargs['check'])
        for error in (OSError('missing'), subprocess.TimeoutExpired('ffmpeg', 90),
                      subprocess.CalledProcessError(1, 'ffmpeg')):
            with self.subTest(error=type(error).__name__), patch.object(s.subprocess, 'run', side_effect=error):
                with self.assertRaisesRegex(s.SafeError, 'failed full decode'):
                    s.decode_assets(assets)

    def test_changed_source_or_receipt_blocks_verification(self):
        with patch.object(s, 'catalogue', return_value=({**self.texts, 'cat/head/hint': 'Changed.'}, self.lessons)):
            with self.assertRaises(s.SafeError): s.check_bundle(self.bundle)
        identity = self.plan['entries']['cat/head/hint']
        receipt = self.directory / 'cache' / identity / 'receipt.json'
        value = json.loads(receipt.read_text())
        value['voiceId'] = 'wrong'
        receipt.write_text(json.dumps(value))
        with self.assertRaises(s.SafeError): s.check_bundle(self.bundle)

    def test_wrong_locale_or_missing_index_key_blocks_verification(self):
        descriptor = self.bundle / 'bundle.json'
        value = json.loads(descriptor.read_text())
        value['locale'] = 'en-GB'
        descriptor.write_text(json.dumps(value))
        with self.assertRaises(s.SafeError): s.check_bundle(self.bundle)
        value.pop('locale')
        descriptor.write_text(json.dumps(value))
        index = self.bundle / 'narration-index.json'
        value = json.loads(index.read_text())
        value.pop('cat/head/hint')
        index.write_text(json.dumps(value))
        with self.assertRaises(s.SafeError): s.check_bundle(self.bundle)

if __name__ == '__main__': unittest.main()
