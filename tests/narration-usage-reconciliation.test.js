import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('usage reconciliation requires matched closed cohorts and cannot replay or free unknown costs', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import importlib.util,copy
s=importlib.util.spec_from_file_location('usage','scripts/reconcile-narration-usage.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
from unittest.mock import Mock
client=Mock()
client._call_once.side_effect=[{'voices':[{'voice_id':'saved'}],'has_more':True,'next_page_token':'next'}, {'voices':[{'voice_id':'shared'}],'has_more':False}]
assert len(m.voice_catalogue(client))==2
assert all('include_live_moderated=true' in call.args[0] for call in client._call_once.call_args_list)
assert 'next_page_token=next' in client._call_once.call_args_list[1].args[0]
client._call_once.side_effect=None
client._call_once.return_value={'voices':[],'has_more':True,'next_page_token':'loop'}
try:m.voice_catalogue(client)
except ValueError:pass
else:raise AssertionError('Repeated cursor must stop')
ledger={'pending':None,'blocked':False,'starting':{'used':0},'last':{'used':100},'committedReservations':300,'cap':1000,'minimum':100,'creditCeiling':'1','spent':300}
cohort={'voiceId':'voice','requestIds':['a','b'],'characters':200,'reserved':200,'providerRequests':2.0,'providerCharacters':200.0000000001,'providerCredits':100.0}
result=m.reconcile(ledger,[cohort],120,'proof')
assert result['committedReservations']==200 and result['spent']==200
assert result['observedActual']==120 and result['cap']==1000 and result['minimum']==100
assert ledger['committedReservations']==300
assert result['usageReconciliations'][0]['releasedReservations']==100
assert m.reconcile(ledger,[{**cohort,'providerCredits':100.1}],120,'proof')['committedReservations']==201
assert m.reconcile(ledger,[{**cohort,'retainedLossReservations':10}],120,'proof')['committedReservations']==210
assert m.reconcile(ledger,[{**cohort,'retainedLossReservations':10}],100,'proof')['committedReservations']==210
for field,value in [('providerRequests',1),('providerCharacters',201),('providerCredits',0),('providerCredits',201),('providerCredits',float('nan')),('requestIds',['a','a']),('retainedLossReservations',101)]:
 try:m.reconcile(ledger,[{**cohort,field:value}],120,'proof')
 except ValueError:pass
 else:raise AssertionError(field)
for changed in [{**ledger,'pending':{'reserved':1}},{**ledger,'blocked':True},{**ledger,'starting':{'used':1}},result]:
 try:m.reconcile(changed,[cohort],120,'proof')
 except ValueError:pass
 else:raise AssertionError('unsafe ledger accepted')
for used in (99,201):
 try:m.reconcile(ledger,[cohort],used,'proof')
 except ValueError:pass
 else:raise AssertionError('unsafe observed count accepted')
try:m.reconcile(ledger,[cohort,cohort],120,'proof')
except ValueError:pass
else:raise AssertionError('duplicate cohort accepted')
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('a closed recording cohort spanning midnight keeps all receipt and billing checks', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import importlib.util,json,tempfile
from pathlib import Path
from decimal import Decimal
from datetime import datetime,timedelta,timezone
s=importlib.util.spec_from_file_location('usage','scripts/reconcile-narration-usage.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
 directory=Path(folder);requests={};receipts=[]
 today=datetime.now(timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)
 for index,stamp in enumerate([today-timedelta(minutes=1),today]):
  request={'kind':'speech','voiceId':'voice','path':'/v1/text-to-dialogue',
           'payload':{'model_id':'eleven_v4','inputs':[{'voice_id':'voice','text':'Hello '+str(index)}]}}
  identity=m.audio.sha(m.audio.canonical(request));request['cacheKey']=identity;requests[identity]=request
  path=directory/'cache'/identity;path.mkdir(parents=True)
  raw=b'raw fixture';normalized=b'normalized fixture'
  (path/'raw.mp3').write_bytes(raw);(path/'normalised.mp3').write_bytes(normalized)
  receipt={'cacheKey':identity,'status':'complete','provider':'ElevenLabs','voiceId':'voice',
           'model':'eleven_v4','apiPath':request['path'],'requestedAt':stamp.isoformat(),
           'sha256':m.audio.sha(normalized),'rawSha256':m.audio.sha(raw),'bytes':len(normalized)}
  (path/'receipt.json').write_text(json.dumps(receipt));receipts.append(path/'receipt.json')
 (directory/'cohort-plan.json').write_text(json.dumps({'requests':requests}))
 groups,day,losses=m.closed_cohorts(directory,['voice'],Decimal('1'))
 assert len(groups['voice'])==2 and day==today-timedelta(days=1)
 original=json.loads(receipts[0].read_text())
 archive=directory/'interruption-recovery'/'fixture'/'lost-response';archive.mkdir(parents=True)
 original['status']='pending-unknown'
 raw=json.dumps(original).encode();(archive/'receipt.json').write_bytes(raw)
 request=requests[original['cacheKey']];(archive.parent/'request.json').write_text(json.dumps(request))
 proof={'cacheKey':original['cacheKey'],'requestedAt':original['requestedAt'],'receiptSha256':m.audio.sha(raw)}
 loss={'lossId':m.audio.sha(m.audio.canonical(proof)),'voiceId':'voice','cacheKey':original['cacheKey'],
       'receiptSha256':m.audio.sha(raw),'archive':'interruption-recovery/fixture/lost-response',
       'retainedReservation':len(m.audio.speech_text(request))}
 extra,_,retained=m.closed_cohorts(directory,['voice'],Decimal('1'),[loss])
 assert len(extra['voice'])==3 and retained['voice']==len(m.audio.speech_text(request))
 for change in [{'lossId':'wrong'},{'retainedReservation':0},{'archive':'../outside'}]:
  try:m.closed_cohorts(directory,['voice'],Decimal('1'),[{**loss,**change}])
  except ValueError:pass
  else:raise AssertionError('Invalid lost-response evidence accepted')
 broken=json.loads(receipts[0].read_text());broken['status']='pending-unknown';receipts[0].write_text(json.dumps(broken))
 try:m.closed_cohorts(directory,['voice'],Decimal('1'))
 except ValueError:pass
 else:raise AssertionError('Incomplete cross-day receipt accepted')
 broken['status']='complete';broken['requestedAt']=(today+timedelta(days=2)).isoformat();receipts[0].write_text(json.dumps(broken))
 try:m.closed_cohorts(directory,['voice'],Decimal('1'))
 except ValueError:pass
 else:raise AssertionError('Future receipt accepted')
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
