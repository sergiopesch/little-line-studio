#!/usr/bin/env python3
"""Offline Irish plan and validation contract tests."""
import importlib.util
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('irish_narration', root / 'scripts/irish-narration.py')
irish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(irish)
budget_spec = importlib.util.spec_from_file_location('budget', root / 'scripts/elevenlabs_credit_budget.py')
budget = importlib.util.module_from_spec(budget_spec)
budget_spec.loader.exec_module(budget)


class IrishNarrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, cls.texts = irish.make_plan()

    def test_full_source_plan_is_deterministic_and_bound(self):
        second, texts = irish.make_plan()
        self.assertEqual(second, self.plan)
        self.assertEqual(texts, self.texts)
        self.assertEqual(self.plan['locale'], 'en-IE')
        self.assertEqual(self.plan['voiceId'], irish.VOICE)
        self.assertEqual(len(self.plan['entries']), 1461)
        self.assertEqual(set(self.plan['entries']), set(self.texts))
        self.assertEqual(set(self.plan['entries'].values()), set(self.plan['requests']))
        self.assertEqual(len({key.split('/')[0] for key in self.texts if key != 'sample'}), 30)
        for key, identity in self.plan['entries'].items():
            request = self.plan['requests'][identity]
            self.assertEqual(request['cacheKey'], identity)
            self.assertEqual(identity, irish.generator.sha(irish.generator.canonical({
                k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')})))
            self.assertEqual(request['payload'], {'inputs': [{'text': self.texts[key], 'voice_id': irish.VOICE}],
                                                  'model_id': 'eleven_v4'})
            guard = budget.CreditBudget.__new__(budget.CreditBudget)
            guard.rate = Decimal('1')
            self.assertEqual(guard._reservation(request['path'], request['payload']),
                             (len(self.texts[key]), 'speech'))
        self.assertEqual(irish.plan_summary(self.plan)['conservativeCreditsAtOnePerCharacter'],
                         sum(len(irish.generator.speech_text(s)) for s in self.plan['requests'].values()))

    def test_request_validator_rejects_wrong_voice_language_and_payload(self):
        request = self.plan['requests'][self.plan['entries']['sample']]
        clip = {'voiceId': irish.VOICE, 'model': 'eleven_v4', 'text': self.texts['sample'],
                'encoding': request['encoding'], 'generationSettings': request['payload']}
        irish.checked_irish_request(clip, request, 'narration')
        for mutated in [dict(clip, voiceId='wrong'), dict(clip, model='eleven_v3'),
                        dict(clip, generationSettings={**request['payload'], 'language_code': 'es'}),
                        dict(clip, text='changed')]:
            with self.subTest(mutated=mutated), self.assertRaises(irish.SafeError):
                irish.checked_irish_request(mutated, request, 'narration')

    def test_missing_receipt_never_dispatches(self):
        with patch.object(irish.generator, 'cached_record', return_value=None), \
             patch.object(irish.generator, 'generate_one') as dispatch:
            with self.assertRaises(irish.SafeError):
                irish.make_bundle()
            dispatch.assert_not_called()

    def test_stale_plan_rejected_before_asset_validation(self):
        fake_bundle = root / 'media/elevenlabs/bundles' / ('a' * 64)
        with patch.object(irish.validator, 'bundle_directory', return_value=fake_bundle), \
             patch.object(irish.validator, 'read_json', return_value={'locale': 'en-IE'}), \
             patch.object(irish.validator, 'prepare_bundle') as prepare:
            with self.assertRaises(irish.SafeError):
                irish.validate_bundle(fake_bundle)
            prepare.assert_not_called()


if __name__ == '__main__':
    unittest.main()
