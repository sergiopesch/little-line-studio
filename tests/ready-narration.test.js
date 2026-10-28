import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('ready narration includes only whole cached lessons and preserves request identity', () => {
  const result = spawnSync('python3', ['-c', `
import importlib.util
s=importlib.util.spec_from_file_location('ready','scripts/stage-ready-narration.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
ids={name:str(i)*64 for i,name in enumerate(['sample','cat-i','cat-h','dog-i','dog-h'],1)}
requests={identity:{'estimatedUsd':'.01','payload':{'text':name}} for name,identity in ids.items()}
plan={'entries':{'sample':ids['sample'],'cat/head/instruction':ids['cat-i'],'cat/head/hint':ids['cat-h'],
                 'dog/face/instruction':ids['dog-i'],'dog/face/hint':ids['dog-h']},'requests':requests}
records={identity:{'status':'complete'} for identity in ids.values()}
records[ids['dog-h']]={'status':'received'}
selected=m.completed_plan(plan,records)
assert selected['coveredLessons']==['cat']
assert selected['partialCatalogue'] is True
assert len(selected['entries'])==3
assert selected['requests'][ids['cat-h']]==requests[ids['cat-h']]
assert selected['sourceCataloguePlanHash']==m.audio.sha(m.audio.canonical(plan))
records[ids['dog-h']]={'status':'complete'}
assert m.completed_plan(plan,records)['partialCatalogue'] is False
del records[ids['sample']]
try: m.completed_plan(plan,records)
except m.activation.SafeError: pass
else: raise AssertionError('Missing sample must stop staging')
for locale in m.full.pilot.VOICES:
 try: m.request_validator(locale)({'text':'hello','voiceId':'wrong'},{'payload':{}},'narration')
 except m.activation.SafeError: pass
 else: raise AssertionError('Wrong voice must stop validation')
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
