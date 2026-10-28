import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mastering', ROOT / 'scripts/master-short-narration.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class ShortNarrationMastering(unittest.TestCase):
    def setUp(self):
        clip = json.loads((ROOT / 'src/narration-manifest.fr-FR.json').read_text())['clips']['owl/owl-body/hint']
        self.source = clip.get('source', clip)
        self.path = ROOT / 'public' / self.source['src'].lstrip('/')

    def test_quiet_short_speech_reaches_loudness_without_changing_its_length(self):
        before = m.measure(self.path)
        self.assertLess(before['integratedLufs'], -26)
        with tempfile.TemporaryDirectory() as temp:
            clip, data = m.derive(self.path.read_bytes(), self.source, before, Path(temp))
            output = Path(temp) / 'result.mp3'; output.write_bytes(data)
            after = m.measure(output)
            self.assertLessEqual(abs(after['integratedLufs'] + 20), 0.5)
            self.assertLessEqual(after['truePeakDbtp'], -2)
            self.assertEqual(len(m.pcm(output)), len(m.pcm(self.path)))
            self.assertEqual(clip['text'], self.source['text'])
            self.assertEqual(clip['cacheKey'], self.source['cacheKey'])
            self.assertEqual(clip['source'], self.source)
            self.assertEqual(m.sha(data), clip['sha256'])

    def test_tampered_cached_source_or_provider_response_cannot_be_used(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); folder = root / 'media/elevenlabs/cache' / self.source['cacheKey']
            folder.mkdir(parents=True); data = self.path.read_bytes()
            receipt = {key: self.source[key] for key in ('provider', 'cacheKey', 'voiceId', 'model', 'sha256', 'bytes')}
            receipt.update(status='complete', rawSha256=m.sha(data))
            (folder / 'receipt.json').write_text(json.dumps(receipt))
            for name in ('normalised.mp3', 'raw.mp3'): (folder / name).write_bytes(data)
            self.assertEqual(m.original_response(root, self.source)[0], data)
            for name in ('normalised.mp3', 'raw.mp3'):
                (folder / name).write_bytes(b'altered')
                with self.assertRaises(ValueError): m.original_response(root, self.source)
                (folder / name).write_bytes(data)
            receipt['voiceId'] = 'different-voice'
            (folder / 'receipt.json').write_text(json.dumps(receipt))
            with self.assertRaises(ValueError): m.original_response(root, self.source)


if __name__ == '__main__': unittest.main()
