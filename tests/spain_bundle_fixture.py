"""Offline synthetic Spain bundle tests; never uses credentials or provider APIs."""
import importlib.util
import json
import shutil
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('spain_bundle', ROOT / 'scripts/spain-narration.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),
                     'synthetic audio fixtures require ffmpeg and ffprobe')
class SpainBundleFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='spain-bundle-test-')
        self.root = Path(self.tmp.name)
        (self.root / '.gitignore').write_text('/media/elevenlabs/\n')
        self.directory = self.root / 'media/elevenlabs'
        self.directory.mkdir(parents=True)
        self.old_root, self.old_activation_root = m.ROOT, m.activation.ROOT
        self.old_source, self.old_plan = m.frozen_source, m.planner.full_plans
        m.ROOT = self.root; m.activation.ROOT = self.root
        text = 'Hola, vamos a dibujar juntos.'
        args = SimpleNamespace(model_id=m.MODEL, voice_id=m.VOICE, music_seconds=120,
                               sample_only=True, lessons=None, kind='speech', locale=m.LOCALE)
        self.plan = m.generator.make_plan(args, {'sample': text})
        old = next(iter(self.plan['requests'].values()))
        request = {**old, 'payload': {**old['payload'], 'language_code': 'es'}}
        identity_spec = {k:v for k,v in request.items() if k not in ('cacheKey', 'estimatedUsd')}
        self.identity = m.generator.sha(m.generator.canonical(identity_spec))
        request['cacheKey'] = self.identity
        self.plan.update(locale=m.LOCALE, voiceId=m.VOICE, entries={'sample': self.identity},
                         requests={self.identity:request})
        self.request = request
        m.frozen_source = lambda: ({'sample': text}, ['cat'])
        m.planner.full_plans = lambda: [self.plan]
        folder = self.directory / 'cache' / self.identity
        folder.mkdir(parents=True)
        audio = folder / 'normalised.mp3'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1',
                        '-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','128k',str(audio)], check=True)
        data=audio.read_bytes(); (folder/'raw.mp3').write_bytes(data)
        duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration',
                                                 '-of','default=noprint_wrappers=1:nokey=1',str(audio)],text=True))
        self.receipt={'cacheKey':self.identity,'status':'complete','provider':'ElevenLabs',
                      'apiPath':request['path'],'model':m.MODEL,'voiceId':m.VOICE,'rawSha256':m.generator.sha(data),
                      'sha256':m.generator.sha(data),'bytes':len(data),'duration':round(duration,3)}
        m.generator.write_json(folder/'receipt.json',self.receipt)
        self.plan_hash = m.generator.sha(m.generator.canonical(self.plan))
        self.bundle=m.generator.build_bundle(self.directory,self.plan,{self.identity:self.receipt}).parent

    def tearDown(self):
        m.ROOT, m.activation.ROOT = self.old_root, self.old_activation_root
        m.frozen_source, m.planner.full_plans = self.old_source, self.old_plan
        m.activation.checked_request, m.activation.checked_receipt = m._base_request, m._base_receipt
        self.tmp.cleanup()

    def test_stage_complete_synthetic_bundle_and_decode(self):
        result=m.stage_release(self.root, str(self.bundle), self.plan_hash); dest=Path(result['stage'])
        manifest=json.loads((dest/'src/narration-manifest.es-ES.json').read_text())
        self.assertEqual(manifest['review']['nativeSpeakerReview'],'pending')
        self.assertEqual(manifest['review']['fullHumanListeningReview'],'pending')
        self.assertEqual(manifest['clips']['sample']['generationSettings']['language_code'],'es')
        self.assertEqual(len(list((dest/'public/narration').glob('*.mp3'))),1)
        with self.assertRaises(m.SafeError): m.stage_release(self.root, str(self.bundle), self.plan_hash)

    def test_wrong_language_is_rejected(self):
        clip=json.loads((self.bundle/'narration-manifest.json').read_text())['clips']['sample']
        wrong={**self.request, 'payload':{**self.request['payload'],'language_code':'fr'}}
        with self.assertRaises(m.SafeError): m.checked_spain_request(clip,wrong,'narration')

    def test_activation_writes_review_pending_and_preserves_recovery_journal(self):
        result=m.activate_release(self.root, str(self.bundle), self.plan_hash)
        manifest=json.loads((self.root/'src/narration-manifest.es-ES.json').read_text())
        availability=json.loads((self.root/'src/narration-availability.es-ES.json').read_text())
        journal=json.loads((Path(result['backup'])/'activation.json').read_text())
        self.assertEqual(availability['lessons'],['cat'])
        self.assertEqual(manifest['review']['nativeSpeakerReview'],'pending')
        self.assertFalse(manifest['review']['operatorConfirmedReviewed'])
        self.assertEqual(journal['status'],'complete')
        self.assertEqual(len(list((self.root/'public/narration').glob('*.mp3'))),1)

    def test_activation_failure_restores_prior_availability(self):
        target=self.root/'src/narration-availability.es-ES.json';target.parent.mkdir(exist_ok=True)
        original=b'{"schemaVersion":1,"locale":"es-ES","lessons":[]}\n';target.write_bytes(original)
        real=m.activation.atomic_write; fault={'used':False}
        def fail_once(path,data,mode=0o644):
            if path==target and not fault['used']:
                fault['used']=True;raise OSError('synthetic write failure')
            return real(path,data,mode)
        with patch.object(m.activation,'atomic_write',side_effect=fail_once):
            with self.assertRaises(m.SafeError): m.activate_release(self.root, str(self.bundle), self.plan_hash)
        self.assertEqual(target.read_bytes(),original)
        self.assertEqual(len(list((self.root/'public/narration').glob('*.mp3'))),0)
        journals=list((self.directory/'spain-activation-backups').glob('*/activation.json'))
        self.assertEqual(json.loads(journals[0].read_text())['status'],'rolled-back')

    def test_corrupt_raw_receipt_is_rejected(self):
        (self.directory/'cache'/self.identity/'raw.mp3').write_bytes(b'corrupt')
        with self.assertRaises(m.SafeError): m.check_bundle(self.root, str(self.bundle), self.plan_hash)

    def test_invalid_audio_fails_full_decode(self):
        path = self.bundle / 'assets/narration/bad.mp3'
        path.write_bytes(b'not an mp3')
        with self.assertRaises(m.SafeError):
            m.decode_assets({'/narration/bad.mp3': {'data': b'not an mp3'}})

    def test_missing_receipt_is_rejected(self):
        (self.directory/'cache'/self.identity/'receipt.json').unlink()
        with self.assertRaises(m.SafeError): m.check_bundle(self.root, str(self.bundle), self.plan_hash)

    def test_wrong_frozen_hash_is_rejected(self):
        with self.assertRaises(m.SafeError): m.check_bundle(self.root, str(self.bundle), '0' * 64)

    def test_changed_plan_is_rejected(self):
        path=self.bundle/'plan.json'; changed=json.loads(path.read_text()); changed['locale']='es-419'
        m.generator.write_json(path,changed)
        with self.assertRaises(m.SafeError): m.check_bundle(self.root, str(self.bundle), self.plan_hash)

if __name__ == '__main__': unittest.main()
