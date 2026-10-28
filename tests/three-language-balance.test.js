import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('remaining balance selects complete lessons without exceeding the cap or changing request identities', () => {
  const verify = String.raw`
import importlib.util,json,tempfile
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('balance','scripts/three-language-balance.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
plans=m.full.full_plans();lookup={p['locale']:p for p in plans}
spain=lookup['es-ES'];identity=m.audio.sha(m.audio.canonical(spain))
with tempfile.TemporaryDirectory() as temp:
 directory=Path(temp);bundle=directory/'bundles'/identity;bundle.mkdir(parents=True)
 (bundle/'plan.json').write_text(json.dumps(spain))
 descriptor={'schemaVersion':1,'provider':'ElevenLabs','reviewStatus':'unreviewed-staged-only','planHash':identity,'speechKeys':1461,'musicLevels':[],'musicLessons':[]}
 (bundle/'bundle.json').write_text(json.dumps(descriptor))
 assert m.completed_spain_bundle(directory,spain)==identity
 descriptor['speechKeys']=43;(bundle/'bundle.json').write_text(json.dumps(descriptor))
 try: m.completed_spain_bundle(directory,spain)
 except ValueError: pass
 else: raise AssertionError('A partial Spain bundle must not start the continuation')
cat={identity for locale in m.ORDER for key,identity in lookup[locale]['entries'].items() if key=='sample' or key.startswith('cat/')}
with patch.object(m.audio,'cached_record',side_effect=lambda directory,identity: {'status':'complete'} if identity in cat else None):
 selected,total=m.select(plans,['cat','sun','rainbow','balloon'],Path('/unused'),9000)
 assert total<=9000 and {p['locale'] for p in selected}==set(m.ORDER)
 for plan in selected:
  original=lookup[plan['locale']]
  assert plan['partialCatalogue'] is True and 'cat' in plan['coveredLessons']
  assert set(plan['requests'])==set(plan['entries'].values())
  assert all(original['entries'][k]==v for k,v in plan['entries'].items())
  assert all((k=='sample' or k.split('/')[0] in plan['coveredLessons']) for k in plan['entries'])
  for lesson in plan['coveredLessons']:
   assert {k for k in plan['entries'] if k.startswith(lesson+'/')}=={k for k in original['entries'] if k.startswith(lesson+'/')}
 assert any('sun' in plan['coveredLessons'] for plan in selected)
`;
  assert.doesNotThrow(() => execFileSync('python3', ['-c', verify], { stdio: 'pipe' }));
});
