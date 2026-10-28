// Text-only review plan. This is intentionally not a provider request or a release bundle.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspectDraft } from './verify-dutch-draft.mjs';

const selected = [
  'cat/notice/instruction', 'cat/notice/hint', 'cat/round-head/instruction',
  'cat/round-head/hint', 'cat/left-ear/instruction', 'cat/little-nose/instruction',
  'cat/curved-mouth/instruction', 'cat/left-whisker-upper/instruction',
  'cat/left-whisker-middle/hint', 'cat/colour-choice/instruction',
  'cat/colour-fur/hint', 'cat/colour-details/instruction',
  'cat/colour-reflection/instruction', 'cat/explore/instruction',
];
const sample = readFileSync(new URL('../research/dutch-draft/sample.nl-NL.txt', import.meta.url), 'utf8').trim();
if (!sample) throw new Error('Dutch voice-check text is missing.');
const { texts } = inspectDraft();
const clips = selected.map((key) => {
  if (!texts[key]) throw new Error(`Missing pilot narration: ${key}`);
  return { key, text: texts[key] };
});
const body = { schemaVersion: 1, locale: 'nl-NL', lesson: 'cat', status: 'text-review-only',
  voice: { name: 'Jolanda — Pleasant & Soothing', id: 'DiUBVrSFwkMaPz4XqWvR', selection: 'voice-library-preview' },
  sample, clips, providerPermission: 'pending', productionPlanApproval: 'pending', budgetApproval: 'pending',
  nativeReview: 'pending', generatedAudioListening: 'not-started' };
const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
const pilotCharacters = [...sample, ...clips.flatMap(({ text }) => [...text])].length;
const lessonCharacters = [...sample, ...Object.values(texts).flatMap((text) => [...text])].length;
console.log(JSON.stringify({ ...body, pilotCharacters, lessonCharacters, textPlanSha256: digest }, null, 2));
