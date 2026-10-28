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
