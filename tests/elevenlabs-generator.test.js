import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const pythonTests = String.raw`
import importlib.util, json, os, runpy, sys, tempfile, threading, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
spec = importlib.util.spec_from_file_location('generator', 'scripts/elevenlabs-audio.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
budget_spec = importlib.util.spec_from_file_location('elevenlabs_credit_budget', 'scripts/elevenlabs_credit_budget.py')
b = importlib.util.module_from_spec(budget_spec); budget_spec.loader.exec_module(b)
sys.modules['elevenlabs_credit_budget'] = b
def args(**values):
    return SimpleNamespace(**dict(dict(model_id='eleven_multilingual_v2', voice_id='catalogue-voice', music_seconds=120, kind='all', sample_only=False), **values))
LESSON_MUSIC={name:{'level':'basic','seconds':90,'prompt':f'Original gentle {name} instrumental fixture.'}
              for name in ('sun','rainbow','balloon')}
def plan(**values):
    with patch.object(g,'lesson_music_catalogue',return_value=LESSON_MUSIC):
        return g.make_plan(args(**values), {'sample': 'Hello.', **{
            f'{name}/head/instruction':'Draw a circle.' for name in ('cat','sun','rainbow','balloon')}})
class GeneratorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.spec = next(iter(plan(kind='speech')['requests'].values()))
        self.client = Mock()
        self.client.call.return_value = b'original provider audio'
    def tearDown(self):
        self.temp.cleanup()
    def normalized(self, raw, destination, spec):
        destination.write_bytes(b'normalised mp3')
        return 1.2
    def main_fixture(self, count=6):
        fixture=SimpleNamespace(directory=self.directory/'media'/'elevenlabs',posted=[],posts=[],quota_gets=0,on_post=None,fail_text=None,lock=threading.Lock())
        fixture.texts={'sample':'Fixture drawing instruction number zero.'}
        fixture.texts.update({f'fixture-{i}/shape/instruction':f'Fixture drawing instruction number {i}.' for i in range(1,count)})
        with patch.object(g,'lesson_music_catalogue',return_value={}):
            fixture.plan=g.make_plan(args(kind='speech',model_id='eleven_v4',music_seconds=90),fixture.texts)
        fixture.ids_by_payload={g.canonical(item['payload']):identity for identity,item in fixture.plan['requests'].items()}
        fixture.account={'character_count':100,'character_limit':10000,'tier':'creator','can_extend_character_limit':False,'max_credit_limit_extension':0,'next_character_count_reset_unix':123456}
        fixture.ledger=fixture.directory/'integration.json'
        fixture.argv=['--generate','--kind','speech','--voice-id','catalogue-voice','--model-id','eleven_v4','--music-seconds','90','--workers','3','--existing-credits-only','--max-credits','4000','--speech-credit-ceiling','0.5','--credit-ledger','integration.json']
        owner=self
        class OfflineClient:
            def __init__(self,key): self.key=key
            def voices(self,voice_id=None): return [{'voice_id':'catalogue-voice'}]
            def call(self,path,payload=None):
                with fixture.lock:
                    if payload is None:
                        if path=='/v1/models': return [{'model_id':'eleven_v4','can_do_text_to_speech':True,'model_rates':{'character_cost_multiplier':0.5}}]
                        owner.assertEqual(path,'/v1/user/subscription')
                        fixture.quota_gets+=1
                        return dict(fixture.account)
                    owner.assertEqual(path,'/v1/text-to-dialogue?output_format=mp3_44100_128')
                    identity=fixture.ids_by_payload[g.canonical(payload)]
                    ledger=json.loads(fixture.ledger.read_text())
                    owner.assertIn(identity,ledger['pending']['requestIds'],'POST requires a durably saved reservation for this exact member')
                    owner.assertFalse(ledger['blocked'])
                    text=payload['inputs'][0]['text']
                    fixture.posted.append(text)
                    fixture.posts.append({'identity':identity,'quota_gets':fixture.quota_gets,'committed':ledger['committedReservations'],'pending':dict(ledger['pending'])})
                    if fixture.on_post: fixture.on_post(identity)
                    if text==fixture.fail_text: raise g.SafeError('Unknown provider response')
                    fixture.account['character_count']+=(len(text)+1)//2
                    return b'offline provider audio: '+text.encode()
        fixture.Client=OfflineClient
        return fixture
    def run_main_fixture(self,fixture):
        with patch.object(g,'ROOT',self.directory), patch.object(g,'catalogue_texts',return_value=fixture.texts), patch.object(g,'lesson_music_catalogue',return_value={}), patch.object(g,'load_key',return_value='offline-key'), patch.object(g,'APIClient',fixture.Client), patch.object(g.shutil,'which',return_value='/offline/tool'), patch.object(g,'normalize',side_effect=self.normalized), patch('builtins.print') as printed:
            g.main(fixture.argv)
            return [json.loads(call.args[0]) for call in printed.call_args_list]
    def test_plan_deduplicates_and_bounds(self):
        p = plan()
        self.assertEqual(len(p['requests']), 8)
        self.assertEqual(len(p['entries']), 11)
        self.assertEqual(p['entries']['cat/head/instruction'], p['entries']['sun/head/instruction'])
        self.assertEqual(p['speechCharacters'], len('Hello.Draw a circle.'))
        for item in p['requests'].values():
            if item['kind'] == 'music':
                self.assertTrue(item['payload']['force_instrumental'])
                self.assertEqual(item['payload']['music_length_ms'], 90000 if item['payload']['prompt'] in {spec['prompt'] for spec in LESSON_MUSIC.values()} else 120000)
                self.assertEqual(item['payload']['model_id'], 'music_v2_5')
        for change in ({'music_seconds': 301}, {'music_seconds': 2}, {'model_id': 'invented'}, {'voice_id': '../voice'}):
            with self.assertRaises(g.SafeError): plan(**change)
        self.assertNotEqual(plan()['entries']['sample'], plan(model_id='eleven_v4')['entries']['sample'])
        self.assertEqual(set(g.voice_settings('eleven_v4')), {'stability', 'similarity_boost'})
        v4 = next(iter(plan(kind='speech', sample_only=True, model_id='eleven_v4')['requests'].values()))
        self.assertEqual(v4['path'], '/v1/text-to-dialogue?output_format=mp3_44100_128')
        self.assertEqual(v4['payload']['inputs'], [{'text':'Hello.', 'voice_id':'catalogue-voice'}])
        self.assertEqual(g.speech_text(v4), 'Hello.')
        self.assertNotIn('voice_settings', v4['payload'])
        self.assertEqual(v4['encoding']['rate'], 44100)
        self.assertEqual(v4['encoding']['bitrate'], '128k')
    def test_pilot_scope_retains_sample_and_rejects_unknown_lessons(self):
        p = plan(kind='speech', lessons='cat')
        self.assertEqual(set(p['entries']), {'sample', 'cat/head/instruction'})
        with self.assertRaises(g.SafeError): plan(lessons='invented')
        self.assertFalse(any(key.startswith('music/lesson/') for key in plan(lessons='cat')['entries']))
        for lesson in LESSON_MUSIC:
            selected=plan(lessons=lesson)['entries']
            self.assertEqual({key for key in selected if key.startswith('music/lesson/')},{f'music/lesson/{lesson}'})
            self.assertTrue({'music/basic','music/intermediate','music/expert'} <= set(selected))
    def test_real_authored_catalogue(self):
        texts = g.catalogue_texts()
        p = g.make_plan(args(), texts)
        self.assertGreater(len(texts), 1300)
        self.assertEqual(len(g.lesson_music_catalogue()),30)
        self.assertEqual(set(p['entries']), set(texts) | {'music/basic', 'music/intermediate', 'music/expert'} | {f'music/lesson/{name}' for name in g.lesson_music_catalogue()})
        for name, text in texts.items():
            self.assertEqual(p['requests'][p['entries'][name]]['payload']['text'], text)
    def test_three_subject_beds_are_distinct_without_changing_level_request_identities(self):
        p=plan(kind='music',music_seconds=90)
        self.assertEqual(set(p['entries']),{'music/basic','music/intermediate','music/expert'} | {f'music/lesson/{name}' for name in LESSON_MUSIC})
        self.assertEqual(len(p['requests']),6)
        self.assertEqual(len(set(p['entries'].values())),6)
        for level,prompt in g.MUSIC_PROMPTS.items():
            spec={'kind':'music','path':'/v1/music?output_format=mp3_44100_128',
                  'payload':{'prompt':prompt,'model_id':'music_v2_5','music_length_ms':90000,'force_instrumental':True},
                  'apiContractDate':g.CONTRACT_DATE,'encoding':g.ENCODING['music']}
            self.assertEqual(p['entries'][f'music/{level}'],g.sha(g.canonical(spec)))
        for name,authored in LESSON_MUSIC.items():
            spec=p['requests'][p['entries'][f'music/lesson/{name}']]
            self.assertEqual(spec['payload']['prompt'],authored['prompt'])
            self.assertEqual(spec['payload']['music_length_ms'],90000)
            self.assertNotIn('voiceId',spec)
    def test_music_bundle_retains_all_level_fallbacks_and_separate_lesson_identity(self):
        p=plan(kind='music',music_seconds=90)
        with patch.object(g,'normalize',side_effect=self.normalized):
            records={key:g.generate_one(self.client,self.directory,spec) for key,spec in p['requests'].items()}
        bundle=g.build_bundle(self.directory,p,records)
        manifest=json.loads((bundle.parent/'music-manifest.json').read_text())
        self.assertEqual(set(manifest['levels']),set(g.MUSIC_PROMPTS))
        self.assertEqual(set(manifest['lessons']),set(LESSON_MUSIC))
        for name,authored in LESSON_MUSIC.items():
            self.assertEqual(manifest['lessons'][name]['generationSettings']['prompt'],authored['prompt'])
        descriptor=json.loads(bundle.read_text())
        self.assertEqual(set(descriptor['musicLessons']),set(LESSON_MUSIC))
        self.assertEqual(set(descriptor['musicLevels']),set(g.MUSIC_PROMPTS))
    def test_authored_registry_rejects_unknown_misassigned_or_unbounded_music(self):
        reader=runpy.run_path('scripts/authored-music.py')['read_catalogue']
        root=self.directory/'authored'; (root/'src').mkdir(parents=True)
        path=root/'src/lesson-music-catalogue.json'
        lessons=[{'id':name,'level':'basic','musicId':name} for name in LESSON_MUSIC]+[
            {'id':f'fixture-{i}','level':'basic','musicId':None} for i in range(27)]
        with patch.object(g.subprocess,'check_output',return_value=json.dumps(lessons)):
            path.write_text(json.dumps(LESSON_MUSIC))
            self.assertEqual(reader(root),LESSON_MUSIC)
            for field,value in [('level','expert'),('seconds',120),('seconds',True),('prompt',''),('unknown','/other.mp3')]:
                invalid={**LESSON_MUSIC,'sun':{**LESSON_MUSIC['sun'],field:value}}
                path.write_text(json.dumps(invalid))
                with self.assertRaises(ValueError): reader(root)
            path.write_text(json.dumps({'unknown':LESSON_MUSIC['sun']}))
            with self.assertRaises(ValueError): reader(root)
            path.write_text('{"sun":{},"sun":{}}')
            with self.assertRaises(ValueError): reader(root)
    def test_success_reuses_verified_cache(self):
        with patch.object(g, 'normalize', side_effect=self.normalized):
            first = g.generate_one(self.client, self.directory, self.spec)
            second = g.generate_one(self.client, self.directory, self.spec)
        self.assertEqual(first, second)
        self.assertEqual(self.client.call.call_count, 1)
        self.assertEqual(first['provider'], 'ElevenLabs')
        self.assertEqual(first['status'], 'complete')
        path = self.directory / 'cache' / self.spec['cacheKey'] / 'normalised.mp3'
        path.write_bytes(b'tampered')
        with self.assertRaises(g.SafeError): g.generate_one(self.client, self.directory, self.spec)
        self.assertEqual(self.client.call.call_count, 1)
    def test_unknown_post_never_retried(self):
        self.client.call.side_effect = g.SafeError('Unknown result')
        for _ in range(2):
            with self.assertRaises(g.SafeError): g.generate_one(self.client, self.directory, self.spec)
        self.assertEqual(self.client.call.call_count, 1)
        receipt = json.loads((self.directory / 'cache' / self.spec['cacheKey'] / 'receipt.json').read_text())
        self.assertEqual(receipt['status'], 'pending-unknown')
    def test_normalization_recovers_without_paid_repeat(self):
        with patch.object(g, 'normalize', side_effect=g.SafeError('Failed normalisation')):
            with self.assertRaises(g.SafeError): g.generate_one(self.client, self.directory, self.spec)
        with patch.object(g, 'normalize', side_effect=self.normalized):
            record = g.generate_one(self.client, self.directory, self.spec)
        self.assertEqual(record['status'], 'complete')
        self.assertEqual(self.client.call.call_count, 1)
    def test_group_reserves_before_posts_and_settles_all_received(self):
        specs = list(plan(kind='speech')['requests'].values())
        guard = Mock(); guard.before_batch.return_value = {'requestId':'b'*64}
        clients = []
        def factory():
            self.assertTrue(guard.before_batch.called)
            client = Mock(); client.call.return_value = b'provider mp3'; clients.append(client); return client
        with patch.object(g, 'normalize', side_effect=self.normalized):
            records = g.generate_batch(factory,self.directory,specs,guard)
        self.assertEqual(len(records),2)
        guard.after.assert_called_once_with(request_id='b'*64)
        self.assertTrue(all(client.call.call_count == 1 for client in clients))
    def test_unknown_group_member_blocks_settlement_and_is_not_retried(self):
        specs = list(plan(kind='speech')['requests'].values())
        guard=Mock(); guard.before_batch.return_value={'requestId':'b'*64}
        clients=[Mock(),Mock()]; clients[0].call.return_value=b'provider mp3'
        clients[1].call.side_effect=g.SafeError('Unknown outcome')
        pending=iter(clients)
        with patch.object(g,'normalize',side_effect=self.normalized):
            with self.assertRaises(g.SafeError): g.generate_batch(lambda:next(pending),self.directory,specs,guard)
        guard.after.assert_not_called()
        self.assertTrue(all(client.call.call_count == 1 for client in clients))
        self.assertTrue(g.received_audio(self.directory,specs[0]['cacheKey']))
        self.assertFalse(g.received_audio(self.directory,specs[1]['cacheKey']))
    def test_processing_failure_settles_known_group_without_reposting(self):
        specs=list(plan(kind='speech')['requests'].values())
        guard=Mock(); guard.before_batch.return_value={'requestId':'b'*64}
        with patch.object(g,'normalize',side_effect=g.SafeError('Local processing failed')):
            with self.assertRaises(g.SafeError): g.generate_batch(lambda:self.client,self.directory,specs,guard)
        guard.after.assert_called_once_with(request_id='b'*64)
        self.assertEqual(self.client.call.call_count,2)
        with patch.object(g,'normalize',side_effect=self.normalized):
            for spec in specs: g.generate_one(self.client,self.directory,spec)
        self.assertEqual(self.client.call.call_count,2)
    def test_existing_reservation_dispatch_does_not_reserve_or_settle_twice(self):
        specs=list(plan(kind='speech')['requests'].values())
        account=self.main_fixture().account
        quota=Mock(); quota.call.side_effect=lambda endpoint:dict(account)
        guard=b.CreditBudget(quota,self.directory/'reserved.json',max_credits=4000)
        reservation=guard.before_batch([(spec['path'],spec['payload'],spec['cacheKey']) for spec in specs])
        calls=quota.call.call_count
        with patch.object(guard,'before_batch',wraps=guard.before_batch) as before, patch.object(guard,'after',wraps=guard.after) as after, patch.object(g,'normalize',side_effect=self.normalized):
            records=g.generate_batch(lambda:self.client,self.directory,specs,guard,reservation=reservation,defer_settlement=True)
        self.assertEqual(len(records),len(specs)); before.assert_not_called(); after.assert_not_called()
        self.assertEqual(quota.call.call_count,calls,'Snapshot identity verification must not issue another quota GET')
        self.assertEqual(guard.snapshot()['pendingRequestId'],reservation['requestId'])
        self.assertTrue(all(g.received_audio(self.directory,spec['cacheKey']) for spec in specs))
        guard.after(request_id=reservation['requestId'])
    def test_existing_reservation_mismatch_or_blocked_ledger_never_dispatches(self):
        specs=list(plan(kind='speech')['requests'].values()); account=self.main_fixture().account
        quota=Mock(); quota.call.side_effect=lambda endpoint:dict(account)
        guard=b.CreditBudget(quota,self.directory/'reserved.json',max_credits=4000)
        reservation=guard.before_batch([(spec['path'],spec['payload'],spec['cacheKey']) for spec in specs])
        factory=Mock(return_value=self.client)
        for invalid in (dict(reservation,requestId='f'*64),dict(reservation,requestIds=list(reversed(reservation['requestIds'])))):
            with self.assertRaises((g.SafeError,b.CreditBudgetError)): g.generate_batch(factory,self.directory,specs,guard,reservation=invalid,defer_settlement=True)
        original=json.loads(guard.path.read_text())
        for ledger in (dict(original,pending=dict(original['pending'],requestIds=['f'*64])),dict(original,blocked=True)):
            guard.path.write_text(json.dumps(ledger))
            with self.assertRaises((g.SafeError,b.CreditBudgetError)): g.generate_batch(factory,self.directory,specs,guard,reservation=reservation,defer_settlement=True)
        factory.assert_not_called(); self.client.call.assert_not_called()
    def test_mutated_canonical_payload_path_or_hash_never_dispatches(self):
        account=self.main_fixture().account
        variants=[]
        for text in ('X'*len(self.spec['payload']['text']),'A much longer paid text. '*100):
            changed=json.loads(json.dumps(self.spec)); changed['payload']['text']=text; variants.append(changed)
        changed=json.loads(json.dumps(self.spec)); changed['path']='/v1/text-to-speech/other_voice?output_format=mp3_44100_128'; variants.append(changed)
        changed=json.loads(json.dumps(self.spec)); changed['cacheKey']='e'*64; variants.append(changed)
        changed=json.loads(json.dumps(self.spec)); changed['encoding']['rate']=8000; variants.append(changed)
        for index,actual in enumerate(variants):
            with self.subTest(change=index):
                quota=Mock(); quota.call.side_effect=lambda endpoint:dict(account)
                guard=b.CreditBudget(quota,self.directory/f'changed-{index}.json',max_credits=4000)
                reservation=guard.before_batch([(self.spec['path'],self.spec['payload'],actual['cacheKey'])])
                provider=Mock(); provider.call.return_value=b'offline provider response'
                before=guard.path.read_bytes(); calls=quota.call.call_count; factory=Mock(return_value=provider)
                with self.assertRaises((g.SafeError,b.CreditBudgetError)): g.generate_batch(factory,self.directory,[actual],guard,reservation=reservation,defer_settlement=True)
                factory.assert_not_called(); provider.call.assert_not_called()
                self.assertEqual(guard.path.read_bytes(),before)
                self.assertEqual(quota.call.call_count,calls)
    def test_canonical_large_spec_cannot_reuse_cheap_reservation_even_with_forged_metadata(self):
        actual=json.loads(json.dumps(self.spec))
        actual['payload']['text']='A longer authored instruction that costs more. '*30
        actual['cacheKey']=g.sha(g.canonical({key:value for key,value in actual.items() if key not in ('cacheKey','estimatedUsd')}))
        actual['estimatedUsd']='0.000001'
        account=self.main_fixture().account; quota=Mock(); quota.call.side_effect=lambda endpoint:dict(account)
        guard=b.CreditBudget(quota,self.directory/'underreserved.json',max_credits=4000)
        reservation=guard.before_batch([(actual['path'],self.spec['payload'],actual['cacheKey'])])
        self.assertLess(reservation['reserved'],(len(actual['payload']['text'])+1)//2)
        forged=dict(reservation,reserved=(len(actual['payload']['text'])+1)//2)
        before=guard.path.read_bytes(); calls=quota.call.call_count; factory=Mock(return_value=self.client)
        with self.assertRaises((g.SafeError,b.CreditBudgetError)): g.generate_batch(factory,self.directory,[actual],guard,reservation=forged,defer_settlement=True)
        factory.assert_not_called(); self.client.call.assert_not_called()
        self.assertEqual(guard.path.read_bytes(),before)
        self.assertEqual(quota.call.call_count,calls,'Existing dispatch verification must stay offline')
    def test_reduced_cap_invalidates_stale_reservation_before_factory_or_post(self):
        actual=self.spec; account=self.main_fixture().account
        quota=Mock(); quota.call.side_effect=lambda endpoint:dict(account)
        guard=b.CreditBudget(quota,self.directory/'reduced.json',max_credits=10)
        reservation=guard.before_batch([(actual['path'],actual['payload'],actual['cacheKey'])])
        self.assertEqual(reservation['reserved'],3)
        b.CreditBudget(quota,guard.path,max_credits=1)
        before=guard.path.read_bytes(); calls=quota.call.call_count; factory=Mock(return_value=self.client)
        with self.assertRaises((g.SafeError,b.CreditBudgetError)): g.generate_batch(factory,self.directory,[actual],guard,reservation=reservation,defer_settlement=True)
        factory.assert_not_called(); self.client.call.assert_not_called()
        self.assertEqual(guard.path.read_bytes(),before); self.assertEqual(quota.call.call_count,calls)
    def test_deferred_processing_failure_settles_received_audio_before_error(self):
        specs=list(plan(kind='speech')['requests'].values()); account=self.main_fixture().account
        quota=Mock(); quota.call.side_effect=lambda endpoint:dict(account)
        guard=b.CreditBudget(quota,self.directory/'reserved.json',max_credits=4000)
        reservation=guard.before_batch([(spec['path'],spec['payload'],spec['cacheKey']) for spec in specs])
        with patch.object(guard,'after',wraps=guard.after) as after, patch.object(g,'normalize',side_effect=g.SafeError('Local processing failed')):
            with self.assertRaisesRegex(g.SafeError,'Local processing failed'): g.generate_batch(lambda:self.client,self.directory,specs,guard,reservation=reservation,defer_settlement=True)
        after.assert_called_once_with(request_id=reservation['requestId'])
        state=guard.snapshot(); self.assertFalse(state['pending']); self.assertEqual(state['committedReservations'],reservation['reserved'])
        self.assertTrue(all(g.received_audio(self.directory,spec['cacheKey']) for spec in specs))
        with patch.object(g,'normalize',side_effect=self.normalized):
            for spec in specs: g.generate_one(self.client,self.directory,spec)
        self.assertEqual(self.client.call.call_count,len(specs),'Recovering received audio must never POST again')
    def test_main_chains_fresh_boundary_checks_and_persists_before_each_post(self):
        fixture=self.main_fixture()
        transition=b.CreditBudget.after_and_before_batch
        with patch.object(b.CreditBudget,'after_and_before_batch',autospec=True,side_effect=transition) as chained:
            output=self.run_main_fixture(fixture)
        self.assertEqual(len(fixture.posted),6); self.assertEqual(len(set(fixture.posted)),6)
        chained.assert_called_once()
        self.assertEqual(fixture.posts[3]['quota_gets'],fixture.posts[0]['quota_gets']+1,'One fresh quota GET should cover the intervening batch boundary')
        first_group=fixture.posts[:3]; second_group=fixture.posts[3:]
        self.assertTrue(all(item['committed']==0 for item in first_group))
        self.assertTrue(all(item['committed']>0 for item in second_group))
        state=json.loads(fixture.ledger.read_text())
        self.assertIsNone(state['pending']); self.assertFalse(state['blocked'])
        self.assertEqual(state['committedReservations'],fixture.account['character_count']-100)
        self.assertEqual(output[-1]['mode'],'staged-unreviewed')
        before=list(fixture.posted); self.run_main_fixture(fixture)
        self.assertEqual(fixture.posted,before,'A complete resumed catalogue must reuse every verified cached clip')
    def test_main_unknown_response_never_transitions_or_retries_on_resume(self):
        fixture=self.main_fixture(); fixture.fail_text=next(iter(fixture.texts.values()))
        with patch.object(b.CreditBudget,'after_and_before_batch',autospec=True) as transition:
            with self.assertRaises(g.SafeError): self.run_main_fixture(fixture)
        transition.assert_not_called(); self.assertEqual(len(fixture.posted),3)
        ledger=json.loads(fixture.ledger.read_text())
        self.assertIsNotNone(ledger['pending']); self.assertEqual(ledger['committedReservations'],0)
        self.assertEqual(sum(g.received_audio(fixture.directory,identity) for identity in ledger['pending']['requestIds']),2)
        with self.assertRaises(g.SafeError): self.run_main_fixture(fixture)
        self.assertEqual(len(fixture.posted),3)
    def test_main_next_reservation_write_failure_never_posts_next_group(self):
        fixture=self.main_fixture(); identities=list(fixture.plan['requests']); following=set(identities[3:])
        real_atomic=b.atomic
        def reject_next_reservation(path,ledger):
            if ledger['pending'] and following.intersection(ledger['pending'].get('requestIds',[])): raise OSError('Durability unavailable')
            real_atomic(path,ledger)
        with patch.object(b,'atomic',side_effect=reject_next_reservation):
            with self.assertRaises(b.CreditBudgetError): self.run_main_fixture(fixture)
        self.assertEqual(len(fixture.posted),3)
        ledger=json.loads(fixture.ledger.read_text())
        self.assertIsNone(ledger['pending']); self.assertGreater(ledger['committedReservations'],0)
        saved={identity:(fixture.directory/'cache'/identity/'normalised.mp3').read_bytes() for identity in identities[:3]}
        self.run_main_fixture(fixture)
        self.assertEqual(len(fixture.posted),6); self.assertEqual(len(set(fixture.posted)),6)
        self.assertTrue(all((fixture.directory/'cache'/identity/'normalised.mp3').read_bytes()==data for identity,data in saved.items()))
    def test_stop_file_settles_completed_group_and_resume_reuses_cache(self):
        fixture=self.main_fixture()
        def stop_after_three(identity):
            if len(fixture.posted)==3: (fixture.directory/'.stop-after-batch').touch()
        fixture.on_post=stop_after_three
        with patch.object(b.CreditBudget,'after_and_before_batch',autospec=True) as transition:
            output=self.run_main_fixture(fixture)
        transition.assert_not_called(); self.assertEqual(len(fixture.posted),3)
        ledger=json.loads(fixture.ledger.read_text()); self.assertIsNone(ledger['pending'])
        self.assertGreater(ledger['committedReservations'],0); self.assertFalse(ledger['blocked'])
        self.assertEqual(output[-1]['mode'],'safely-paused-after-batch')
        first={identity:(fixture.directory/'cache'/identity/'normalised.mp3').read_bytes() for identity in list(fixture.plan['requests'])[:3]}
        (fixture.directory/'.stop-after-batch').unlink(); fixture.on_post=None
        resumed=self.run_main_fixture(fixture)
        self.assertEqual(len(fixture.posted),6); self.assertEqual(len(set(fixture.posted)),6)
        self.assertTrue(all((fixture.directory/'cache'/identity/'normalised.mp3').read_bytes()==data for identity,data in first.items()))
        self.assertEqual(resumed[-1]['mode'],'staged-unreviewed')
        self.assertIsNone(json.loads(fixture.ledger.read_text())['pending'])
    def test_preexisting_stop_file_starts_no_paid_requests(self):
        fixture=self.main_fixture(); fixture.directory.mkdir(parents=True); (fixture.directory/'.stop-after-batch').touch()
        output=self.run_main_fixture(fixture)
        self.assertEqual(fixture.posted,[])
        self.assertEqual(output[-1]['mode'],'safely-paused-after-batch')
        ledger=json.loads(fixture.ledger.read_text())
        self.assertIsNone(ledger['pending']); self.assertEqual(ledger['committedReservations'],0)
    def test_bundle_isolated_and_compatible(self):
        p = plan(kind='speech', sample_only=True)
        s = next(iter(p['requests'].values()))
        with patch.object(g, 'normalize', side_effect=self.normalized):
            record = g.generate_one(self.client, self.directory, s)
        bundle = g.build_bundle(self.directory, p, {s['cacheKey']: record})
        manifest = json.loads((bundle.parent / 'narration-manifest.json').read_text())
        clip = manifest['clips']['sample']
        self.assertEqual(clip['text'], 'Hello.')
        self.assertEqual(clip['provenance'], 'verified-api-response')
        self.assertEqual(clip['sha256'], g.sha((bundle.parent / 'assets' / clip['src'].lstrip('/')).read_bytes()))
        self.assertEqual(manifest['reviewStatus'], 'unreviewed-staged-only')
        self.assertTrue(str(bundle).startswith(str(self.directory / 'bundles')))
        self.assertFalse((self.directory / 'narration-manifest.json').exists())
    def test_key_source_is_explicit_and_not_evaluated(self):
        with patch.dict(os.environ, {'ELEVENLABS_API_KEY': 'environment-key'}):
            self.assertEqual(g.load_key(), 'environment-key')
            with patch.object(g, 'ROOT', self.directory):
                f = self.directory / '.env.elevenlabs.local'
                f.write_text("export ELEVENLABS_API_KEY='literal-$(never-execute)'\n")
                f.chmod(0o644)
                with self.assertRaises(g.SafeError): g.load_key(f)
                f.chmod(0o600)
                self.assertEqual(g.load_key(f), 'literal-$(never-execute)')
                with self.assertRaises(g.SafeError): g.load_key(self.directory / 'other.env')
    def test_catalogue_pagination_and_flags(self):
        client = g.APIClient('fake-test-credential')
        client.call = Mock(side_effect=[{'voices': [{'voice_id': 'a'}], 'has_more': True, 'next_page_token': 'next'}, {'voices': [{'voice_id': 'b'}], 'has_more': False}])
        self.assertEqual(len(client.voices()), 2)
        for call in client.call.call_args_list:
            self.assertIn('include_custom_rates=false', call.args[0])
            self.assertIn('include_live_moderated=false', call.args[0])
        self.assertIn('next_page_token=next', client.call.call_args_list[1].args[0])
        client.call = Mock(return_value={'voices': [], 'has_more': True, 'next_page_token': 'loop'})
        with self.assertRaises(g.SafeError): client.voices()
    def test_real_offline_normalization_bounds_and_duration(self):
        import shutil, subprocess
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'): self.skipTest('ffmpeg unavailable')
        raw = self.directory / 'fixture.mp3'
        output = self.directory / 'normalised.mp3'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-codec:a', 'libmp3lame', str(raw)], check=True)
        duration = g.normalize(raw, output, self.spec)
        actual = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(output)]))
        self.assertAlmostEqual(duration, actual, places=3)
        self.assertGreater(output.stat().st_size, 0)
        self.assertLess(duration, 2)
    def test_provider_errors_do_not_leak_credentials(self):
        from urllib.error import URLError
        client = g.APIClient('fake-test-credential')
        client.opener.open = Mock(side_effect=URLError('fake-test-credential must not leak'))
        with patch.object(g.time,'sleep'):
            with self.assertRaises(g.SafeError) as raised: client.call('/v1/models')
        self.assertNotIn('fake-test-credential', str(raised.exception))
        self.assertEqual(client.opener.open.call_count, 5)
        client.opener.open.reset_mock()
        with self.assertRaises(g.SafeError): client.call('/v1/text-to-dialogue',{'model_id':'eleven_v4'})
        self.assertEqual(client.opener.open.call_count, 1)
    def test_dry_run_never_reads_key_or_network(self):
        with patch.object(g, 'ROOT', self.directory), patch.object(g, 'catalogue_texts', return_value={'sample': 'Hello.'}), patch.object(g,'lesson_music_catalogue',return_value={}), patch.object(g, 'load_key', side_effect=AssertionError('key read')), patch.object(g.APIClient, 'call', side_effect=AssertionError('network')), patch('builtins.print'):
            g.main([])
        self.assertTrue((self.directory / 'media/elevenlabs/plan.json').exists())
    def test_generation_budget_and_selection_fail_before_network(self):
        with patch.object(g, 'ROOT', self.directory), patch.object(g, 'catalogue_texts', return_value={'sample': 'Hello.'}), patch.object(g,'lesson_music_catalogue',return_value={}), patch.object(g, 'load_key', side_effect=AssertionError('key read')), patch.object(g, 'shutil') as tools:
            tools.which.return_value = '/fake/tool'
            for argv in (['--generate'], ['--generate', '--max-usd', '5'], ['--generate', '--max-usd', '0.00001', '--voice-id', 'selected', '--model-id', 'eleven_v4']):
                with self.assertRaises(g.SafeError): g.main(argv)
unittest.main(argv=['offline-generator-tests'], verbosity=2)
`

test('ElevenLabs generator: offline contracts, authored coverage, budgets, cache and recovery', () => {
  const result = spawnSync('python3', ['-B', '-c', pythonTests], { cwd: root, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('ElevenLabs local credentials and staged outputs stay ignored', () => {
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')
  assert.ok(ignore.split('\n').includes('.env.elevenlabs.local'))
  assert.ok(ignore.split('\n').includes('/media/elevenlabs/'))
})
