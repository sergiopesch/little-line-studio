#!/usr/bin/env python3
"""Plan and, when explicitly requested, record three complete Cat auditions.

The shared account ledger, credential and cache remain in the existing local
generation checkout. The default mode is offline and cannot spend credits.
"""
import argparse
import fcntl
import importlib.util
import json
from decimal import Decimal
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from elevenlabs_credit_budget import CreditBudget, CreditBudgetError

def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

audio = module(ROOT / 'scripts/elevenlabs-audio.py', 'pilot_audio')
VOICES = {'es-ES': ('es', 'BkOojM1ZhtSAHgsAkMx2'),
          'de-DE': ('de', '5bVYvsqKAWO1hDgOO72l'),
          'it-IT': ('it', 'wOXFTxgu7FQDBb1dsL7I')}
CAP = 560000

def plans():
    raw = subprocess.check_output(['node', 'scripts/three-language-cat-pilot.mjs'], cwd=ROOT, text=True, timeout=30)
    sources = json.loads(raw)
    if len(sources) != len(VOICES) or {x['locale'] for x in sources} != set(VOICES):
        raise ValueError('The three source-linked pilots are incomplete.')
    output = []
    for source in sources:
        locale, language, voice, texts = source['locale'], source['language'], source['voice'], source['texts']
        if (language, voice) != VOICES[locale] or len(texts) != 43:
            raise ValueError('Pilot voice, language or coverage changed.')
        args = argparse.Namespace(model_id='eleven_v4', voice_id=voice, music_seconds=120,
                                  sample_only=False, lessons=None, kind='speech', locale=locale)
        plan = audio.make_plan(args, texts)
        mapping, requests = {}, {}
        for old, request in plan['requests'].items():
            request = dict(request)
            request['payload'] = {**request['payload'], 'language_code': language}
            identity = audio.sha(audio.canonical({k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')}))
            request['cacheKey'] = identity
            mapping[old], requests[identity] = identity, request
        plan.update(locale=locale, voiceId=voice, entries={k: mapping[v] for k, v in plan['entries'].items()},
                    requests=requests, reviewStatus='assistant-draft-awaiting-native-human-review',
                    humanReview={'nativeSpeaker': 'pending', 'fullListening': 'pending'})
        output.append(plan)
    return output

def execute(all_plans, shared_root, cap=CAP, *, lock_path=Path('/tmp/little-line-language-auditions.lock')):
    shared_root = shared_root.resolve()
    directory = shared_root / 'media/elevenlabs'
    ledger = directory / 'multilingual-account-ledger.json'
    if not ledger.is_file() or not (shared_root / '.env.elevenlabs.local').is_file():
        raise ValueError('The existing shared ledger or credential file is missing.')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise ValueError('ffmpeg and ffprobe are required.')
    shared_audio = module(shared_root / 'scripts/elevenlabs-audio.py', 'shared_audio_for_key')
    client = audio.APIClient(shared_audio.load_key(shared_root / '.env.elevenlabs.local'))
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if json.loads(ledger.read_text()).get('cap') != cap:
            raise ValueError('The shared ledger cap differs from the explicitly selected cap.')
        model = next((v for v in client.call('/v1/models') if v.get('model_id') == 'eleven_v4'), None)
        if not model or not model.get('can_do_text_to_speech') or Decimal(str(model.get('model_rates', {}).get('character_cost_multiplier', 1))) > 1:
            raise ValueError('The verified model or its credit rate is unavailable.')
        for _, voice in VOICES.values():
            query = urlencode({'voice_ids': voice, 'page_size': 100, 'include_live_moderated': 'true'})
            found = client.call('/v2/voices?' + query)
            if not any(item.get('voice_id') == voice and (item.get('sharing') or {}).get('rate', 1) <= 1 for item in found.get('voices', [])):
                raise ValueError('An approved voice is unavailable or has an unsupported rate.')
        budget = CreditBudget(client, ledger, max_credits=cap, credit_ceiling=Decimal('1'))
        missing = []
        for plan in all_plans:
            for identity, request in plan['requests'].items():
                if audio.cached_record(directory, identity) is None:
                    missing.append(request)
        budget.preflight(sum(len(audio.speech_text(item)) for item in missing))
        for plan in all_plans:
            records = {}
            requests = list(plan['requests'].values())
            for offset in range(0, len(requests), 3):
                if (directory / '.stop-after-batch').exists():
                    raise ValueError('Stopped safely at the requested batch boundary.')
                group = requests[offset:offset + 3]
                need = [item for item in group if audio.cached_record(directory, item['cacheKey']) is None]
                for item in group:
                    if item not in need:
                        records[item['cacheKey']] = audio.generate_one(client, directory, item)
                if need:
                    records.update(audio.generate_batch(lambda: audio.APIClient(client.key), directory, need, budget))
                if offset % 15 == 0 or offset + len(group) == len(requests):
                    print(json.dumps({'locale': plan['locale'], 'prepared': len(records), 'total': len(requests)}), flush=True)
            descriptor = audio.build_bundle(directory, plan, records)
            print(json.dumps({'locale': plan['locale'], 'status': 'staged-unreviewed', 'bundle': str(descriptor.parent)}), flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Record within the existing shared project cap.')
    parser.add_argument('--shared-root', type=Path, help='Existing checkout holding the shared account ledger and credential.')
    parser.add_argument('--cap', type=int, default=CAP, help='Exact current shared ledger cap; never silently decreases it.')
    args = parser.parse_args()
    all_plans = plans()
    for plan in all_plans:
        print(json.dumps({'locale': plan['locale'], 'voiceId': plan['voiceId'], 'keys': len(plan['entries']),
                          'requests': len(plan['requests']), 'conservativeCredits': sum(len(audio.speech_text(x)) for x in plan['requests'].values()),
                          'planHash': audio.sha(audio.canonical(plan))}), flush=True)
    if args.run:
        if not args.shared_root:
            raise ValueError('A shared checkout is required for the guarded recording run.')
        execute(all_plans, args.shared_root, args.cap)

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, CreditBudgetError, audio.SafeError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr)
        sys.exit(1)
