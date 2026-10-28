import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dynamicLocale } from '../src/locale-dynamic.js';
import { DUTCH_DYNAMIC } from '../research/dutch-draft/dynamic.nl-NL.js';

test('Dutch requests bind every verified script to Jolanda, Dutch and the established mastering', () => {
  const check = String.raw`
import importlib.util,json,subprocess
from unittest.mock import patch
s=importlib.util.spec_from_file_location('dutch','scripts/dutch-narration.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with patch.object(m.audio,'APIClient',side_effect=AssertionError('Offline planning must not call the provider')):
 plan=m.full_plan()
source=json.loads(subprocess.check_output(['node','scripts/plan-dutch-catalogue.mjs'],text=True))
assert len(plan['entries'])==1461 and set(plan['entries'])==set(source['entries'])
assert plan['humanReview']=={'nativeSpeaker':'pending','fullListening':'pending'}
cohort=m.initial_cohort(plan)
assert len(cohort['recordingCohort'])==20 and 80000 < cohort['speechCharacters'] < 90000
assert all(plan['entries'][key]==identity for key,identity in cohort['entries'].items())
assert cohort['sourceCataloguePlanHash']==m.audio.sha(m.audio.canonical(plan))
assert 'sample' in cohort['entries'] and len(cohort['entries']) < len(plan['entries'])
for key,identity in plan['entries'].items():
 request=plan['requests'][identity]
 original={k:v for k,v in request.items() if k not in ('cacheKey','estimatedUsd')}
 assert identity==request['cacheKey']==m.audio.sha(m.audio.canonical(original))
 assert request['payload']=={'inputs':[{'text':source['entries'][key],'voice_id':'DiUBVrSFwkMaPz4XqWvR'}],
                            'model_id':'eleven_v4','language_code':'nl'}
 assert request['encoding']['filter']=='loudnorm=I=-20:TP=-2:LRA=7'
 assert request['encoding']['rate']==44100 and request['encoding']['channels']==1
 assert request['encoding']['bitrate']=='128k'
# Misrouting must fail before reading credentials or making provider requests.
plan['voiceId']='wrong-voice'
try: m.pilot.execute([plan],None,604991,approved_voices=m.VOICES)
except ValueError as error: assert 'approved locale voice' in str(error)
else: raise AssertionError('Wrong voice was accepted')
`;
  assert.doesNotThrow(() => execFileSync('python3', ['-c', check], { stdio: 'pipe' }));
});

test('Dutch interface, greeting and dynamic labels match the prepared source', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(read('../src/dutch-ui.nl-NL.json')),
    JSON.parse(read('../research/dutch-draft/ui.nl-NL.json')).strings);
  assert.equal(read('../src/narration-sample.nl-NL.txt'), read('../research/dutch-draft/sample.nl-NL.txt'));
  assert.equal(read('../src/dutch-dynamic.js'), read('../research/dutch-draft/dynamic.nl-NL.js'));
  const runtime = dynamicLocale('nl-NL');
  assert.equal(runtime.copy.duration(8), DUTCH_DYNAMIC.duration(8));
  assert.equal(runtime.estimate({ estimateLabel: 'About 4 min left', remainingMs: 190000 }, x => x), 'Nog ongeveer 4 min');
});
