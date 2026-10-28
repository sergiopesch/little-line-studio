#!/usr/bin/env python3
"""Run an approved locale plan through one existing, reconciled credit ledger.

Plans and text are prepared separately. This runner serializes catalogue runs,
rechecks request identities and provider access, and never retries a paid POST.
It only stages audio; activation and publication are separate operations.
"""
import argparse
from decimal import Decimal
import fcntl
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from elevenlabs_credit_budget import CreditBudget, CreditBudgetError

spec = importlib.util.spec_from_file_location('audio_generator', ROOT / 'scripts/elevenlabs-audio.py')
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)

APPROVED = {'en-IE': 't6WJWTYTryhcQnrBHdCr',
            'en-GB-x-scotland': 'M6KCOw7VXEJAZwuYFLuz',
            'fr-FR': 'tKaoyJLW05zqV0tIH9FD'}
DIRECTORY = ROOT / 'media/elevenlabs'
LEDGER = DIRECTORY / 'multilingual-account-ledger.json'
CAP = 560000


def validated_french_texts():
    try:
        result = subprocess.check_output(['node', 'scripts/export-reviewed-french.mjs'], cwd=ROOT,
                                         text=True, stderr=subprocess.PIPE, timeout=40)
        source = json.loads(result)
        runtime = json.loads((ROOT / 'src/french-lessons.fr-FR.json').read_text())
        sample = (ROOT / 'src/narration-sample.fr-FR.txt').read_text().strip()
        if (source.get('locale') != 'fr-FR' or source.get('count') != 30 or
                source.get('reviewStatus') != 'assistant-reviewed-awaiting-native-human-review' or
                runtime.get('lessons') != source.get('lessons') or not sample):
            raise ValueError
        return {'sample': sample, **source['texts']}
    except (OSError, KeyError, TypeError, ValueError, subprocess.SubprocessError):
        raise ValueError('The current French source and runtime catalogue could not be verified.') from None


