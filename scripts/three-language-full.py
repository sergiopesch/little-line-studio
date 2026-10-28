#!/usr/bin/env python3
"""Build complete offline request plans; optionally stage one guarded locale."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import importlib.util
spec = importlib.util.spec_from_file_location('cat_pilot', ROOT / 'scripts/three-language-cat-pilot.py')
pilot = importlib.util.module_from_spec(spec); spec.loader.exec_module(pilot)
audio = pilot.audio

def full_plans():
    sources = json.loads(subprocess.check_output(['node', 'scripts/three-language-full-texts.mjs'], cwd=ROOT, text=True, timeout=60))
    if len(sources) != len(pilot.VOICES) or {x['locale'] for x in sources} != set(pilot.VOICES):
        raise ValueError('The three source-linked catalogues are incomplete.')
    previous = {p['locale']: p for p in pilot.plans()}
    plans = []
    for source in sources:
        locale, language, voice, texts = source['locale'], source['language'], source['voice'], source['texts']
        if (language, voice) != pilot.VOICES[locale] or len(texts) != 1461:
            raise ValueError('Locale, selected voice or narration coverage changed.')
        args = argparse.Namespace(model_id='eleven_v4', voice_id=voice, music_seconds=120,
                                  sample_only=False, lessons=None, kind='speech', locale=locale)
        plan = audio.make_plan(args, texts)
        mapping, requests = {}, {}
        for old, request in plan['requests'].items():
            request = dict(request); request['payload'] = {**request['payload'], 'language_code': language}
            identity = audio.sha(audio.canonical({k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')}))
            request['cacheKey'] = identity
            mapping[old], requests[identity] = identity, request
        plan.update(locale=locale, voiceId=voice, entries={k: mapping[v] for k, v in plan['entries'].items()},
                    requests=requests, reviewStatus='assistant-draft-awaiting-native-human-review',
                    humanReview={'nativeSpeaker': 'pending', 'fullListening': 'pending'})
        if any(plan['entries'].get(k) != v for k, v in previous[locale]['entries'].items()):
            raise ValueError('The full catalogue does not reuse the exact audition requests.')
        plans.append(plan)
    return plans

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--locale', choices=tuple(pilot.VOICES), required=True)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--shared-root', type=Path)
    parser.add_argument('--cap', type=int, help='Exact current shared ledger cap.')
    args = parser.parse_args()
    plan = next(p for p in full_plans() if p['locale'] == args.locale)
    missing = list(plan['requests'].values())
    if args.shared_root:
        directory = args.shared_root.resolve() / 'media/elevenlabs'
        missing = [r for r in missing if audio.cached_record(directory, r['cacheKey']) is None]
    print(json.dumps({'locale': plan['locale'], 'keys': len(plan['entries']), 'requests': len(plan['requests']),
                      'uncachedRequests': len(missing), 'conservativeCredits': sum(len(audio.speech_text(r)) for r in missing),
                      'planHash': audio.sha(audio.canonical(plan))}), flush=True)
    if args.run:
        if args.shared_root is None or args.cap is None:
            raise ValueError('An explicit shared checkout and exact current cap are required.')
        pilot.execute([plan], args.shared_root, args.cap)

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, pilot.CreditBudgetError, audio.SafeError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr)
        sys.exit(1)
