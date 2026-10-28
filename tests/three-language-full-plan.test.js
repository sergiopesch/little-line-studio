import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('complete catalogues bind every current script to its locale and reuse Cat auditions', () => {
  const check = String.raw`
import importlib.util, json, subprocess
s=importlib.util.spec_from_file_location('full','scripts/three-language-full.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
sources={v['locale']:v for v in json.loads(subprocess.check_output(['node','scripts/three-language-full-texts.mjs'],text=True))}
pilots={v['locale']:v for v in m.pilot.plans()}
plans=m.full_plans()
assert {p['locale'] for p in plans}==set(m.pilot.VOICES)
for plan in plans:
 source=sources[plan['locale']]
 assert len(plan['entries'])==1461 and set(plan['entries'])==set(source['texts'])
 for key,identity in plan['entries'].items():
  req=plan['requests'][identity]; spec={k:v for k,v in req.items() if k not in ('cacheKey','estimatedUsd')}
  assert identity==req['cacheKey']==m.audio.sha(m.audio.canonical(spec))
  assert m.audio.speech_text(req)==source['texts'][key]
  assert req['payload']['language_code']==source['language']
  assert req['voiceId']==req['payload']['inputs'][0]['voice_id']==source['voice']
 for key,identity in pilots[plan['locale']]['entries'].items(): assert plan['entries'][key]==identity
`;
  assert.doesNotThrow(() => execFileSync('python3', ['-c', check], { stdio: 'pipe' }));
});
