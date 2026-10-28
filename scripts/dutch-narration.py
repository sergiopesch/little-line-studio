#!/usr/bin/env python3
"""Plan the source-linked Dutch demo catalogue; record only with --run and a cap.

Uses the existing account ledger, global generation lock, cache and mastering.
The offline text inventory is input, not evidence of native or human review.
"""
import argparse
from decimal import Decimal
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('dutch_runner', ROOT / 'scripts/three-language-cat-pilot.py')
pilot = importlib.util.module_from_spec(spec); spec.loader.exec_module(pilot)
audio = pilot.audio
VOICES = {'nl-NL': ('nl', 'DiUBVrSFwkMaPz4XqWvR')}


def full_plan():
    source = json.loads(subprocess.check_output(
        ['node', 'scripts/plan-dutch-catalogue.mjs'], cwd=ROOT, text=True, timeout=60))
    language, voice = VOICES['nl-NL']
    texts = source['entries']
    if (source['locale'] != 'nl-NL' or source['voice']['id'] != voice
            or len(texts) != 1461 or any(not isinstance(t, str) or not t.strip() for t in texts.values())):
        raise ValueError('The Dutch source, selected voice or complete coverage changed.')
    args = argparse.Namespace(model_id='eleven_v4', voice_id=voice, music_seconds=120,
                              sample_only=False, lessons=None, kind='speech', locale='nl-NL')
    plan = audio.make_plan(args, texts)
    mapping, requests = {}, {}
    for old, request in plan['requests'].items():
        request = {**request, 'payload': {**request['payload'], 'language_code': language}}
        identity = audio.sha(audio.canonical({k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')}))
        request['cacheKey'] = identity
        mapping[old], requests[identity] = identity, request
    plan.update(locale='nl-NL', voiceId=voice,
                entries={key: mapping[value] for key, value in plan['entries'].items()}, requests=requests,
                reviewStatus='assistant-draft-awaiting-native-human-review',
                humanReview={'nativeSpeaker': 'pending', 'fullListening': 'pending'})
    return plan


def initial_cohort(plan):
    """Record twenty whole lessons before reconciling their actual billed usage.

    The full catalogue reuses these exact request identities. This is a billing
    checkpoint only; Dutch is released after all thirty lessons are complete.
    """
    lessons = sorted({key.split('/')[0] for key in plan['entries'] if key != 'sample'})[:20]
    entries = {key: value for key, value in plan['entries'].items()
               if key == 'sample' or key.split('/')[0] in lessons}
    requests = {identity: plan['requests'][identity] for identity in sorted(set(entries.values()))}
    estimate = sum((Decimal(r['estimatedUsd']) for r in requests.values()), Decimal(0))
    characters = sum(len(audio.speech_text(r)) for r in requests.values())
    return {**plan, 'entries': entries, 'requests': requests, 'speechCharacters': characters,
            'sourceCataloguePlanHash': audio.sha(audio.canonical(plan)), 'recordingCohort': lessons,
            'baseEstimatedUsd': str(estimate.quantize(Decimal('.0001'))),
            'reservedEstimatedUsd': str((estimate * Decimal(audio.RATES['reserveMultiplier'])).quantize(Decimal('.0001')))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--shared-root', type=Path)
    parser.add_argument('--cap', type=int, help='Exact existing shared account cap; no overages.')
    parser.add_argument('--initial-cohort', action='store_true', help='Record twenty complete lessons for a billing checkpoint, without release.')
    parser.add_argument('--concurrency', type=int, choices=(3, 8), default=3)
    args = parser.parse_args()
    plan = full_plan()
    if args.initial_cohort:
        plan = initial_cohort(plan)
    missing = list(plan['requests'].values())
    if args.shared_root:
        directory = args.shared_root.resolve() / 'media/elevenlabs'
        missing = [r for r in missing if audio.cached_record(directory, r['cacheKey']) is None]
    print(json.dumps({'locale': plan['locale'], 'voiceId': plan['voiceId'], 'keys': len(plan['entries']),
                      'requests': len(plan['requests']), 'uncachedRequests': len(missing),
                      'conservativeCredits': sum(len(audio.speech_text(r)) for r in missing),
                      'planHash': audio.sha(audio.canonical(plan))}), flush=True)
    if args.run:
        if args.shared_root is None or args.cap is None:
            raise ValueError('An explicit shared checkout and exact current cap are required.')
        pilot.execute([plan], args.shared_root, args.cap, approved_voices=VOICES, concurrency=args.concurrency)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, pilot.CreditBudgetError, audio.SafeError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr)
        sys.exit(1)
