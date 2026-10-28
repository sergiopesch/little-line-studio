#!/usr/bin/env python3
"""Use remaining guarded credits for complete German and Italian lessons.

Waits for the Spain run's existing lock, then requires its full bundle. The
plan only stages local partial audio and never enables either locale.
"""
import argparse
from decimal import Decimal
import fcntl
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_languages', ROOT / 'scripts/three-language-full.py')
full = importlib.util.module_from_spec(spec); spec.loader.exec_module(full)
pilot, audio = full.pilot, full.audio
ORDER = ('de-DE', 'it-IT')

def partial_plan(plan, lesson_ids):
    chosen = set(lesson_ids)
    entries = {key: value for key, value in plan['entries'].items() if key == 'sample' or key.split('/')[0] in chosen}
    identities = set(entries.values())
    requests = {key: value for key, value in plan['requests'].items() if key in identities}
    if not entries or not requests: raise ValueError('Empty partial plan.')
    base = sum((Decimal(item['estimatedUsd']) for item in requests.values()), Decimal(0))
    return {**plan, 'entries': entries, 'requests': requests, 'partialCatalogue': True,
            'coveredLessons': sorted(chosen),
            'speechCharacters': sum(len(audio.speech_text(item)) for item in requests.values()),
            'baseEstimatedUsd': str(base.quantize(Decimal('.0001'))),
            'reservedEstimatedUsd': str((base * Decimal(audio.RATES['reserveMultiplier'])).quantize(Decimal('.0001')))}

def cost(plan, directory):
    return sum(len(audio.speech_text(item)) for identity, item in plan['requests'].items()
               if audio.cached_record(directory, identity) is None)

def completed_spain_bundle(directory, plan):
    identity = audio.sha(audio.canonical(plan))
    bundle = directory / 'bundles' / identity
    descriptor = json.loads((bundle / 'bundle.json').read_text())
    saved_plan = json.loads((bundle / 'plan.json').read_text())
    if (descriptor.get('schemaVersion') != 1 or descriptor.get('provider') != 'ElevenLabs'
            or descriptor.get('reviewStatus') != 'unreviewed-staged-only' or descriptor.get('planHash') != identity
            or descriptor.get('speechKeys') != 1461 or descriptor.get('musicLevels') != []
            or descriptor.get('musicLessons', []) != [] or saved_plan != plan or plan.get('locale') != 'es-ES'):
        raise ValueError('The complete Spain catalogue bundle does not match its frozen plan.')
    return identity

def select(plans, lesson_ids, directory, available):
    selected = {locale: ['cat'] for locale in ORDER}
    lookup = {plan['locale']: plan for plan in plans if plan['locale'] in ORDER}
    if set(lookup) != set(ORDER) or 'cat' not in lesson_ids: raise ValueError('Missing balanced locale plans.')
    total = sum(cost(partial_plan(lookup[locale], selected[locale]), directory) for locale in ORDER)
    if total > available: raise ValueError('Existing pilot recovery exceeds available headroom.')
    for lesson in lesson_ids:
        if lesson == 'cat': continue
        for locale in ORDER:
            proposal = selected[locale] + [lesson]
            new_total = sum(cost(partial_plan(lookup[l], proposal if l == locale else selected[l]), directory) for l in ORDER)
            if new_total <= available:
                selected[locale] = proposal
                total = new_total
    return [partial_plan(lookup[locale], selected[locale]) for locale in ORDER], total

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-root', type=Path, required=True)
    parser.add_argument('--cap', type=int, required=True)
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    plans = full.full_plans(); spain = next(p for p in plans if p['locale'] == 'es-ES')
    shared = args.shared_root.resolve(); directory = shared / 'media/elevenlabs'; ledger = directory / 'multilingual-account-ledger.json'
    identity = audio.sha(audio.canonical(spain)); bundle = directory / 'bundles' / identity
    if not args.run:
        print(json.dumps({'mode': 'offline', 'spainPlanHash': identity, 'spainBundlePresent': (bundle / 'bundle.json').is_file()})); return
    with Path('/tmp/little-line-language-auditions.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if completed_spain_bundle(directory, spain) != identity:
            raise ValueError('The complete Spain catalogue has not been staged; no continuation was started.')
        if json.loads(ledger.read_text()).get('cap') != args.cap:
            raise ValueError('The shared ledger cap does not match the selected cap.')
        shared_audio = pilot.module(shared / 'scripts/elevenlabs-audio.py', 'balance_shared_audio')
        client = audio.APIClient(shared_audio.load_key(shared / '.env.elevenlabs.local'))
        budget = pilot.CreditBudget(client, ledger, max_credits=args.cap, credit_ceiling=Decimal('1'))
        state = budget.inspect()
        if state['blocked'] or state['pending']: raise ValueError('The ledger needs reconciliation before continuation.')
        command = "import {LESSONS} from './src/lesson-catalogue.js'; console.log(JSON.stringify(LESSONS.map(x => x.id)))"
        lessons = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', command], cwd=ROOT, text=True, timeout=30))
        partial, planned = select(plans, lessons, directory, state['headroom'])
        budget.preflight(planned)
        print(json.dumps({'mode': 'planned', 'headroom': state['headroom'], 'reservedCredits': planned,
                          'lessons': {p['locale']: p['coveredLessons'] for p in partial}}), flush=True)
    # The runner reacquires the same exclusive lock and repeats the full
    # preflight; a competing consumer can only cause a safe stop, not overspend.
    pilot.execute(partial, shared, args.cap)

if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, pilot.CreditBudgetError, audio.SafeError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr); sys.exit(1)
