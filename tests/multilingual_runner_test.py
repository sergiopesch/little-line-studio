import copy
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runner', 'scripts/multilingual-audio-runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def plan(self, locale='en-IE', code=None):
        voice = runner.APPROVED[locale]
        payload = {'model_id': 'eleven_v4', 'inputs': [{'voice_id': voice, 'text': 'Draw.'}]}
        if code is not None:
            payload['language_code'] = code
        request = {'kind': 'speech', 'path': '/v1/text-to-dialogue?output_format=mp3_44100_128',
                   'payload': payload, 'voiceId': voice, 'apiContractDate': 'fixture', 'encoding': {}}
        identity = runner.audio.sha(runner.audio.canonical(request))
        return {'locale': locale, 'voiceId': voice, 'entries': {'sample': identity},
                'requests': {identity: {**request, 'cacheKey': identity, 'estimatedUsd': '0'}}}

    def check(self, plan, texts, text_hash=None):
        with patch.object(runner.audio, 'catalogue_texts', return_value=texts), \
                patch.object(runner, 'validated_french_texts', return_value={'sample': 'Draw.'}):
            return runner.validate_plan(plan, runner.audio.sha(runner.audio.canonical(plan)), text_hash)

    def test_english_source_and_identity(self):
        plan = self.plan()
        self.assertEqual(self.check(plan, {'sample': 'Draw.'})[0], 'en-IE')
        with self.assertRaises(ValueError): self.check(plan, {'sample': 'Changed.'})
        with self.assertRaises(ValueError): self.check(plan, {'sample': 'Draw.', 'cat/head/hint': 'Hint.'})
        tampered = copy.deepcopy(plan)
        next(iter(tampered['requests'].values()))['payload']['inputs'][0]['text'] = 'Changed.'
        with self.assertRaises(ValueError): self.check(tampered, {'sample': 'Draw.'})
        with self.assertRaises(ValueError): runner.validate_plan(plan, '0' * 64)

    def test_french_requires_exact_source_export_digest_and_keyset(self):
        plan = self.plan('fr-FR', 'fr')
        texts = {'sample': 'Draw.'}
        with TemporaryDirectory() as directory, patch.object(runner, 'DIRECTORY', Path(directory)):
            (Path(directory) / 'french-frozen-texts.json').write_text(json.dumps(texts))
            digest = runner.audio.sha(runner.audio.canonical(texts))
            self.assertEqual(self.check(plan, texts, digest)[0], 'fr-FR')
            with self.assertRaises(ValueError): self.check(plan, texts, '0' * 64)
            with self.assertRaises(ValueError): self.check(plan, {'sample': 'English', 'cat/head/hint': 'Hint.'}, digest)


if __name__ == '__main__':
    unittest.main()
