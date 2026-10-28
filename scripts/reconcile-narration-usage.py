#!/usr/bin/env python3
"""Reconcile closed voice cohorts against authenticated provider usage metrics.

This never generates audio or raises the cap. Only complete cached requests with
exact provider request-count and input-character totals may release the unused
part of their conservative reservations. Unknown cohorts remain fully reserved.
The default refreshes quota and reports the result without releasing reserves;
--apply retains the evidence and old ledger before recording the reconciliation.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_CEILING
import fcntl
import importlib.util
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from elevenlabs_credit_budget import CreditBudget, CreditBudgetError, atomic, integer
spec = importlib.util.spec_from_file_location('usage_audio', ROOT / 'scripts/elevenlabs-audio.py')
audio = importlib.util.module_from_spec(spec); spec.loader.exec_module(audio)


def rounded_metric(value):
    number = Decimal(str(value))
    if not number.is_finite() or number < 0 or abs(number - number.to_integral_value()) > Decimal('.000001'):
        raise ValueError('Usage count or character total is not a non-negative whole number.')
    return int(number.to_integral_value())


def reconcile(ledger, cohorts, account_used, evidence_hash):
    """Pure reconciliation: preserve all unmatched commitments and reject replay."""
    if ledger['pending'] or ledger['blocked'] or ledger['starting']['used'] != 0:
        raise ValueError('Reconciliation requires a settled, unblocked zero-baseline ledger.')
    if not cohorts or len({c['voiceId'] for c in cohorts}) != len(cohorts):
        raise ValueError('Require distinct closed voice cohorts.')
    history = ledger.get('usageReconciliations', [])
    previous = {identity for item in history for c in item['cohorts'] for identity in c['requestIds']}
    seen = set(); reduction = 0; reserved_total = 0; billed_total = 0
    for cohort in cohorts:
        ids = cohort['requestIds']
        if not ids or len(set(ids)) != len(ids) or seen.intersection(ids) or previous.intersection(ids):
            raise ValueError('A request is repeated or has already been reconciled.')
        seen.update(ids)
        if rounded_metric(cohort['providerRequests']) != len(ids) or rounded_metric(cohort['providerCharacters']) != integer(cohort['characters']):
            raise ValueError('Provider counts do not exactly match the completed cached requests.')
        reserved = integer(cohort['reserved'])
        # Round billed usage upward; floating-point character totals may have
        # tiny serialization noise, but fractional credits are never discarded.
        billed = Decimal(str(cohort['providerCredits']))
        if not billed.is_finite() or billed <= 0 or billed > reserved:
            raise ValueError('Provider cost is missing or exceeds the reserved cohort.')
        retained = integer(cohort.get('retainedLossReservations', 0))
        charged = int(billed.to_integral_value(rounding=ROUND_CEILING))
        billed = charged + retained
        if billed > reserved:
            raise ValueError('Billed usage plus retained lost-response reserves exceeds the cohort.')
        reserved_total += reserved; billed_total += charged
        reduction += reserved - billed
    committed = integer(ledger['committedReservations'])
    used = integer(account_used)
    if (reserved_total > committed or used < ledger['last']['used'] or billed_total > used
            or committed - reduction < used or reduction <= 0):
        raise ValueError('Matched billing cannot safely reduce the recorded commitments.')
    result = json.loads(json.dumps(ledger))
    result['committedReservations'] = committed - reduction
    result['observedActual'] = result['actualAccountDelta'] = used
    result['last']['used'] = used
    result['spent'] = max(result['committedReservations'], used)
    result.setdefault('usageReconciliations', []).append({
        'recordedAt': datetime.now(timezone.utc).isoformat(), 'evidenceSha256': evidence_hash,
        'previousLedgerSha256': audio.sha(audio.canonical(ledger)),
        'releasedReservations': reduction, 'cohorts': cohorts,
    })
    return result


def closed_cohorts(directory, voices, rate, lost_responses=()):
    requests = {}
    for path in [*directory.glob('bundles/*/plan.json'), *directory.glob('*plan*.json')]:
        plan = json.loads(path.read_text())
        for identity, request in plan.get('requests', {}).items():
            if request.get('voiceId') not in voices: continue
            if identity in requests and requests[identity] != request:
                raise ValueError('Saved request plans disagree.')
            requests[identity] = request
    groups = defaultdict(list); dates = []
    for path in (directory / 'cache').glob('*/receipt.json'):
        receipt = json.loads(path.read_text())
        if receipt.get('voiceId') not in voices: continue
        identity = path.parent.name; request = requests.get(identity)
        if not request or receipt.get('status') != 'complete':
            raise ValueError('The selected voice has an incomplete or unknown cached request.')
        original = {k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')}
        if (audio.sha(audio.canonical(original)) != identity or request.get('cacheKey') != identity
                or receipt.get('cacheKey') != identity or receipt.get('provider') != 'ElevenLabs'
                or receipt.get('model') != 'eleven_v4' or receipt.get('apiPath') != request.get('path')
                or request.get('kind') != 'speech' or request['payload'].get('model_id') != 'eleven_v4'
                or len(request['payload'].get('inputs', [])) != 1
                or request['payload']['inputs'][0].get('voice_id') != receipt['voiceId']):
            raise ValueError('Cached request provenance or identity differs from its frozen plan.')
        audio.cached_record(directory, identity)
        if audio.sha((path.parent / 'raw.mp3').read_bytes()) != receipt.get('rawSha256'):
            raise ValueError('Raw audio receipt integrity failed.')
        stamp = datetime.fromisoformat(receipt['requestedAt'])
        if stamp.tzinfo is None: raise ValueError('Receipt date has no timezone.')
        dates.append(stamp.astimezone(timezone.utc))
        characters = len(audio.speech_text(request))
        groups[receipt['voiceId']].append((identity, characters, int((characters * rate).to_integral_value(rounding=ROUND_CEILING))))
    losses = defaultdict(int)
    for loss in lost_responses:
        if loss.get('voiceId') not in voices: continue
        archive = loss.get('archive', '')
        if not re.fullmatch(r'interruption-recovery/[A-Za-z0-9-]+/lost-response', archive):
            raise ValueError('Lost-response evidence must remain in the bounded recovery directory.')
        folder = directory / archive
        if any(parent.is_symlink() for parent in [folder, folder.parent, folder.parent.parent,
                                                  folder / 'receipt.json', folder.parent / 'request.json']):
            raise ValueError('Lost-response evidence cannot use symlinks.')
        request = json.loads((folder.parent / 'request.json').read_text())
        receipt_data = (folder / 'receipt.json').read_bytes()
        receipt = json.loads(receipt_data)
        identity = audio.sha(audio.canonical({k: v for k, v in request.items() if k not in ('cacheKey', 'estimatedUsd')}))
        proof = {'cacheKey': identity, 'requestedAt': receipt.get('requestedAt'),
                 'receiptSha256': audio.sha(receipt_data)}
        loss_id = audio.sha(audio.canonical(proof))
        if (loss.get('lossId') != loss_id or loss.get('receiptSha256') != proof['receiptSha256']
                or loss.get('cacheKey') != identity or request.get('cacheKey') != identity
                or requests.get(identity) != request or receipt.get('cacheKey') != identity
                or receipt.get('status') != 'pending-unknown' or receipt.get('provider') != 'ElevenLabs'
                or receipt.get('voiceId') != loss['voiceId'] or request.get('voiceId') != loss['voiceId']
                or receipt.get('model') != 'eleven_v4' or receipt.get('apiPath') != request.get('path')
                or (folder / 'raw.mp3').exists() or (folder / 'normalised.mp3').exists()):
            raise ValueError('Lost-response provenance differs from its retained request and receipt.')
        characters = len(audio.speech_text(request))
        reserved = int((characters * rate).to_integral_value(rounding=ROUND_CEILING))
        if loss.get('retainedReservation') != reserved:
            raise ValueError('The original lost-response reservation must remain fully retained.')
        stamp = datetime.fromisoformat(receipt['requestedAt'])
        if stamp.tzinfo is None: raise ValueError('Lost response date has no timezone.')
        dates.append(stamp.astimezone(timezone.utc))
        groups[loss['voiceId']].append((loss_id, characters, reserved))
        losses[loss['voiceId']] += reserved
    if set(groups) != set(voices) or not dates or max(dates) > datetime.now(timezone.utc):
        raise ValueError('Require known, complete voice cohorts with valid recording dates.')
    # A long catalogue may cross midnight. Query the full interval containing
    # every receipt; exact counts and character totals still have to match.
    day = min(dates).replace(hour=0, minute=0, second=0, microsecond=0)
    return groups, day, losses


def voice_catalogue(client):
    # Shared library voices can be omitted from the default account listing.
    # Include them explicitly, matching the generation preflight's scope.
    voices, seen, token = [], set(), None
    while True:
        query = {'page_size': 100, 'include_live_moderated': 'true'}
        if token: query['next_page_token'] = token
        page = client._call_once('/v2/voices?' + urlencode(query))
        if not isinstance(page, dict) or not isinstance(page.get('voices'), list):
            raise ValueError('Unexpected authenticated voice catalogue.')
        voices.extend(page['voices'])
        if not page.get('has_more'): return voices
        token = page.get('next_page_token')
        if not isinstance(token, str) or not token or token in seen or len(seen) >= 100:
            raise ValueError('Voice catalogue pagination did not terminate safely.')
        seen.add(token)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared-root', type=Path, required=True)
    parser.add_argument('--voice', action='append', required=True)
    parser.add_argument('--cap', type=int, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    directory = args.shared_root.resolve() / 'media/elevenlabs'
    ledger_path = directory / 'multilingual-account-ledger.json'
    with Path('/tmp/little-line-language-auditions.lock').open('a') as operation:
        fcntl.flock(operation, fcntl.LOCK_EX | fcntl.LOCK_NB)
        ledger = json.loads(ledger_path.read_text())
        if ledger['cap'] != args.cap or ledger['pending'] or ledger['blocked']:
            raise ValueError('Cap mismatch or unresolved ledger; no reconciliation is permitted.')
        groups, day, losses = closed_cohorts(directory, args.voice, Decimal(ledger['creditCeiling']), ledger.get('lostResponses', []))
        shared_spec = importlib.util.spec_from_file_location('shared_usage_audio', args.shared_root / 'scripts/elevenlabs-audio.py')
        shared_audio = importlib.util.module_from_spec(shared_spec); shared_spec.loader.exec_module(shared_audio)
        client = audio.APIClient(shared_audio.load_key(args.shared_root / '.env.elevenlabs.local'))
        # The metrics API labels voices by name. Refuse ambiguous or changed
        # labels using the current authenticated account catalogue.
        available = voice_catalogue(client)
        names = {}
        for voice in args.voice:
            matches = [v for v in available if v.get('voice_id') == voice]
            if len(matches) != 1 or sum(v.get('name') == matches[0].get('name') for v in available) != 1:
                raise ValueError('The provider usage label is not uniquely mapped to the selected voice.')
            names[voice] = matches[0]['name']
        now = datetime.now(timezone.utc)
        if now < day or int(now.timestamp()) >= ledger['starting']['window']:
            raise ValueError('Usage falls outside the current bounded credit cycle.')
        metrics = {}
        for metric in ('request_count', 'tts_characters', 'credits'):
            query = urlencode(dict(start_unix=int(day.timestamp()*1000), end_unix=int(now.timestamp()*1000),
                                   breakdown_type='voice', aggregation_interval='cumulative', metric=metric))
            metrics[metric] = client._call_once('/v1/usage/character-stats?' + query)
        cohorts = []
        for voice, requests in groups.items():
            values = {metric: data['usage'][names[voice]] for metric, data in metrics.items()}
            if any(len(v) != 1 for v in values.values()): raise ValueError('Unexpected cumulative usage buckets.')
            cohorts.append(dict(voiceId=voice, providerName=names[voice], requestIds=sorted(r[0] for r in requests),
                                characters=sum(r[1] for r in requests), reserved=sum(r[2] for r in requests),
                                providerRequests=values['request_count'][0], providerCharacters=values['tts_characters'][0],
                                providerCredits=values['credits'][0], retainedLossReservations=losses[voice]))
        evidence = {'start':day.isoformat(), 'end':now.isoformat(), 'metrics':metrics, 'cohorts':cohorts}
        digest = audio.sha(audio.canonical(evidence))
        # Reuse the existing quota validation, including disabled overages and
        # a stable tier, reset window, limit and monotonically increasing usage.
        guard = CreditBudget(client, ledger_path, max_credits=args.cap, credit_ceiling=ledger['creditCeiling'])
        with guard._lock():
            ledger = guard._read(); account = guard._fresh(ledger)
            result = reconcile(ledger, cohorts, account['used'], digest)
            report = {'releasedReservations':ledger['committedReservations']-result['committedReservations'],
                      'voices':{c['voiceId']:len(c['requestIds']) for c in cohorts}, 'applied':args.apply}
            if args.apply:
                backup = directory / 'usage-reconciliation-backups' / (now.strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12])
                backup.mkdir(parents=True,mode=0o700)
                atomic(backup / 'ledger-before.json', ledger); atomic(backup / 'evidence.json', evidence)
                atomic(backup / 'ledger-after.json', result)
                guard._save(result)
                report['backup'] = str(backup)
            print(json.dumps(report))

if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, OSError, audio.SafeError, CreditBudgetError) as error:
        print(f'Stopped safely: {error}', file=sys.stderr); sys.exit(1)
