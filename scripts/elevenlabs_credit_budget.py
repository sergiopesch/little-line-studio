"""Fail-closed local credit ledger. This module never sends a POST or reads keys.

CreditBudget(client, ledgerpath, max_credits=..., min_remaining=100,
             credit_ceiling=Decimal('.5'))
Call before(path, payload) before one supported POST, or before_batch(requests)
before a bounded group. Call after() only once every reserved outcome is known. A failed/unknown POST leaves the durable reservation
pending; no later request is authorised automatically. Account-wide count deltas
may appear late or include concurrent consumers. Cumulative commitments protect
against delayed billing without assigning account deltas to individual requests.
This cannot enforce a provider-side cap against other processes/accounts.
"""
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile


class CreditBudgetError(Exception):
    """Credential-free authored diagnostic."""


def integer(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise CreditBudgetError('Quota fields must be finite whole numbers.')
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number < 0 or number != number.to_integral_value():
            raise InvalidOperation
        return int(number)
    except (ValueError, InvalidOperation):
        raise CreditBudgetError('Quota fields must be finite whole numbers.') from None


def atomic(path, data):
    fd, temporary = tempfile.mkstemp(prefix='.credit-pending-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as handle:
            json.dump(data, handle, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


class CreditBudget:
    def __init__(self, client, ledgerpath, *, max_credits, min_remaining=100, credit_ceiling=None, speech_rate=None):
        self.client, self.path = client, Path(ledgerpath)
        self.cap, self.minimum = integer(max_credits), integer(min_remaining)
        try:
            self.rate = Decimal(str(credit_ceiling if credit_ceiling is not None else speech_rate if speech_rate is not None else '.5'))
            if credit_ceiling is not None and speech_rate is not None and Decimal(str(speech_rate)) != self.rate:
                raise CreditBudgetError('Conflicting credit ceiling arguments.')
        except InvalidOperation:
            raise CreditBudgetError('Credit ceiling must be explicitly supported: 0.5 or 1 per character.') from None
        if self.rate not in (Decimal('.5'), Decimal('1')) or self.minimum < 100 or self.cap < 1:
            raise CreditBudgetError('Require a positive cap, at least 100 credits reserved and a supported conservative credit ceiling.')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock():
            ledger = self._read(allow_missing=True)
            if ledger is None:
                account = self._account()
                ledger = {'schemaVersion': 2, 'cap': self.cap, 'minimum': self.minimum,
                          'creditCeiling': str(self.rate), 'starting': account, 'last': account,
                          'spent': 0, 'committedReservations': 0, 'observedActual': 0, 'actualAccountDelta': 0, 'pending': None, 'blocked': False}
            else:
                if self.cap > integer(ledger['cap']):
                    raise CreditBudgetError('An existing project credit cap cannot be increased.')
                if self.minimum < integer(ledger['minimum']) or Decimal(ledger['creditCeiling']) != self.rate:
                    raise CreditBudgetError('Existing reserve cannot decrease and credit ceiling cannot change.')
                ledger.update(cap=self.cap, minimum=self.minimum)
            self._save(ledger)

    def _lock(self):
        class Lock:
            def __init__(inner, path): inner.path = path
            def __enter__(inner):
                inner.handle = inner.path.open('a')
                fcntl.flock(inner.handle, fcntl.LOCK_EX)
            def __exit__(inner, *_): inner.handle.close()
        return Lock(self.path.with_suffix(self.path.suffix + '.lock'))

    def _read(self, allow_missing=False):
        if not self.path.exists():
            if allow_missing: return None
            raise CreditBudgetError('Credit ledger disappeared; reconcile before proceeding.')
        try:
            ledger = json.loads(self.path.read_text())
            if ledger['schemaVersion'] != 2 or not isinstance(ledger['blocked'], bool): raise ValueError
            integer(ledger['cap']); integer(ledger['spent']); integer(ledger['minimum']); integer(ledger['actualAccountDelta']); integer(ledger['committedReservations']); integer(ledger['observedActual'])
            for account in (ledger['starting'], ledger['last']):
                integer(account['used']); integer(account['limit']); integer(account['window'])
                if not isinstance(account['tier'], str): raise ValueError
            if ledger['pending'] is not None:
                integer(ledger['pending']['reserved']); integer(ledger['pending']['beforeUsed'])
                request_id = ledger['pending'].get('requestId')
                if request_id is not None and (not isinstance(request_id, str) or not re.fullmatch(r'[0-9a-f]{64}', request_id)):
                    raise ValueError
                if 'requestIds' in ledger['pending']:
                    ids = ledger['pending']['requestIds']
                    if (not isinstance(ids, list) or not 1 <= len(ids) <= 3 or len(set(ids)) != len(ids)
                            or any(not isinstance(identity, str) or not re.fullmatch(r'[0-9a-f]{64}', identity) for identity in ids)):
                        raise ValueError
            return ledger
        except Exception:
            raise CreditBudgetError('Credit ledger is unreadable; reconcile it before proceeding.') from None

    def _save(self, ledger):
        try: atomic(self.path, ledger)
        except OSError: raise CreditBudgetError('Credit ledger could not be persisted; do not send a request.') from None

    def _account(self, supplied=None):
        try:
            data = self.client.call('/v1/user/subscription') if supplied is None else supplied
            if data.get('can_extend_character_limit') is not False or integer(data['max_credit_limit_extension']) != 0:
                raise CreditBudgetError('Disable credit overages before generation.')
            result = {'used': integer(data['character_count']), 'limit': integer(data['character_limit']),
                      'window': integer(data['next_character_count_reset_unix']), 'tier': data['tier']}
            if not isinstance(result['tier'], str) or not result['tier'] or result['used'] > result['limit']:
                raise CreditBudgetError('Account quota is not a supported bounded quota.')
            return result
        except CreditBudgetError: raise
        except Exception as exc:
            status = getattr(exc, 'http_status', None)
            diagnostic = f' (HTTP {status})' if type(status) is int and 400 <= status <= 599 else ''
            raise CreditBudgetError(f'Fresh subscription quota could not be verified{diagnostic}; no request is authorised.') from None

    def _fresh(self, ledger, supplied=None):
        account = self._account(supplied)
        start, last = ledger['starting'], ledger['last']
        if any(account[key] != start[key] for key in ('window', 'limit', 'tier')) or account['used'] < last['used']:
            ledger['blocked'] = True
            self._save(ledger)
            raise CreditBudgetError('Quota reset, tier change or decreasing count requires manual reconciliation.')
        ledger['last'] = account
        ledger['observedActual'] = account['used'] - start['used']
        ledger['actualAccountDelta'] = ledger['observedActual']  # Compatibility: cumulative, never per-call attribution.
        ledger['spent'] = max(ledger['committedReservations'], ledger['observedActual'])
        if not ledger['pending'] and ledger['observedActual'] > ledger['committedReservations']:
            ledger['blocked'] = True
            self._save(ledger)
            raise CreditBudgetError('Cumulative observed credits exceed committed reservations; reconcile before continuing.')
        self._save(ledger)  # Retain maximum observed use even if the next reservation is denied.
        return account

    def _headroom(self, ledger, account):
        reserved = ledger['pending']['reserved'] if ledger['pending'] else 0
        unreported = max(0, ledger['committedReservations'] - ledger['observedActual'])
        return max(0, min(ledger['cap'] - ledger['spent'] - reserved,
                          account['limit'] - account['used'] - unreported - reserved - ledger['minimum']))

    def _state(self, ledger, account):
        pending = ledger['pending']
        identities = (pending.get('requestIds', [pending['requestId']] if pending.get('requestId') else [])
                      if pending else [])
        return {'cap': ledger['cap'], 'spent': ledger['spent'], 'pending': bool(pending),
                'pendingRequestId': pending.get('requestId') if pending else None,
                'pendingRequestIds': list(identities),
                'blocked': ledger['blocked'], 'committedReservations': ledger['committedReservations'],
                'observedActual': ledger['observedActual'], 'actualAccountDelta': ledger['actualAccountDelta'],
                'unreported': max(0, ledger['committedReservations'] - ledger['observedActual']),
                'accountRemaining': account['limit'] - account['used'], 'minRemaining': ledger['minimum'],
                'headroom': 0 if pending or ledger['blocked'] else self._headroom(ledger, account)}

    def inspect(self):
        with self._lock():
            ledger = self._read()
            account = self._fresh(ledger)
            return self._state(ledger, account)

    def snapshot(self):
        """Last verified quota for logging only; never authorises a request."""
        with self._lock():
            ledger = self._read()
            return self._state(ledger, ledger['last'])

    def preflight(self, planned_credits):
        planned = integer(planned_credits)
        state = self.inspect()
        if state['pending'] or state['blocked'] or planned > state['headroom']:
            raise CreditBudgetError('Planned batch exceeds safe credit headroom or has an unresolved request.')
        return state

    def _reservation(self, path, payload):
        if not isinstance(path, str) or not isinstance(payload, dict):
            raise CreditBudgetError('Only fixed, bounded generation requests are authorised.')
        if path == '/v1/music?output_format=mp3_44100_128':
            if (set(payload) != {'model_id', 'force_instrumental', 'prompt', 'music_length_ms'}
                    or payload['model_id'] != 'music_v2_5' or payload['force_instrumental'] is not True
                    or not isinstance(payload['prompt'], str) or not payload['prompt'].strip()
                    or len(payload['prompt']) > 4100 or type(payload['music_length_ms']) is not int
                    or payload['music_length_ms'] not in (60000, 90000, 120000)):
                raise CreditBudgetError('Music requires the fixed instrumental prompt contract and an allowed bounded duration.')
            # Conservative planning ceiling, never a claim about actual provider billing.
            return payload['music_length_ms'] * 900 // 60000, 'music'
        if path == '/v1/text-to-dialogue?output_format=mp3_44100_128':
            inputs = payload.get('inputs')
            valid_fields = set(payload) == {'inputs', 'model_id'} or (
                set(payload) == {'inputs', 'model_id', 'language_code'} and payload['language_code'] == 'es')
            if (not valid_fields or payload['model_id'] != 'eleven_v4'
                    or not isinstance(inputs, list) or len(inputs) != 1 or not isinstance(inputs[0], dict)
                    or set(inputs[0]) != {'text', 'voice_id'}
                    or not isinstance(inputs[0]['voice_id'], str)
                    or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', inputs[0]['voice_id'])):
                raise CreditBudgetError('Dialogue requires exactly one authored text and safe voice ID with model eleven_v4.')
            text = inputs[0]['text']
        elif re.fullmatch(r'/v1/text-to-speech/[A-Za-z0-9_-]{1,100}\?output_format=mp3_44100_128', path):
            allowed = {'eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_v3', 'eleven_v4'}
            if payload.get('model_id') not in allowed:
                raise CreditBudgetError('Speech model is not on the explicit supported model list.')
            text = payload.get('text')
        else:
            raise CreditBudgetError('Only the fixed speech, single-voice dialogue and instrumental music endpoints are authorised.')
        if not isinstance(text, str) or not text.strip():
            raise CreditBudgetError('Speech reservation requires non-empty authored text.')
        return int((Decimal(len(text)) * self.rate).to_integral_value(rounding=ROUND_CEILING)), 'speech'

    def before(self, path, payload, request_id=None):
        if request_id is not None and (not isinstance(request_id, str) or not re.fullmatch(r'[0-9a-f]{64}', request_id)):
            raise CreditBudgetError('Request identity must be a canonical SHA-256 identifier.')
        reserved, kind = self._reservation(path, payload)
        with self._lock():
            ledger = self._read()
            if ledger['pending'] or ledger['blocked']:
                raise CreditBudgetError('An unresolved or over-budget request blocks further generation.')
            account = self._fresh(ledger)
            if kind == 'music' and account['tier'] not in {'starter', 'creator', 'pro', 'scale', 'business'}:
                raise CreditBudgetError('Instrumental music requires a verified supported paid account tier.')
            if reserved > self._headroom(ledger, account):
                raise CreditBudgetError('Generation request exceeds project cap or protected account credits.')
            ledger['last'] = account
            ledger['pending'] = {'reserved': reserved, 'beforeUsed': account['used'], 'kind': kind, 'requestId': request_id}
            self._save(ledger)
            return dict(ledger['pending'])

    def _batch_reservation(self, requests):
        if not isinstance(requests, list) or not 1 <= len(requests) <= 3:
            raise CreditBudgetError('A generation group requires one to three bounded requests.')
        identities, reservations, kinds = [], [], []
        for item in requests:
            if not isinstance(item, (tuple, list)) or len(item) != 3:
                raise CreditBudgetError('Each group request requires endpoint, payload and canonical request identity.')
            path, payload, identity = item
            if not isinstance(identity, str) or not re.fullmatch(r'[0-9a-f]{64}', identity) or identity in identities:
                raise CreditBudgetError('Group request identities must be unique canonical SHA-256 identifiers.')
            reserved, kind = self._reservation(path, payload)
            identities.append(identity)
            reservations.append(reserved)
            kinds.append(kind)
        if 'music' in kinds and len(requests) > 2:
            raise CreditBudgetError('A group containing music is limited to two requests.')
        group_id = hashlib.sha256(json.dumps(identities, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()
        return {'reserved': sum(reservations), 'kind': 'batch', 'requestId': group_id,
                'requestIds': identities}, 'music' in kinds

    def _reserve_batch(self, ledger, account, reservation, has_music):
        if has_music and account['tier'] not in {'starter', 'creator', 'pro', 'scale', 'business'}:
            raise CreditBudgetError('Instrumental music requires a verified supported paid account tier.')
        if reservation['reserved'] > self._headroom(ledger, account):
            raise CreditBudgetError('Generation group exceeds project cap or protected account credits.')
        ledger['pending'] = {**reservation, 'beforeUsed': account['used']}
        self._save(ledger)
        return dict(ledger['pending'])

    def before_batch(self, requests):
        """Reserve one bounded group; caller must retain all raw responses before after().

        Group identity is SHA256 of the compact UTF-8 JSON list of request IDs,
        preserving request order. No worker may reserve or settle individually.
        An unknown member outcome leaves the entire group pending.
        """
        reservation, has_music = self._batch_reservation(requests)
        with self._lock():
            ledger = self._read()
            if ledger['pending'] or ledger['blocked']:
                raise CreditBudgetError('An unresolved or over-budget request blocks further generation.')
            account = self._fresh(ledger)
            return self._reserve_batch(ledger, account, reservation, has_music)

    def verify_batch_reservation(self, request_id, requests):
        """Verify dispatch against an existing grant without GETs or mutation.

        Recompute the actual bounded requests' charge ceiling instead of
        trusting caller-supplied reservation metadata. The caller separately
        verifies that each request ID hashes its canonical complete spec; this
        ledger intentionally stores no text, audio or provider credentials.
        """
        reservation, has_music = self._batch_reservation(requests)
        if not isinstance(request_id, str) or not re.fullmatch(r'[0-9a-f]{64}', request_id):
            raise CreditBudgetError('Dispatch requires its canonical generation group identity.')
        with self._lock():
            ledger = self._read()
            pending = ledger['pending']
            if ledger['blocked'] or not pending:
                raise CreditBudgetError('No active unblocked reservation authorises this generation group.')
            if (request_id != reservation['requestId']
                    or any(pending.get(field) != reservation[field]
                           for field in ('kind', 'requestId', 'requestIds', 'reserved'))):
                raise CreditBudgetError('Actual generation requests do not match their durable reservation.')
            cap = min(ledger['cap'], self.cap)
            minimum = max(ledger['minimum'], self.minimum)
            unreported = max(0, ledger['committedReservations'] - ledger['observedActual'])
            if (ledger['committedReservations'] + pending['reserved'] > cap
                    or ledger['spent'] > cap
                    or ledger['observedActual'] > ledger['committedReservations'] + pending['reserved']
                    or ledger['last']['limit'] - ledger['last']['used'] - unreported - pending['reserved'] < minimum):
                raise CreditBudgetError('The existing reservation exceeds the current cap or protected account credits.')
            if has_music and ledger['last']['tier'] not in {'starter', 'creator', 'pro', 'scale', 'business'}:
                raise CreditBudgetError('Instrumental music requires a verified supported paid account tier.')
            return {**pending, 'requestIds': list(pending['requestIds'])}

    def _pending(self, ledger, request_id):
        pending = ledger['pending']
        if not pending:
            raise CreditBudgetError('There is no pending generation request to settle.')
        if request_id is not None and (not isinstance(request_id, str) or not re.fullmatch(r'[0-9a-f]{64}', request_id)
                                       or request_id != pending.get('requestId')):
            raise CreditBudgetError('Request identity does not match the durable pending reservation.')
        return pending

    def _settle(self, ledger, pending):
        ledger['committedReservations'] += pending['reserved']
        ledger['pending'] = None
        ledger['spent'] = max(ledger['committedReservations'], ledger['observedActual'])
        ledger['blocked'] = (ledger['blocked'] or ledger['observedActual'] > ledger['committedReservations']
                             or ledger['spent'] > ledger['cap'])
        self._save(ledger)
        if ledger['blocked']:
            raise CreditBudgetError('Cumulative observed credit use exceeded commitments; further generation is blocked.')
        return {'reserved': pending['reserved'], 'spent': ledger['spent'],
                'committedReservations': ledger['committedReservations'],
                'observedActual': ledger['observedActual'], 'actualAccountDelta': ledger['actualAccountDelta']}

    def after(self, metadata=None, afteraccount=None, request_id=None):
        # Unverified response headers never reduce the account-based reservation.
        with self._lock():
            ledger = self._read()
            pending = self._pending(ledger, request_id)
            self._fresh(ledger, afteraccount)
            return self._settle(ledger, pending)

    def after_and_before_batch(self, previous_request_id, next_requests, *, received_request_ids):
        """Settle known saved responses and reserve the next group with one GET.

        The caller must verify every previous member's retained raw response and
        hash before passing its identity. This ledger never infers a successful
        response from billing or elapsed time. All acknowledgements must match
        the pending group; absent/unknown members cannot advance it.

        One fresh account read, under the ledger lock, is both the previous
        group's after-check and the next group's before-check. A quota/cap or
        persistence failure never returns permission to send the next POSTs.
        Valid prior commitments stay settled when only the next group is too
        large. The returned snapshot is for logging without another quota GET.
        """
        reservation, has_music = self._batch_reservation(next_requests)
        if not isinstance(previous_request_id, str) or not re.fullmatch(r'[0-9a-f]{64}', previous_request_id):
            raise CreditBudgetError('A batch transition requires its canonical previous group identity.')
        if (not isinstance(received_request_ids, list) or not 1 <= len(received_request_ids) <= 3
                or any(not isinstance(identity, str) or not re.fullmatch(r'[0-9a-f]{64}', identity)
                       for identity in received_request_ids)
                or len(set(received_request_ids)) != len(received_request_ids)):
            raise CreditBudgetError('Every previous group response must be explicitly confirmed as retained.')
        with self._lock():
            ledger = self._read()
            pending = self._pending(ledger, previous_request_id)
            members = pending.get('requestIds')
            if (pending.get('kind') != 'batch' or not members
                    or set(received_request_ids) != set(members)):
                raise CreditBudgetError('Unknown or mismatched previous responses block the next generation group.')
            if set(members).intersection(reservation['requestIds']):
                raise CreditBudgetError('The next group must not repeat a previous group request.')
            account = self._fresh(ledger)
            settled = self._settle(ledger, pending)
            reserved = self._reserve_batch(ledger, account, reservation, has_music)
            return {'settled': settled, 'reservation': reserved, 'snapshot': self._state(ledger, account)}