def validate_plan(plan, expected_hash, french_text_hash=None):
    if audio.sha(audio.canonical(plan)) != expected_hash:
        raise ValueError('The plan hash does not match the approved frozen input.')
    locale = plan.get('locale')
    voice = APPROVED.get(locale)
    if not voice or plan.get('voiceId') != voice:
        raise ValueError('The plan does not match an approved locale and voice.')
    entries, requests = plan.get('entries'), plan.get('requests')
    if not isinstance(entries, dict) or not isinstance(requests, dict) or not entries or not requests:
        raise ValueError('The plan must contain a complete request catalogue.')
    if locale == 'fr-FR':
        text_path = DIRECTORY / 'french-frozen-texts.json'
        if not text_path.is_file():
            raise ValueError('The validated frozen French text catalogue is missing.')
        expected_texts = json.loads(text_path.read_text())
        if (not french_text_hash or expected_texts != validated_french_texts() or
                audio.sha(audio.canonical(expected_texts)) != french_text_hash or
                not isinstance(expected_texts, dict) or set(expected_texts) != set(audio.catalogue_texts('en-GB'))):
            raise ValueError('French text must match its frozen digest and every current lesson key.')
    else:
        expected_texts = audio.catalogue_texts('en-GB')
    if not isinstance(expected_texts, dict) or set(entries) != set(expected_texts):
        raise ValueError('The plan does not match the current complete lesson keys.')
    if set(entries.values()) != set(requests):
        raise ValueError('The plan has missing or unused requests.')
    for key, identity in entries.items():
        request = requests.get(identity)
        if not isinstance(request, dict) or not re.fullmatch(r'[a-f0-9]{64}', identity):
            raise ValueError('A planned request is missing or malformed.')
        original = {k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')}
        payload = request.get('payload', {})
        if (request.get('cacheKey') != identity or audio.sha(audio.canonical(original)) != identity or
                request.get('kind') != 'speech' or request.get('voiceId') != voice or
                request.get('path') != '/v1/text-to-dialogue?output_format=mp3_44100_128' or
                payload.get('model_id') != 'eleven_v4' or len(payload.get('inputs', [])) != 1 or
                payload['inputs'][0].get('voice_id') != voice):
            raise ValueError('A request does not match its canonical approved identity.')
        code = payload.get('language_code')
        if code not in ({'fr'} if locale == 'fr-FR' else {None, 'en'}):
            raise ValueError('A request has an unexpected provider language code.')
        if audio.speech_text(request) != expected_texts[key]:
            raise ValueError('A planned transcript differs from the approved authored lesson.')
    return locale, voice


def run(plan, expected_hash, french_text_hash=None):
    locale, voice = validate_plan(plan, expected_hash, french_text_hash)
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise ValueError('Both ffmpeg and ffprobe are required before any paid request.')
    if not LEDGER.is_file():
        raise ValueError('The reconciled shared account ledger is missing.')
    client = audio.APIClient(audio.load_key(ROOT / '.env.elevenlabs.local'))
    voices = client.voices(voice)
    if not any(v.get('voice_id') == voice for v in voices):
        raise ValueError('The approved voice is unavailable in the account.')
    models = client.call('/v1/models')
    model = next((m for m in models if m.get('model_id') == 'eleven_v4'), None)
    if not model or not model.get('can_do_text_to_speech'):
        raise ValueError('The selected model is not available for speech.')
    rate = Decimal(str(model.get('model_rates', {}).get('character_cost_multiplier', 1)))
    if rate > 1:
        raise ValueError('The provider rate exceeds the conservative credit ceiling.')
    budget = CreditBudget(client, LEDGER, max_credits=CAP, credit_ceiling=Decimal('1'))
    existing = {key: audio.cached_record(DIRECTORY, key) for key in plan['requests']}
    missing = [value for key, value in plan['requests'].items() if existing[key] is None]
    required = sum(len(audio.speech_text(item)) for item in missing)
    budget.preflight(required)
    records = {key: audio.generate_one(client, DIRECTORY, plan['requests'][key])
               for key, value in existing.items() if value is not None}
    for offset in range(0, len(missing), 3):
        if (DIRECTORY / '.stop-after-batch').exists():
            print(json.dumps({'mode': 'safely-paused', 'locale': locale, 'prepared': len(records)}), flush=True)
            return
        group = missing[offset:offset+3]
        records.update(audio.generate_batch(lambda: audio.APIClient(client.key), DIRECTORY, group, budget))
        if (offset // 3) % 10 == 0 or offset + len(group) == len(missing):
            print(json.dumps({'locale': locale, 'prepared': len(records), 'total': len(plan['requests']),
                              'credits': budget.snapshot()}), flush=True)
    descriptor = audio.build_bundle(DIRECTORY, plan, records)
    # The generic generator only labels Spanish bundles. Label the assembled
    # immutable plan's locale explicitly, without asserting human review.
    for name in ('bundle.json', 'narration-manifest.json'):
        path = descriptor.parent / name
        value = json.loads(path.read_text())
        value.update(locale=locale, voiceId=voice)
        audio.write_json(path, value)
    print(json.dumps({'mode': 'staged-unreviewed', 'locale': locale, 'bundle': str(descriptor.parent),
                      'uniqueAudio': len(records)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--plan-hash', required=True)
    parser.add_argument('--french-text-hash', help='Canonical digest of the verified source-linked French export.')
    parser.add_argument('--validate-only', action='store_true', help='Check the frozen plan and cache without provider requests.')
    args = parser.parse_args()
    try:
        plan = json.loads(args.plan.read_text())
        DIRECTORY.mkdir(parents=True, exist_ok=True)
        if args.validate_only:
            locale, voice = validate_plan(plan, args.plan_hash, args.french_text_hash)
            missing = [request for identity, request in plan['requests'].items() if audio.cached_record(DIRECTORY, identity) is None]
            print(json.dumps({'mode': 'offline-validation', 'locale': locale, 'voiceId': voice,
                              'requests': len(plan['requests']), 'missing': len(missing),
                              'reservedCredits': sum(len(audio.speech_text(item)) for item in missing)}))
            sys.exit(0)
        with Path('/tmp/little-line-language-auditions.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            run(plan, args.plan_hash, args.french_text_hash)
    except (ValueError, KeyError, OSError, CreditBudgetError, audio.SafeError) as error:
        print(f'Generation stopped safely: {error}', file=sys.stderr)
        sys.exit(1)
