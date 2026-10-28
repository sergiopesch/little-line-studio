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
for field,value in [('providerRequests',1),('providerCharacters',201),('providerCredits',0),('providerCredits',201),('providerCredits',float('nan')),('requestIds',['a','a'])]:
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
