import importlib.util
import copy
import contextlib
import io
import json
import shutil
import tempfile
import unittest
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('spanish_activation', 'scripts/activate-spanish-narration.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
b = a.base
real_catalogue_texts = a.catalogue_texts
TEXTS = {'sample': 'Hola.', 'cat/head/instruction': 'Dibuja un círculo.', 'cat/head/hint': 'Prueba una curva.',
         'cat/ear/instruction': 'Agrega una oreja.', 'cat/ear/hint': 'Prueba un triángulo.',
         'sun/face/instruction': 'Dibuja un sol.', 'sun/face/hint': 'Prueba una forma redonda.',
         'fish/body/instruction': 'Dibuja un pez.', 'fish/body/hint': 'Prueba un óvalo.'}
VOICE = 'gBXbHGNePmWl9WrdHoCH'
DATA = b'ID3' + b'fixture-speech' * 200

class SpanishActivationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patches = [patch.object(b, 'ROOT', self.root), patch.object(b, 'probe_mp3', return_value=1.234),
                        patch.object(a, 'catalogue_texts', return_value=TEXTS), patch.object(shutil, 'which', return_value='/fixture/ffprobe')]
        for item in self.patches: item.start()
        (self.root / '.gitignore').write_text('/media/elevenlabs/\n')
        (self.root / 'src').mkdir()
        (self.root / a.INDEX).write_text('{}\n')
        (self.root / a.DURATIONS).write_text('{}\n')
        (self.root / a.AVAILABILITY).write_bytes(b.json_bytes({'schemaVersion': 1, 'locale': a.LOCALE, 'lessons': []}))
        self.bundle = self.root / 'media/elevenlabs/bundles' / ('0' * 64)
        self.bundle.mkdir(parents=True)
        self.clips, self.requests = {}, {}
        for key, text in TEXTS.items(): self.clips[key] = self.clip(text)
        self.write_bundle()
        self.english = {}
        for name in ('narration-index.json', 'narration-durations.json', 'narration-manifest.json'):
            path = self.root / 'src' / name
            path.parent.mkdir(exist_ok=True)
            path.write_text('English must remain untouched\n')
            self.english[path] = path.read_bytes()
        self.existing = self.root / 'public/narration' / ('clip-' + b.sha(DATA) + '.mp3')
        self.existing.parent.mkdir(parents=True)
        self.existing.write_bytes(DATA)
        self.old = self.root / 'public/narration' / ('clip-' + 'f'*64 + '.mp3')
        self.old.write_bytes(b'old English audio')

    def tearDown(self):
        for item in reversed(self.patches): item.stop()
        self.temp.cleanup()

    def clip(self, text):
        digest = b.sha(DATA)
        source = f'/narration/clip-{digest}.mp3'
        path = self.bundle / 'assets' / source.lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(DATA)
        settings = {'inputs': [{'text': text, 'voice_id': VOICE}], 'model_id': 'eleven_v4', 'language_code': 'es'}
        request = {'kind': 'speech', 'path': '/v1/text-to-dialogue?output_format=mp3_44100_128',
                   'payload': settings, 'voiceId': VOICE, 'apiContractDate': '2026-10-26', 'encoding': b.ENCODING['narration']}
        identity = b.sha(b.canonical(request))
        self.requests[identity] = {**request, 'cacheKey': identity, 'estimatedUsd': '0'}
        receipt = {'status': 'complete', 'provider': 'ElevenLabs', 'cacheKey': identity,
                   'apiPath': request['path'], 'model': 'eleven_v4', 'voiceId': VOICE,
                   'sha256': digest, 'bytes': len(DATA), 'duration': 1.234}
        cache = self.root / 'media/elevenlabs/cache' / identity
        cache.mkdir(parents=True, exist_ok=True)
        (cache / 'receipt.json').write_bytes(b.json_bytes(receipt))
        (cache / 'normalised.mp3').write_bytes(DATA)
        return {'src': source, 'sha256': digest, 'bytes': len(DATA), 'duration': 1.234,
                'provider': 'ElevenLabs', 'provenance': 'verified-api-response', 'model': 'eleven_v4',
                'cacheKey': identity, 'encoding': b.ENCODING['narration'], 'generationSettings': settings,
                'text': text, 'voiceId': VOICE}

    def write_bundle(self):
        entries = {key: clip['cacheKey'] for key, clip in self.clips.items()}
        plan = {'schemaVersion': 1, 'providerRequested': 'ElevenLabs', 'locale': a.LOCALE, 'voiceId': VOICE,
                'entries': entries, 'requests': {key: self.requests[key] for key in set(entries.values())}}
        identity = b.sha(b.canonical(plan))
        target = self.bundle.parent / identity
        if target != self.bundle:
            self.bundle.rename(target); self.bundle = target
        header = {'schemaVersion': 1, 'provider': 'ElevenLabs', 'reviewStatus': 'unreviewed-staged-only',
                  'locale': a.LOCALE, 'voiceId': VOICE}
        (self.bundle / 'plan.json').write_bytes(b.json_bytes(plan))
        (self.bundle / 'bundle.json').write_bytes(b.json_bytes({**header, 'planHash': identity, 'speechKeys': len(entries), 'musicLevels': []}))
        (self.bundle / 'narration-manifest.json').write_bytes(b.json_bytes({**header, 'clips': self.clips}))
        (self.bundle / 'narration-index.json').write_bytes(b.json_bytes({key: clip['src'] for key, clip in self.clips.items()}))

    def assert_english_untouched(self):
        for path, data in self.english.items(): self.assertEqual(path.read_bytes(), data)
        self.assertEqual(self.existing.read_bytes(), DATA)
        self.assertEqual(self.old.read_bytes(), b'old English audio')

    def make_bundle_for(self, ids):
        self.clips = {key: self.clip(text) for key, text in TEXTS.items()
                      if key == 'sample' or key.split('/', 1)[0] in ids}
        self.write_bundle()

    def spanish_metadata(self):
        return {path: (self.root / path).read_bytes() if (self.root / path).exists() else None
                for path in (a.INDEX, a.DURATIONS, a.MANIFEST, a.AVAILABILITY)}

    def test_review_and_single_voice_required_before_work(self):
        with self.assertRaises(a.SafeError): a.activate(self.bundle, VOICE)
        with self.assertRaises(a.SafeError): a.activate(self.bundle, 'other-voice', True)
        self.assert_english_untouched()
        self.assertEqual(json.loads((self.root / a.INDEX).read_text()), {})

    def test_valid_complete_activation_does_not_change_english(self):
        result = a.activate(self.bundle, VOICE, True)
        self.assertEqual(result['status'], 'activated')
        self.assertEqual(json.loads((self.root / a.INDEX).read_text()), {k: v['src'] for k,v in self.clips.items()})
        self.assertEqual(json.loads((self.root / a.DURATIONS).read_text()),
                         {key: 1234 for key in TEXTS})
        manifest = json.loads((self.root / a.MANIFEST).read_text())
        self.assertEqual(manifest['selectedVoiceId'], VOICE)
        self.assertEqual(manifest['locale'], 'es-419')
        self.assertEqual(manifest['coveredLessons'], ['cat', 'fish', 'sun'])
        self.assertTrue(manifest['review']['operatorConfirmedReviewed'])
        self.assertEqual(json.loads((self.root / a.AVAILABILITY).read_text()),
                         {'schemaVersion': 1, 'locale': a.LOCALE, 'lessons': ['cat', 'fish', 'sun']})
        self.assert_english_untouched()

    def test_complete_catalogue_can_record_pending_human_review(self):
        result = a.activate(self.bundle, VOICE, full_catalogue_review_pending=True)
        self.assertEqual(result['coveredLessons'], ['cat', 'fish', 'sun'])
        self.assertFalse(result['partialCatalogue'])
        manifest = json.loads((self.root / a.MANIFEST).read_text())
        self.assertEqual(manifest['reviewStatus'], 'full-catalogue-review-pending')
        self.assertFalse(manifest['review']['operatorConfirmedReviewed'])
        self.assertEqual(manifest['review']['nativeSpeakerReview'], 'pending')
        self.assertEqual(manifest['review']['fullHumanListeningReview'], 'pending')
        journal = json.loads((self.root / result['backup'] / 'activation.json').read_text())
        self.assertTrue(journal['fullCatalogueReviewPending'])
        self.assertFalse(journal['operatorConfirmedReviewed'])
        self.assert_english_untouched()

    def test_pending_full_catalogue_rejects_partial_or_conflicting_modes(self):
        self.make_bundle_for(['cat'])
        before = self.spanish_metadata()
        with self.assertRaises(a.SafeError):
            a.activate(self.bundle, VOICE, full_catalogue_review_pending=True)
        with self.assertRaises(a.SafeError):
            a.activate(self.bundle, VOICE, full_catalogue_review_pending=True, lesson_ids=['cat'])
        with self.assertRaises(a.SafeError):
            a.activate(self.bundle, VOICE, True, full_catalogue_review_pending=True)
        self.assertEqual(self.spanish_metadata(), before)

    def test_approved_partial_records_exact_coverage_without_claiming_human_review(self):
        self.make_bundle_for(['cat'])
        cache_before = {p.relative_to(self.root): p.read_bytes()
                        for p in (self.root / 'media/elevenlabs/cache').rglob('*') if p.is_file()}
        result = a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
        self.assertTrue(result['partialCatalogue'])
        self.assertEqual(result['coveredLessons'], ['cat'])
        keys = {'sample', 'cat/head/instruction', 'cat/head/hint', 'cat/ear/instruction', 'cat/ear/hint'}
        index = json.loads((self.root / a.INDEX).read_text())
        durations = json.loads((self.root / a.DURATIONS).read_text())
        manifest = json.loads((self.root / a.MANIFEST).read_text())
        descriptor = json.loads((self.root / a.AVAILABILITY).read_text())
        self.assertEqual(set(index), keys)
        self.assertEqual(set(durations), keys)
        self.assertEqual(set(manifest['clips']), keys)
        self.assertEqual(descriptor, {'schemaVersion': 1, 'locale': a.LOCALE, 'lessons': ['cat']})
        self.assertEqual(manifest['coveredLessons'], ['cat'])
        self.assertEqual(manifest['reviewStatus'], 'user-approved-partial-release-review-pending')
        self.assertFalse(manifest['review']['operatorConfirmedReviewed'])
        self.assertTrue(manifest['review']['userApprovedPartialRelease'])
        self.assertEqual(manifest['review']['nativeSpeakerReview'], 'pending')
        self.assertEqual(manifest['review']['fullHumanListeningReview'], 'pending')
        self.assertIn('audio hashes, encoding and durations', manifest['review']['automatedChecks'])
        journal = json.loads((self.root / result['backup'] / 'activation.json').read_text())
        self.assertEqual(journal['status'], 'complete')
        self.assertEqual(journal['coveredLessons'], ['cat'])
        self.assertFalse(journal['operatorConfirmedReviewed'])
        self.assertTrue(journal['userApprovedPartialRelease'])
        self.assertEqual(journal['nativeSpeakerReview'], 'pending')
        self.assertEqual(journal['fullHumanListeningReview'], 'pending')
        self.assertEqual(journal['automatedChecks'], manifest['review']['automatedChecks'])
        self.assertEqual(set(journal['metadata']), {a.INDEX, a.DURATIONS, a.MANIFEST, a.AVAILABILITY})
        self.assertEqual(cache_before, {p.relative_to(self.root): p.read_bytes()
                                       for p in (self.root / 'media/elevenlabs/cache').rglob('*') if p.is_file()})
        self.assert_english_untouched()

    def test_partial_selection_requires_a_unique_known_proper_subset(self):
        self.make_bundle_for(['cat'])
        before = self.spanish_metadata()
        for ids in (None, [], ['cat', 'cat'], ['unknown'], ['cat', ' sun'], ['cat', 'sun', 'fish']):
            with self.subTest(ids=ids), self.assertRaises(a.SafeError):
                a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=ids)
            self.assertEqual(self.spanish_metadata(), before)
        with self.assertRaises(a.SafeError):
            a.activate(self.bundle, VOICE, True, partial_release_approved=True, lesson_ids=['cat'])
        with self.assertRaises(a.SafeError):
            a.activate(self.bundle, VOICE, True, lesson_ids=['cat'])
        self.assert_english_untouched()

    def test_cli_keeps_full_review_and_partial_approval_distinct(self):
        argv = ['activate-spanish-narration.py', '--bundle', 'bundle', '--voice-id', VOICE,
                '--partial-release-approved', '--lessons', 'sun,cat']
        with patch.object(sys, 'argv', argv), patch.object(a, 'activate', return_value={'status': 'fixture'}) as activate:
            with contextlib.redirect_stdout(io.StringIO()): a.main()
        activate.assert_called_once_with('bundle', VOICE, False, partial_release_approved=True, lesson_ids=['sun', 'cat'])
        for flags in ([], ['--reviewed', '--partial-release-approved']):
            with self.subTest(flags=flags), patch.object(sys, 'argv', argv[:5] + flags), \
                    patch.object(a, 'activate') as activate, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit): a.main()
                activate.assert_not_called()

    def test_partial_bundle_must_match_every_selected_key_exactly(self):
        before = self.spanish_metadata()
        for case in ('missing-sample', 'missing-hint', 'extra-lesson', 'changed-transcript'):
            with self.subTest(case=case):
                self.make_bundle_for(['cat', 'sun'] if case == 'extra-lesson' else ['cat'])
                if case == 'missing-sample': self.clips.pop('sample'); self.write_bundle()
                if case == 'missing-hint': self.clips.pop('cat/head/hint'); self.write_bundle()
                if case == 'changed-transcript':
                    self.clips['cat/head/instruction']['text'] = 'Texto cambiado.'; self.write_bundle()
                with self.assertRaises(a.SafeError):
                    a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
                self.assertEqual(self.spanish_metadata(), before)
        self.assert_english_untouched()

    def test_lesson_key_grouping_rejects_missing_samples_or_unpaired_stages(self):
        for texts in ({}, {'sample': ''}, {'sample': 'Hola.', 'cat/head/instruction': 'Dibuja.'},
                      {'sample': 'Hola.', 'cat/head/unknown': 'Texto.'}):
            with self.subTest(texts=texts), self.assertRaises(a.SafeError):
                a.lesson_keys(texts)

    def test_existing_lessons_cannot_be_withdrawn_and_cumulative_expansion_succeeds(self):
        self.make_bundle_for(['cat'])
        a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
        before = self.spanish_metadata()
        self.make_bundle_for(['sun'])
        with self.assertRaisesRegex(a.SafeError, 'cannot withdraw'):
            a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['sun'])
        self.assertEqual(self.spanish_metadata(), before)
        self.make_bundle_for(['cat', 'sun'])
        result = a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['sun', 'cat'])
        self.assertEqual(result['coveredLessons'], ['cat', 'sun'])
        self.assertEqual(json.loads((self.root / a.AVAILABILITY).read_text())['lessons'], ['cat', 'sun'])
        self.assertEqual(set(json.loads((self.root / a.INDEX).read_text())),
                         {'sample', 'cat/head/instruction', 'cat/head/hint', 'cat/ear/instruction', 'cat/ear/hint',
                          'sun/face/instruction', 'sun/face/hint'})
        self.assert_english_untouched()

    def test_inconsistent_previous_metadata_fails_closed(self):
        self.make_bundle_for(['cat'])
        a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
        valid = self.spanish_metadata()
        for case in ('duplicate', 'unknown', 'missing-key', 'missing-stage', 'duration', 'missing-manifest', 'asset', 'plan-hash', 'partial-flag'):
            with self.subTest(case=case):
                for path, data in valid.items(): (self.root / path).write_bytes(data)
                if case in ('duplicate', 'unknown'):
                    descriptor = json.loads(valid[a.AVAILABILITY])
                    descriptor['lessons'] = ['cat', 'cat'] if case == 'duplicate' else ['unknown']
                    (self.root / a.AVAILABILITY).write_bytes(b.json_bytes(descriptor))
                if case == 'missing-key':
                    index = json.loads(valid[a.INDEX]); index.pop('cat/head/hint')
                    (self.root / a.INDEX).write_bytes(b.json_bytes(index))
                if case == 'missing-stage':
                    index, durations, manifest = (json.loads(valid[path]) for path in (a.INDEX, a.DURATIONS, a.MANIFEST))
                    for key in ('cat/ear/instruction', 'cat/ear/hint'):
                        index.pop(key); durations.pop(key); manifest['clips'].pop(key)
                    (self.root / a.INDEX).write_bytes(b.json_bytes(index))
                    (self.root / a.DURATIONS).write_bytes(b.json_bytes(durations))
                    (self.root / a.MANIFEST).write_bytes(b.json_bytes(manifest))
                if case == 'duration':
                    durations = json.loads(valid[a.DURATIONS]); durations['sample'] = 1
                    (self.root / a.DURATIONS).write_bytes(b.json_bytes(durations))
                if case == 'missing-manifest': (self.root / a.MANIFEST).unlink()
                if case in ('plan-hash', 'partial-flag'):
                    manifest = json.loads(valid[a.MANIFEST])
                    if case == 'plan-hash': manifest['sourcePlanHash'] = 'invalid'
                    else: manifest['partialCatalogue'] = False
                    (self.root / a.MANIFEST).write_bytes(b.json_bytes(manifest))
                if case == 'asset': self.existing.write_bytes(b'tampered')
                with self.assertRaises(a.SafeError):
                    a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
                if case == 'asset': self.existing.write_bytes(DATA)
        self.assert_english_untouched()

    def test_runtime_and_source_linked_export_must_match_in_all_fields(self):
        (self.root / 'src/spanish-narration-sample.txt').write_text('Hola.\n')
        runtime = {'count': 30, 'lessons': {'cat': {'title': 'Gato'}},
                   'texts': {'cat/head/instruction': 'Dibuja.', 'cat/head/hint': 'Prueba.'}}
        export = {**runtime, 'locale': a.LOCALE,
                  'reviewStatus': 'assistant-reviewed-awaiting-native-human-review'}
        outputs = lambda first, second: [json.dumps(first), json.dumps(second)]
        with patch.object(a.subprocess, 'check_output', side_effect=outputs(runtime, export)):
            self.assertEqual(real_catalogue_texts()['cat/head/instruction'], 'Dibuja.')
        for section in ('lessons', 'texts'):
            changed = copy.deepcopy(export)
            if section == 'lessons': changed['lessons']['cat']['title'] = 'Otro gato'
            else: changed['texts']['cat/head/hint'] = 'Otro texto.'
            with self.subTest(section=section), patch.object(a.subprocess, 'check_output', side_effect=outputs(runtime, changed)):
                with self.assertRaises(a.SafeError): real_catalogue_texts()

    def test_failed_metadata_recovery_retains_new_audio_for_manual_recovery(self):
        self.make_bundle_for(['cat'])
        self.existing.unlink()
        original = b.atomic_write
        def fail_duration(path, data, mode=0o644):
            if path == self.root / a.DURATIONS: raise OSError('simulated write and recovery failure')
            return original(path, data, mode)
        with patch.object(b, 'atomic_write', side_effect=fail_duration):
            with self.assertRaisesRegex(a.SafeError, 'recovery is incomplete'):
                a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
        self.assertEqual(self.existing.read_bytes(), DATA)
        journals = list((self.root / 'media/elevenlabs/spanish-activation-backups').glob('*/activation.json'))
        self.assertEqual(json.loads(journals[0].read_text())['status'], 'recovery-required')
        with self.assertRaisesRegex(a.SafeError, 'requires recovery'):
            a.activate(self.bundle, VOICE, partial_release_approved=True, lesson_ids=['cat'])
        for path, data in self.english.items(): self.assertEqual(path.read_bytes(), data)

    def test_preparation_failures_leave_no_orphan_and_allow_retry(self):
        before = self.spanish_metadata()
        cache = self.root / 'media/elevenlabs/cache'
        cache_before = {p.relative_to(cache): p.read_bytes() for p in cache.rglob('*') if p.is_file()}
        backups = self.root / 'media/elevenlabs/spanish-activation-backups'
        original = b.atomic_write
        for failure in ('initial-journal', 'first-snapshot', 'later-snapshot', 'prepared-journal'):
            snapshot_writes = 0
            failed = False
            def interrupt(path, data, mode=0o644):
                nonlocal snapshot_writes, failed
                inside_backup = 'spanish-activation-backups' in path.parts
                if inside_backup and path.name == 'activation.json':
                    status = json.loads(data)['status']
                    if (failure == 'initial-journal' and status == 'preparing' or
                            failure == 'prepared-journal' and status == 'prepared'):
                        failed = True
                        raise OSError('simulated journal failure')
                if inside_backup and 'metadata' in path.parts:
                    snapshot_writes += 1
                    if (failure == 'first-snapshot' and snapshot_writes == 1 or
                            failure == 'later-snapshot' and snapshot_writes == 2):
                        failed = True
                        raise OSError('simulated snapshot failure')
                return original(path, data, mode)
            with self.subTest(failure=failure), patch.object(b, 'atomic_write', side_effect=interrupt):
                with self.assertRaisesRegex(a.SafeError, 'previous state is unchanged'):
                    a.activate(self.bundle, VOICE, True)
            self.assertTrue(failed)
            self.assertEqual(self.spanish_metadata(), before)
            self.assertEqual(list(backups.iterdir()), [])
            self.assertEqual(cache_before, {p.relative_to(cache): p.read_bytes() for p in cache.rglob('*') if p.is_file()})
            self.assert_english_untouched()
            a.require_clean_journals()
        self.assertEqual(a.activate(self.bundle, VOICE, True)['status'], 'activated')

    def test_interrupted_preparation_journals_original_state_and_blocks_retry(self):
        class SimulatedInterruption(BaseException):
            pass
        before = self.spanish_metadata()
        original = b.atomic_write
        def interrupt(path, data, mode=0o644):
            if 'spanish-activation-backups' in path.parts and 'metadata' in path.parts:
                raise SimulatedInterruption()
            return original(path, data, mode)
        with patch.object(b, 'atomic_write', side_effect=interrupt):
            with self.assertRaises(SimulatedInterruption):
                a.activate(self.bundle, VOICE, True)
        journals = list((self.root / 'media/elevenlabs/spanish-activation-backups').glob('*/activation.json'))
        self.assertEqual(len(journals), 1)
        journal = json.loads(journals[0].read_text())
        self.assertEqual(journal['status'], 'preparing')
        self.assertEqual(journal['newAssets'], [])
        self.assertEqual(journal['metadata'], {
            path: {'existed': data is not None, 'sha256': b.sha(data) if data is not None else None}
            for path, data in before.items()
        })
        self.assertEqual(self.spanish_metadata(), before)
        self.assert_english_untouched()
        with self.assertRaisesRegex(a.SafeError, 'requires recovery'):
            a.activate(self.bundle, VOICE, True)

    def test_preparation_cleanup_failure_retains_journal_and_blocks_retry(self):
        before = self.spanish_metadata()
        original = b.atomic_write
        def interrupt(path, data, mode=0o644):
            if 'spanish-activation-backups' in path.parts and 'metadata' in path.parts:
                raise OSError('simulated snapshot failure')
            return original(path, data, mode)
        with patch.object(b, 'atomic_write', side_effect=interrupt), patch.object(shutil, 'rmtree', side_effect=OSError('simulated cleanup failure')):
            with self.assertRaisesRegex(a.SafeError, 'inspect the retained backup'):
                a.activate(self.bundle, VOICE, True)
        journals = list((self.root / 'media/elevenlabs/spanish-activation-backups').glob('*/activation.json'))
        self.assertEqual(json.loads(journals[0].read_text())['status'], 'preparing')
        self.assertEqual(self.spanish_metadata(), before)
        self.assert_english_untouched()
        with self.assertRaisesRegex(a.SafeError, 'requires recovery'):
            a.activate(self.bundle, VOICE, True)

    def test_journal_less_backup_blocks_activation_with_recovery_guidance(self):
        orphan = self.root / 'media/elevenlabs/spanish-activation-backups/orphan'
        orphan.mkdir(parents=True)
        before = self.spanish_metadata()
        with self.assertRaisesRegex(a.SafeError, 'no journal; inspect it'):
            a.activate(self.bundle, VOICE, True)
        self.assertEqual(self.spanish_metadata(), before)
        self.assert_english_untouched()

    def test_generator_bundle_activates_and_english_validator_remains_strict(self):
        generator_spec = importlib.util.spec_from_file_location('generator', 'scripts/elevenlabs-audio.py')
        generator = importlib.util.module_from_spec(generator_spec)
        generator_spec.loader.exec_module(generator)
        args = SimpleNamespace(model_id='eleven_v4', voice_id=VOICE, music_seconds=90,
                               kind='speech', sample_only=False, lessons=None, locale='es-419')
        plan = generator.make_plan(args, TEXTS)
        plan.update(locale='es-419', voiceId=VOICE)
        records = {}
        for identity, request in plan['requests'].items():
            self.assertEqual(request['payload']['language_code'], 'es')
            cache = self.root/'media/elevenlabs/cache'/identity
            cache.mkdir(parents=True, exist_ok=True)
            receipt = {'status': 'complete', 'provider': 'ElevenLabs', 'cacheKey': identity,
                       'apiPath': request['path'], 'model': 'eleven_v4', 'voiceId': VOICE,
                       'sha256': b.sha(DATA), 'bytes': len(DATA), 'duration': 1.234}
            (cache/'receipt.json').write_bytes(b.json_bytes(receipt))
            (cache/'normalised.mp3').write_bytes(DATA)
            records[identity] = receipt
        descriptor = generator.build_bundle(self.root/'media/elevenlabs', plan, records)
        self.assertEqual(a.activate(descriptor, VOICE, True)['status'], 'activated')
        manifest = json.loads((self.root/a.MANIFEST).read_text())
        self.assertEqual(manifest['clips']['sample']['generationSettings']['language_code'], 'es')
        self.assert_english_untouched()
        sample = manifest['clips']['sample']
        request = plan['requests'][plan['entries']['sample']]
        # Unmodified English validation still rejects the Spanish-only field.
        with self.assertRaises(a.SafeError): a.checked_english_request(sample, request, 'narration')
        without_language = {**request['payload']}; without_language.pop('language_code')
        english_clip = {**sample, 'generationSettings': without_language}
        english_request = {**request, 'payload': without_language}
        a.checked_english_request(english_clip, english_request, 'narration')
        for code in (None, 'en', 'es-MX'):
            altered = {**request['payload'], 'language_code': code}
            with self.assertRaises(a.SafeError):
                a.checked_spanish_request({**sample, 'generationSettings': altered}, {**request, 'payload': altered}, 'narration')

    def test_transcript_key_request_receipt_and_audio_changes_rejected(self):
        cases = ('missing', 'transcript', 'voice', 'receipt', 'audio', 'index', 'locale', 'plan', 'duration')
        for case in cases:
            with self.subTest(case=case):
                # Restore all fixture inputs between mutations.
                self.clips = {key: self.clip(text) for key,text in TEXTS.items()}; self.write_bundle()
                if case == 'missing': self.clips.pop('cat/head/hint'); self.write_bundle()
                elif case == 'transcript':
                    self.clips['cat/head/hint']['text'] = 'Distinto'; self.write_bundle()
                elif case == 'voice':
                    self.clips['cat/head/hint']['voiceId'] = 'other'; self.write_bundle()
                elif case == 'receipt':
                    receipt = self.root / 'media/elevenlabs/cache' / self.clips['sample']['cacheKey'] / 'receipt.json'
                    value = json.loads(receipt.read_text()); value['voiceId'] = 'other'; receipt.write_bytes(b.json_bytes(value))
                elif case == 'audio': (self.bundle / 'assets' / self.clips['sample']['src'].lstrip('/')).write_bytes(b'tampered')
                elif case == 'index': (self.bundle / 'narration-index.json').write_text('{}')
                elif case == 'locale':
                    path = self.bundle / 'bundle.json'; value = json.loads(path.read_text()); value['locale'] = 'en'; path.write_bytes(b.json_bytes(value))
                elif case == 'plan':
                    path = self.bundle / 'plan.json'; value = json.loads(path.read_text()); value['requests'][self.clips['sample']['cacheKey']]['payload']['model_id'] = 'changed'; path.write_bytes(b.json_bytes(value))
                elif case == 'duration':
                    self.clips['sample']['duration'] = 2.0; self.write_bundle()
                with self.assertRaises(a.SafeError): a.activate(self.bundle, VOICE, True)
                self.assert_english_untouched()
                self.assertEqual(json.loads((self.root / a.INDEX).read_text()), {})

    def test_destination_collision_and_symlink_rejected(self):
        self.existing.write_bytes(b'not matching digest')
        with self.assertRaises(a.SafeError): a.activate(self.bundle, VOICE, True)
        self.existing.write_bytes(DATA)
        (self.root / a.INDEX).unlink()
        (self.root / a.INDEX).symlink_to(self.root / 'src/narration-index.json')
        with self.assertRaises(a.SafeError): a.activate(self.bundle, VOICE, True)
        self.assert_english_untouched()

    def test_failure_restores_spanish_metadata_and_leaves_english_unchanged(self):
        a.activate(self.bundle, VOICE, True)
        before = self.spanish_metadata()
        original = b.atomic_write
        for target in (a.INDEX, a.DURATIONS, a.MANIFEST, a.AVAILABILITY):
            failed = False
            def interrupt(path, data, mode=0o644):
                nonlocal failed
                if path == self.root/target and not failed:
                    failed = True
                    raise OSError('simulated write failure')
                return original(path, data, mode)
            with self.subTest(target=target), patch.object(b, 'atomic_write', side_effect=interrupt):
                with self.assertRaises(a.SafeError): a.activate(self.bundle, VOICE, True)
            self.assertTrue(failed)
            self.assertEqual(self.spanish_metadata(), before)
        self.assert_english_untouched()
        backups = list((self.root/'media/elevenlabs/spanish-activation-backups').glob('*/activation.json'))
        self.assertEqual(sorted(json.loads(path.read_text())['status'] for path in backups),
                         ['complete', 'rolled-back', 'rolled-back', 'rolled-back', 'rolled-back'])

    def test_failure_removes_only_newly_created_content_addressed_assets(self):
        self.existing.unlink()
        original = b.atomic_write
        failed = False
        def interrupt(path, data, mode=0o644):
            nonlocal failed
            if path == self.root/a.INDEX and not failed:
                failed = True
                raise OSError('simulated metadata failure')
            return original(path, data, mode)
        with patch.object(b, 'atomic_write', side_effect=interrupt):
            with self.assertRaises(a.SafeError): a.activate(self.bundle, VOICE, True)
        self.assertFalse(self.existing.exists())
        self.assertEqual(self.old.read_bytes(), b'old English audio')
        for path, data in self.english.items(): self.assertEqual(path.read_bytes(), data)

if __name__ == '__main__': unittest.main(verbosity=2)
