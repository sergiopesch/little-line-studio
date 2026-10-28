import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const checks = String.raw`
import importlib.util, json, tempfile, unittest
from pathlib import Path
from unittest.mock import Mock, patch
from decimal import Decimal
spec = importlib.util.spec_from_file_location('budget', 'scripts/elevenlabs_credit_budget.py')
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
PATH = '/v1/text-to-speech/verified_voice?output_format=mp3_44100_128'
PAYLOAD = {'text': 'hello', 'model_id': 'eleven_flash_v2_5'}
class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.path = Path(self.temp.name)/'credits.json'
        self.account = {'character_count': 5781, 'character_limit': 10000, 'tier': 'free', 'can_extend_character_limit': False, 'max_credit_limit_extension': 0, 'next_character_count_reset_unix': 123456}
        self.client = Mock(); self.client.call.side_effect = lambda endpoint: dict(self.account)
        self.guard = b.CreditBudget(self.client, self.path, max_credits=4000)
    def tearDown(self): self.temp.cleanup()
    def test_before_after_and_conservative_rounding(self):
        self.assertEqual(self.guard.before(PATH, PAYLOAD)['reserved'], 3)
        self.account['character_count'] += 2
        settled = self.guard.after()
        self.assertEqual(settled['spent'],3); self.assertEqual(settled['committedReservations'],3); self.assertEqual(settled['observedActual'],2)
        state = self.guard.inspect(); self.assertEqual(state['actualAccountDelta'], 2)
        self.assertEqual(state['headroom'], 3997)
        self.assertTrue(all(c.args == ('/v1/user/subscription',) for c in self.client.call.call_args_list))
    def test_pending_is_durable_and_no_automatic_retry(self):
        self.guard.before(PATH, PAYLOAD)
        replacement = b.CreditBudget(self.client, self.path, max_credits=4000)
        with self.assertRaises(b.CreditBudgetError): replacement.before(PATH, PAYLOAD)
        with self.assertRaises(b.CreditBudgetError): replacement.preflight(1)
        self.assertTrue(replacement.inspect()['pending'])
    def test_actual_excess_blocks_after_settling(self):
        self.guard.before(PATH, PAYLOAD); self.account['character_count'] += 4
        with self.assertRaises(b.CreditBudgetError): self.guard.after()
        ledger = json.loads(self.path.read_text()); self.assertEqual(ledger['spent'], 4)
        self.assertEqual(ledger['actualAccountDelta'], 4); self.assertTrue(ledger['blocked'])
        with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, PAYLOAD)
    def test_account_race_rechecked_before_every_post(self):
        self.guard.preflight(4000)
        self.account['character_count'] = 9899
        with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, PAYLOAD)
        self.assertFalse(json.loads(self.path.read_text())['pending'])
        self.assertEqual(json.loads(self.path.read_text())['last']['used'],9899)
        self.account['character_count'] = 5781
        with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, PAYLOAD)
        self.assertTrue(json.loads(self.path.read_text())['blocked'])
    def test_cannot_increase_cap_or_reduce_reserve(self):
        for kwargs in ({'max_credits': 4001}, {'max_credits': 4000, 'min_remaining': 99}, {'max_credits': 4000, 'speech_rate': 1}):
            with self.assertRaises(b.CreditBudgetError): b.CreditBudget(self.client, self.path, **kwargs)
        lower = b.CreditBudget(self.client, self.path, max_credits=2)
        with self.assertRaises(b.CreditBudgetError): lower.before(PATH, PAYLOAD)
        with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, PAYLOAD)
    def test_unsupported_endpoints_and_rates_blocked(self):
        for path in ('/v1/music', '//evil/v1/text-to-speech/a', '/v1/text-to-speech/../x?output_format=mp3_44100_128', PATH+'&extra=true', PATH.replace('mp3_44100_128','mp3_22050_32')):
            with self.assertRaises(b.CreditBudgetError): self.guard.before(path, PAYLOAD)
        for payload in ({'text': '', 'model_id': 'eleven_flash_v2_5'}, {'text':'hello','model_id':'unknown'}):
            with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, payload)
    def test_quota_reset_limit_tier_and_count_decrease(self):
        for field, value in (('next_character_count_reset_unix', 123457), ('character_limit', 20000), ('tier', 'paid'), ('character_count', 0)):
            previous = self.account[field]; self.account[field] = value
            with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, PAYLOAD)
            self.account[field] = previous
    def test_overages_or_missing_fields_fail_closed(self):
        for field, value in (('can_extend_character_limit',True), ('max_credit_limit_extension',1), ('character_count',True), ('character_limit',float('nan')), ('character_count',5781.5)):
            previous=self.account[field]; self.account[field]=value
            with self.assertRaises(b.CreditBudgetError): self.guard.inspect()
            self.account[field]=previous
        del self.account['next_character_count_reset_unix']
        with self.assertRaises(b.CreditBudgetError): self.guard.inspect()
    def test_failed_settlement_retains_pending(self):
        self.guard.before(PATH, PAYLOAD)
        self.client.call.side_effect = RuntimeError('credential-secret-provider-details')
        with self.assertRaises(b.CreditBudgetError) as error: self.guard.after()
        self.assertNotIn('credential-secret',str(error.exception))
        self.assertTrue(json.loads(self.path.read_text())['pending'])
    def test_supplied_afteraccount_and_untrusted_metadata(self):
        self.guard.before(PATH, PAYLOAD)
        result = self.guard.after(metadata={'credit_cost':0}, afteraccount=dict(self.account))
        self.assertEqual(result['spent'],3)
    def test_no_settlement_without_reservation_or_deleted_ledger(self):
        with self.assertRaises(b.CreditBudgetError): self.guard.after()
        self.path.unlink()
        with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH, PAYLOAD)
    def test_delayed_account_updates_do_not_double_count_or_false_block(self):
        self.guard.before(PATH, PAYLOAD)
        first = self.guard.after()
        self.assertEqual(first['spent'],3); self.assertEqual(first['observedActual'],0)
        self.guard.before(PATH, PAYLOAD)
        self.account['character_count'] += 6
        second = self.guard.after()
        self.assertEqual(second['spent'],6); self.assertEqual(second['committedReservations'],6)
        self.assertEqual(second['observedActual'],6); self.assertFalse(self.guard.inspect()['blocked'])
        self.guard.before(PATH, PAYLOAD)
        third = self.guard.after()
        self.assertEqual(third['spent'],9); self.assertEqual(third['observedActual'],6)
        self.account['character_count'] += 2
        state = self.guard.inspect()
        self.assertEqual(state['spent'],9); self.assertEqual(state['unreported'],1)
        self.assertEqual(state['observedActual'],8)
    def test_unreported_commitments_reduce_account_headroom(self):
        guard = b.CreditBudget(self.client, self.path, max_credits=4000, min_remaining=4200)
        guard.before(PATH,PAYLOAD); guard.after()
        state = guard.inspect()
        self.assertEqual(state['accountRemaining'],4219)
        self.assertEqual(state['headroom'],16)
        self.assertEqual(state['unreported'],3)
        self.account['character_count'] += 3
        self.assertEqual(guard.inspect()['headroom'],16)
    def test_known_models_can_use_explicit_conservative_ceiling(self):
        for model in ('eleven_multilingual_v2','eleven_v3','eleven_v4','eleven_flash_v2_5'):
            self.guard.before(PATH,dict(PAYLOAD,model_id=model)); self.guard.after()
        self.assertEqual(self.guard.inspect()['committedReservations'],12)
    def test_legacy_ledger_is_not_silently_migrated(self):
        ledger=json.loads(self.path.read_text()); ledger['schemaVersion']=1; self.path.write_text(json.dumps(ledger))
        with self.assertRaises(b.CreditBudgetError): b.CreditBudget(self.client,self.path,max_credits=4000)
    def test_single_voice_v4_dialogue_reservation(self):
        endpoint='/v1/text-to-dialogue?output_format=mp3_44100_128'
        payload={'model_id':'eleven_v4','inputs':[{'text':'hello','voice_id':'catalogue_voice'}]}
        self.assertEqual(self.guard.before(endpoint,payload)['reserved'],3)
        self.assertEqual(self.guard.after()['committedReservations'],3)
        invalid=[dict(payload,model_id='eleven_v3'),dict(payload,inputs=payload['inputs']*2),
                 dict(payload,inputs=[dict(payload['inputs'][0],voice_id='../bad')]),
                 dict(payload,inputs=[dict(payload['inputs'][0],text='')]),
                 dict(payload,inputs=[dict(payload['inputs'][0],extra=True)]),dict(payload,extra=True)]
        for item in invalid:
            with self.assertRaises(b.CreditBudgetError): self.guard.before(endpoint,item)
        with self.assertRaises(b.CreditBudgetError): self.guard.before(endpoint+'&extra=true',payload)
    def test_v4_reserves_supported_languages_without_weakening_contract(self):
        endpoint='/v1/text-to-dialogue?output_format=mp3_44100_128'
        payload={'model_id':'eleven_v4','inputs':[{'text':'Hola, dibujemos.','voice_id':'carito_voice'}], 'language_code':'es'}
        self.assertEqual(self.guard.before(endpoint,payload)['reserved'],8)
        self.guard.after()
        for language in ('en', 'fr'):
            self.assertEqual(self.guard.before(endpoint,dict(payload,language_code=language))['reserved'],8)
            self.guard.after()
        for invalid in ('de', 'es-VE', '', None, 1):
            with self.assertRaises(b.CreditBudgetError): self.guard.before(endpoint,dict(payload,language_code=invalid))
        with self.assertRaises(b.CreditBudgetError): self.guard.before(endpoint,dict(payload,extra=True))
    def test_music_fixed_ceiling_on_supported_paid_tier(self):
        endpoint='/v1/music?output_format=mp3_44100_128'
        payload={'model_id':'music_v2_5','force_instrumental':True,'prompt':'Original quiet instrumental music.','music_length_ms':60000}
        self.account['tier']='starter'
        guard=b.CreditBudget(self.client,self.path.parent/'paid.json',max_credits=4000,credit_ceiling=Decimal('.5'))
        for duration,reserved in ((60000,900),(90000,1350)):
            self.assertEqual(guard.before(endpoint,dict(payload,music_length_ms=duration))['reserved'],reserved)
            guard.after()
        self.assertEqual(guard.inspect()['committedReservations'],2250)
        self.assertEqual(guard._reservation(endpoint,dict(payload,music_length_ms=120000)),(1800,'music'))
        with self.assertRaises(b.CreditBudgetError): guard.before(endpoint,dict(payload,music_length_ms=120000))
    def test_music_rejects_free_tier_and_alternate_charge_shapes(self):
        endpoint='/v1/music?output_format=mp3_44100_128'
        payload={'model_id':'music_v2_5','force_instrumental':True,'prompt':'Original instrumental music.','music_length_ms':60000}
        with self.assertRaises(b.CreditBudgetError): self.guard.before(endpoint,payload)
        self.account['tier']='starter'
        guard=b.CreditBudget(self.client,self.path.parent/'paid.json',max_credits=4000)
        invalid=[dict(payload,model_id='music_v1'),dict(payload,force_instrumental=False),dict(payload,force_instrumental=1),
                 dict(payload,prompt=''),dict(payload,prompt='x'*4101),dict(payload,music_length_ms=60000.0),
                 dict(payload,music_length_ms=True),dict(payload,music_length_ms=30000),
                 dict(payload,music_length_ms=300000),dict(payload,composition_plan={}),dict(payload,extra=True)]
        for item in invalid:
            with self.assertRaises(b.CreditBudgetError): guard.before(endpoint,item)
        self.assertFalse(guard.inspect()['pending'])
        with self.assertRaises(b.CreditBudgetError): guard.before(endpoint+'&extra=true',payload)
    def test_music_and_speech_delayed_billing_share_cumulative_protection(self):
        self.account['tier']='starter'
        guard=b.CreditBudget(self.client,self.path.parent/'paid.json',max_credits=4000)
        guard.before('/v1/music?output_format=mp3_44100_128',{'model_id':'music_v2_5','force_instrumental':True,'prompt':'Original instrumental.','music_length_ms':60000})
        guard.after()
        guard.before('/v1/text-to-dialogue?output_format=mp3_44100_128',{'model_id':'eleven_v4','inputs':[{'text':'hello','voice_id':'voice'}]})
        self.account['character_count']+=903
        state=guard.after()
        self.assertEqual(state['spent'],903); self.assertEqual(state['observedActual'],903)
        self.assertFalse(guard.inspect()['blocked'])
    def test_correlated_received_response_recovers_failed_quota_get(self):
        identity='a'*64
        self.guard.before(PATH,PAYLOAD,request_id=identity)
        self.client.call.side_effect=RuntimeError('temporary quota failure')
        with self.assertRaises(b.CreditBudgetError): self.guard.after(request_id=identity)
        ledger=json.loads(self.path.read_text())
        self.assertEqual(ledger['pending']['requestId'],identity)
        self.client.call.side_effect=lambda endpoint: dict(self.account)
        replacement=b.CreditBudget(self.client,self.path,max_credits=4000)
        self.assertEqual(replacement.inspect()['pendingRequestId'],identity)
        result=replacement.after(request_id=identity)
        self.assertEqual(result['committedReservations'],3)
        self.assertIsNone(replacement.inspect()['pendingRequestId'])
        self.assertTrue(all(c.args == ('/v1/user/subscription',) for c in self.client.call.call_args_list))
    def test_correlated_settlement_rejects_mismatch_without_changing_pending(self):
        identity='a'*64
        self.guard.before(PATH,PAYLOAD,request_id=identity)
        before=json.loads(self.path.read_text())
        calls=self.client.call.call_count
        for invalid in ('b'*64,'A'*64,'a'*63,42):
            with self.assertRaises(b.CreditBudgetError): self.guard.after(request_id=invalid)
            self.assertEqual(json.loads(self.path.read_text()),before)
        self.assertEqual(self.client.call.call_count,calls)
        self.guard.after(request_id=identity)
    def test_request_identity_must_be_canonical_sha256(self):
        for invalid in ('A'*64,'a'*63,'../request',False):
            with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH,PAYLOAD,request_id=invalid)
        self.guard.before(PATH,PAYLOAD)
        with self.assertRaises(b.CreditBudgetError): self.guard.after(request_id='a'*64)
        self.assertTrue(json.loads(self.path.read_text())['pending'])
        self.guard.after()
    def test_batch_aggregate_reservation_and_cumulative_billing(self):
        import hashlib
        ids=['a'*64,'b'*64,'c'*64]
        calls=self.client.call.call_count
        pending=self.guard.before_batch([(PATH,PAYLOAD,identity) for identity in ids])
        expected=hashlib.sha256(json.dumps(ids,separators=(',',':')).encode()).hexdigest()
        self.assertEqual(pending['reserved'],9); self.assertEqual(pending['requestId'],expected)
        self.assertEqual(self.client.call.call_count,calls+1)
        self.assertEqual(self.guard.inspect()['pendingRequestIds'],ids)
        with self.assertRaises(b.CreditBudgetError): self.guard.before(PATH,PAYLOAD)
        with self.assertRaises(b.CreditBudgetError): self.guard.before_batch([(PATH,PAYLOAD,'d'*64)])
        self.account['character_count']+=9
        result=self.guard.after(request_id=expected)
        self.assertEqual(result['committedReservations'],9); self.assertEqual(result['observedActual'],9)
        self.assertEqual(self.guard.inspect()['pendingRequestIds'],[])
    def test_batch_cap_checks_whole_group_before_reserving(self):
        guard=b.CreditBudget(self.client,self.path,max_credits=8)
        with self.assertRaises(b.CreditBudgetError): guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        self.assertFalse(guard.inspect()['pending'])
        self.assertEqual(guard.inspect()['committedReservations'],0)
    def test_batch_rejects_duplicate_ids_and_invalid_payload_without_quota_get(self):
        calls=self.client.call.call_count
        invalid=[[],[(PATH,PAYLOAD,'a'*64)]*2,[(PATH,PAYLOAD,c*64) for c in 'abcd'],
                 [(PATH,PAYLOAD,'short')],[(PATH,dict(PAYLOAD,model_id='unknown'),'a'*64)],
                 [(PATH,PAYLOAD)],[(PATH,PAYLOAD,False)]]
        for batch in invalid:
            with self.assertRaises(b.CreditBudgetError): self.guard.before_batch(batch)
        self.assertEqual(self.client.call.call_count,calls)
        self.assertFalse(self.guard.inspect()['pending'])
    def test_batch_music_paid_tier_limit_and_aggregate_ceiling(self):
        endpoint='/v1/music?output_format=mp3_44100_128'
        payload={'model_id':'music_v2_5','force_instrumental':True,'prompt':'Original instrumental.','music_length_ms':60000}
        requests=[(endpoint,payload,c*64) for c in 'ab']
        with self.assertRaises(b.CreditBudgetError): self.guard.before_batch(requests)
        self.account['tier']='starter'
        guard=b.CreditBudget(self.client,self.path.parent/'paid.json',max_credits=4000)
        with self.assertRaises(b.CreditBudgetError): guard.before_batch(requests+[(PATH,PAYLOAD,'c'*64)])
        pending=guard.before_batch(requests)
        self.assertEqual(pending['reserved'],1800)
        self.account['character_count']+=1800
        self.assertEqual(guard.after(request_id=pending['requestId'])['spent'],1800)
    def test_batch_unknown_outcome_remains_pending_and_legacy_inspection_works(self):
        pending=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'ab'])
        self.client.call.side_effect=RuntimeError('temporary quota error')
        with self.assertRaises(b.CreditBudgetError): self.guard.after(request_id=pending['requestId'])
        self.client.call.side_effect=lambda endpoint:dict(self.account)
        replacement=b.CreditBudget(self.client,self.path,max_credits=4000)
        self.assertEqual(replacement.inspect()['pendingRequestIds'],['a'*64,'b'*64])
        with self.assertRaises(b.CreditBudgetError): replacement.after(request_id='a'*64)
        replacement.after(request_id=pending['requestId'])
        replacement.before(PATH,PAYLOAD,request_id='c'*64)
        self.assertEqual(replacement.inspect()['pendingRequestIds'],['c'*64])
    def test_atomic_transition_uses_one_fresh_get_and_persists_next_group(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        self.account['character_count']+=8
        calls=self.client.call.call_count
        result=self.guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,c*64) for c in 'def'],received_request_ids=[c*64 for c in 'cab'])
        self.assertEqual(self.client.call.call_count,calls+1)
        self.assertEqual(result['settled']['committedReservations'],9)
        self.assertEqual(result['settled']['observedActual'],8)
        self.assertEqual(result['reservation']['reserved'],9)
        ledger=json.loads(self.path.read_text())
        self.assertEqual(ledger['pending'],result['reservation'])
        self.assertEqual(ledger['pending']['requestIds'],[c*64 for c in 'def'])
        self.assertEqual(ledger['pending']['beforeUsed'],self.account['character_count'])
        self.assertEqual(result['snapshot']['pendingRequestIds'],[c*64 for c in 'def'])
        self.assertEqual(result['snapshot']['headroom'],0)
        self.assertEqual(result['snapshot']['unreported'],1)
        self.assertEqual(result['snapshot']['accountRemaining'],4211)
        self.assertEqual(ledger['cap'],4000); self.assertEqual(ledger['minimum'],100)
        with self.assertRaises(b.CreditBudgetError): self.guard.before_batch([(PATH,PAYLOAD,'1'*64)])
        self.assertEqual(self.client.call.call_count,calls+1)
        self.assertTrue(all(c.args==('/v1/user/subscription',) for c in self.client.call.call_args_list))
    def test_dispatch_verification_recalculates_actual_cost_without_get_or_mutation(self):
        requests=[(PATH,PAYLOAD,c*64) for c in 'ab']
        pending=self.guard.before_batch(requests)
        before=self.path.read_bytes(); calls=self.client.call.call_count
        verified=self.guard.verify_batch_reservation(pending['requestId'],requests)
        self.assertEqual(verified,pending)
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
        verified['requestIds'].append('c'*64)
        self.assertEqual(self.guard.snapshot()['pendingRequestIds'],['a'*64,'b'*64])
        enlarged=[(PATH,dict(PAYLOAD,text='large paid input '*100),'a'*64),(PATH,PAYLOAD,'b'*64)]
        with self.assertRaises(b.CreditBudgetError): self.guard.verify_batch_reservation(pending['requestId'],enlarged)
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
    def test_dispatch_verification_rejects_wrong_member_order_group_and_endpoint(self):
        requests=[(PATH,PAYLOAD,c*64) for c in 'ab']; pending=self.guard.before_batch(requests)
        before=self.path.read_bytes(); calls=self.client.call.call_count
        invalid=[(None,requests),('f'*64,requests),(pending['requestId'],list(reversed(requests))),
                 (pending['requestId'],[(PATH,PAYLOAD,'c'*64)]),
                 (pending['requestId'],[('/v1/music',PAYLOAD,'a'*64)]),
                 (pending['requestId'],[(PATH,dict(PAYLOAD,model_id='unknown'),'a'*64)])]
        for identity,actual in invalid:
            with self.assertRaises(b.CreditBudgetError): self.guard.verify_batch_reservation(identity,actual)
            self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
    def test_dispatch_verification_rejects_missing_blocked_or_modified_durable_grant(self):
        requests=[(PATH,PAYLOAD,'a'*64)]
        with self.assertRaises(b.CreditBudgetError): self.guard.verify_batch_reservation('a'*64,requests)
        pending=self.guard.before_batch(requests); original=json.loads(self.path.read_text()); calls=self.client.call.call_count
        variants=[dict(original,blocked=True)]
        for field,value in (('kind','speech'),('reserved',1),('requestId','b'*64),('requestIds',['b'*64])):
            variants.append(dict(original,pending=dict(original['pending'],**{field:value})))
        for ledger in variants:
            self.path.write_text(json.dumps(ledger)); before=self.path.read_bytes()
            with self.assertRaises(b.CreditBudgetError): self.guard.verify_batch_reservation(pending['requestId'],requests)
            self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
    def test_dispatch_verification_does_not_turn_free_speech_grant_into_music(self):
        # Both ceilings are 900; endpoint/model identity is also bound by the
        # generator's canonical spec hash, while this layer retains tier rules.
        requests=[(PATH,dict(PAYLOAD,text='x'*1800),'a'*64)]
        pending=self.guard.before_batch(requests); calls=self.client.call.call_count
        music={'model_id':'music_v2_5','force_instrumental':True,'prompt':'Original instrumental.','music_length_ms':60000}
        before=self.path.read_bytes()
        with self.assertRaises(b.CreditBudgetError): self.guard.verify_batch_reservation(pending['requestId'],[('/v1/music?output_format=mp3_44100_128',music,'a'*64)])
        self.assertEqual(self.path.read_bytes(),before); self.assertEqual(self.client.call.call_count,calls)
    def test_dispatch_verification_observes_reduced_durable_cap_for_stale_guard(self):
        guard=b.CreditBudget(self.client,self.path,max_credits=10)
        requests=[(PATH,PAYLOAD,'a'*64)]; pending=guard.before_batch(requests)
        lowered=b.CreditBudget(self.client,self.path,max_credits=1)
        before=self.path.read_bytes(); calls=self.client.call.call_count
        for instance in (guard,lowered):
            with self.assertRaises(b.CreditBudgetError): instance.verify_batch_reservation(pending['requestId'],requests)
        self.assertEqual(self.path.read_bytes(),before); self.assertEqual(self.client.call.call_count,calls)
        ledger=json.loads(self.path.read_text()); self.assertEqual(ledger['cap'],1)
        self.assertEqual(ledger['pending']['reserved'],3)
    def test_dispatch_verification_observes_increased_account_reserve(self):
        requests=[(PATH,PAYLOAD,'a'*64)]; pending=self.guard.before_batch(requests)
        protected=b.CreditBudget(self.client,self.path,max_credits=4000,min_remaining=4218)
        before=self.path.read_bytes(); calls=self.client.call.call_count
        for instance in (self.guard,protected):
            with self.assertRaises(b.CreditBudgetError): instance.verify_batch_reservation(pending['requestId'],requests)
        self.assertEqual(self.path.read_bytes(),before); self.assertEqual(self.client.call.call_count,calls)
    def test_snapshot_is_read_only_and_cannot_replace_fresh_authorisation(self):
        before=self.path.read_bytes(); calls=self.client.call.call_count
        self.account['character_count']=9899
        state=self.guard.snapshot()
        self.assertEqual(state['accountRemaining'],4219)
        self.assertEqual(self.client.call.call_count,calls)
        self.assertEqual(self.path.read_bytes(),before)
        with self.assertRaises(b.CreditBudgetError): self.guard.before_batch([(PATH,PAYLOAD,'a'*64)])
        self.assertEqual(self.client.call.call_count,calls+1)
        self.assertTrue(json.loads(self.path.read_text())['blocked'])
    def test_transition_rejects_missing_unknown_or_duplicate_response_members(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        before=self.path.read_bytes(); calls=self.client.call.call_count
        for received in ([],['a'*64],['a'*64,'b'*64,'d'*64],['a'*64,'b'*64,'c'*64,'d'*64],['a'*64]*3,['a'*63,'b'*64,'c'*64],None,'a'*64):
            with self.subTest(received=received):
                with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,'d'*64)],received_request_ids=received)
                self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
    def test_transition_requires_exact_previous_batch_identity(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'ab'])
        before=self.path.read_bytes(); calls=self.client.call.call_count
        for identity in (None,42,'A'*64,'a'*63,'a'*64,'b'*64):
            with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(identity,[(PATH,PAYLOAD,'d'*64)],received_request_ids=[c*64 for c in 'ab'])
            self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
        self.guard.after(request_id=previous['requestId'])
        with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,'d'*64)],received_request_ids=[c*64 for c in 'ab'])
        self.guard.before(PATH,PAYLOAD,request_id='a'*64)
        with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch('a'*64,[(PATH,PAYLOAD,'d'*64)],received_request_ids=['a'*64])
        self.assertEqual(json.loads(self.path.read_text())['pending']['requestId'],'a'*64)
        self.guard.after(request_id='a'*64)
    def test_transition_rejects_invalid_or_repeated_next_group_without_mutation(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        before=self.path.read_bytes(); calls=self.client.call.call_count
        invalid=[[],[(PATH,PAYLOAD,'d'*64)]*2,[(PATH,PAYLOAD,c*64) for c in 'def0'],[(PATH,dict(PAYLOAD,model_id='unknown'),'d'*64)],[(PATH,PAYLOAD,'b'*64)]]
        for batch in invalid:
            with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(previous['requestId'],batch,received_request_ids=[c*64 for c in 'abc'])
            self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.client.call.call_count,calls)
    def test_transition_quota_failure_retains_previous_pending_for_known_audio_recovery(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'ab'])
        self.client.call.side_effect=RuntimeError('provider-private-diagnostic')
        with self.assertRaises(b.CreditBudgetError) as error: self.guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,'c'*64)],received_request_ids=[c*64 for c in 'ab'])
        self.assertNotIn('provider-private',str(error.exception))
        ledger=json.loads(self.path.read_text()); self.assertEqual(ledger['pending']['requestId'],previous['requestId'])
        self.assertEqual(ledger['committedReservations'],0)
        self.client.call.side_effect=lambda endpoint:dict(self.account)
        replacement=b.CreditBudget(self.client,self.path,max_credits=4000)
        self.assertEqual(replacement.after(request_id=previous['requestId'])['committedReservations'],6)
    def test_transition_reset_limit_tier_and_decreasing_count_keep_prior_unsettled(self):
        for index,(field,value) in enumerate((('next_character_count_reset_unix',123457),('character_limit',20000),('tier','creator'),('character_count',5780))):
            with self.subTest(field=field):
                guard=b.CreditBudget(self.client,self.path.parent/f'reset-{index}.json',max_credits=4000)
                previous=guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
                old=self.account[field]; self.account[field]=value
                with self.assertRaises(b.CreditBudgetError): guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,'d'*64)],received_request_ids=[c*64 for c in 'abc'])
                ledger=json.loads(guard.path.read_text())
                self.assertTrue(ledger['blocked']); self.assertEqual(ledger['committedReservations'],0)
                self.assertEqual(ledger['pending']['requestId'],previous['requestId'])
                self.account[field]=old
    def test_transition_never_authorises_when_overages_enabled(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        before=self.path.read_bytes(); self.account['can_extend_character_limit']=True
        with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,'d'*64)],received_request_ids=[c*64 for c in 'abc'])
        self.assertEqual(self.path.read_bytes(),before)
    def test_transition_external_usage_excess_settles_known_group_and_blocks_next(self):
        previous=self.guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        self.account['character_count']+=10; calls=self.client.call.call_count
        with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,c*64) for c in 'def'],received_request_ids=[c*64 for c in 'abc'])
        ledger=json.loads(self.path.read_text())
        self.assertIsNone(ledger['pending']); self.assertTrue(ledger['blocked'])
        self.assertEqual(ledger['committedReservations'],9); self.assertEqual(ledger['spent'],10)
        self.assertEqual(ledger['actualAccountDelta'],10)
        self.assertEqual(self.client.call.call_count,calls+1)
    def test_transition_next_cap_failure_keeps_previous_settled_without_next_permission(self):
        guard=b.CreditBudget(self.client,self.path,max_credits=17)
        previous=guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        self.account['character_count']+=9; calls=self.client.call.call_count
        with self.assertRaises(b.CreditBudgetError): guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,c*64) for c in 'def'],received_request_ids=[c*64 for c in 'abc'])
        ledger=json.loads(self.path.read_text())
        self.assertIsNone(ledger['pending']); self.assertFalse(ledger['blocked'])
        self.assertEqual(ledger['committedReservations'],9); self.assertEqual(ledger['cap'],17)
        self.assertEqual(self.client.call.call_count,calls+1)
        self.assertEqual(guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'de'])['reserved'],6)
    def test_transition_respects_account_reserve_and_delayed_commitments(self):
        guard=b.CreditBudget(self.client,self.path,max_credits=4000,min_remaining=4205)
        previous=guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
        self.account['character_count']+=9
        with self.assertRaises(b.CreditBudgetError): guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,c*64) for c in 'def'],received_request_ids=[c*64 for c in 'abc'])
        ledger=json.loads(self.path.read_text())
        self.assertIsNone(ledger['pending']); self.assertFalse(ledger['blocked'])
        self.assertEqual(ledger['committedReservations'],9); self.assertEqual(ledger['minimum'],4205)
        self.assertEqual(guard.snapshot()['headroom'],5)
        self.assertEqual(guard.before_batch([(PATH,PAYLOAD,'d'*64)])['reserved'],3)
    def test_transition_music_rules_reject_next_group_after_settling_prior(self):
        endpoint='/v1/music?output_format=mp3_44100_128'
        payload={'model_id':'music_v2_5','force_instrumental':True,'prompt':'Original instrumental.','music_length_ms':60000}
        previous=self.guard.before_batch([(PATH,PAYLOAD,'a'*64)])
        with self.assertRaises(b.CreditBudgetError): self.guard.after_and_before_batch(previous['requestId'],[(endpoint,payload,'b'*64)],received_request_ids=['a'*64])
        ledger=json.loads(self.path.read_text())
        self.assertIsNone(ledger['pending']); self.assertEqual(ledger['committedReservations'],3)
        self.assertFalse(ledger['blocked'])
    def test_transition_persistence_failure_never_returns_next_reservation(self):
        for fail_at in (1,2,3):
            with self.subTest(save=fail_at):
                guard=b.CreditBudget(self.client,self.path.parent/f'io-{fail_at}.json',max_credits=4000)
                previous=guard.before_batch([(PATH,PAYLOAD,c*64) for c in 'abc'])
                real_atomic=b.atomic; writes=[]
                def fail_save(path,data):
                    writes.append(1)
                    if len(writes)==fail_at: raise OSError('private-filesystem-details')
                    real_atomic(path,data)
                with patch.object(b,'atomic',side_effect=fail_save):
                    with self.assertRaises(b.CreditBudgetError) as error: guard.after_and_before_batch(previous['requestId'],[(PATH,PAYLOAD,c*64) for c in 'def'],received_request_ids=[c*64 for c in 'abc'])
                self.assertNotIn('private-filesystem',str(error.exception))
                ledger=json.loads(guard.path.read_text())
                self.assertNotEqual(ledger['pending'].get('requestIds') if ledger['pending'] else None,[c*64 for c in 'def'])
                if fail_at<3:
                    self.assertEqual(ledger['pending']['requestId'],previous['requestId'])
                    self.assertEqual(ledger['committedReservations'],0)
                    self.assertEqual(guard.after(request_id=previous['requestId'])['committedReservations'],9)
                else:
                    self.assertIsNone(ledger['pending']); self.assertEqual(ledger['committedReservations'],9)
    def test_preflight_and_numeric_limits(self):
        self.assertEqual(self.guard.preflight(4000)['headroom'],4000)
        with self.assertRaises(b.CreditBudgetError): self.guard.preflight(4001)
        for number in (True, float('inf'), -1, '4000', 1.5):
            with self.assertRaises(b.CreditBudgetError): b.integer(number)
        self.assertEqual(b.integer(Decimal('4219')),4219)
unittest.main(argv=['offline-credit-tests'], verbosity=2)
`
test('Credit guard: offline quota, cap, durable reservations and race checks', () => {
  const result = spawnSync('python3', ['-B', '-c', checks], { cwd: new URL('../', import.meta.url), encoding:'utf8', timeout:30000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
