import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('offline pilot plans preserve each approved voice, transcript and language in the request identity', () => {
  const output = execFileSync('python3', ['scripts/three-language-cat-pilot.py'], { encoding: 'utf8' });
  const plans = output.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(plans.map(p => p.locale), ['es-ES', 'de-DE', 'it-IT']);
  for (const plan of plans) {
    assert.equal(plan.keys, 43);
    assert.equal(plan.requests, 43);
    assert.ok(plan.conservativeCredits > 0 && plan.conservativeCredits < 6000);
    assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  }
  const verify = String.raw`
import importlib.util, json, subprocess
s = importlib.util.spec_from_file_location('pilot', 'scripts/three-language-cat-pilot.py')
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
sources = {x['locale']: x for x in json.loads(subprocess.check_output(['node', 'scripts/three-language-cat-pilot.mjs'], text=True))}
for plan in m.plans():
    source = sources[plan['locale']]
    assert set(plan['entries']) == set(source['texts'])
    for key, identity in plan['entries'].items():
        item = plan['requests'][identity]
        spec = {k: v for k, v in item.items() if k not in ('cacheKey', 'estimatedUsd')}
        assert item['cacheKey'] == identity == m.audio.sha(m.audio.canonical(spec))
        assert m.audio.speech_text(item) == source['texts'][key]
        assert item['payload']['language_code'] == source['language']
        assert item['voiceId'] == item['payload']['inputs'][0]['voice_id'] == source['voice']
`;
  execFileSync('python3', ['-c', verify], { stdio: 'pipe' });
});

test('the selected shared cap is passed unchanged to the credit guard', () => {
  const verify = String.raw`
import importlib.util, json, tempfile
from pathlib import Path
from unittest.mock import Mock, patch
s=importlib.util.spec_from_file_location('pilot','scripts/three-language-cat-pilot.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder); ledger=root/'media/elevenlabs/multilingual-account-ledger.json'
 ledger.parent.mkdir(parents=True);ledger.write_text(json.dumps({'cap':604991}))
 (root/'.env.elevenlabs.local').write_text('fixture')
 client=Mock()
 client.call.side_effect=lambda endpoint: ([{'model_id':'eleven_v4','can_do_text_to_speech':True,'model_rates':{'character_cost_multiplier':1}}] if endpoint=='/v1/models' else {'voices':[{'voice_id':v,'sharing':{'rate':1}} for _,v in m.VOICES.values()]})
 guard=Mock();guard.preflight.side_effect=ValueError('fixture stops before any POST')
 factory=Mock(return_value=guard)
 with patch.object(m,'module',return_value=Mock(load_key=Mock(return_value='fixture'))), patch.object(m.audio,'APIClient',return_value=client), patch.object(m.shutil,'which',return_value='/fixture'), patch.object(m,'CreditBudget',factory), patch.object(m.audio,'cached_record',return_value=None):
  try: m.execute(m.plans()[:1],root,604991,lock_path=root/'fixture.lock')
  except ValueError as error: assert 'fixture stops' in str(error)
  else: raise AssertionError('Expected preflight stop')
 assert factory.call_args.kwargs['max_credits']==604991
`;
  execFileSync('python3', ['-c', verify], { stdio: 'pipe' });
});
