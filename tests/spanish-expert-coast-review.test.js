import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getLesson } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';

const fields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stageFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const load = (id) => JSON.parse(readFileSync(new URL(`../research/spanish-reviewed/expert/${id}.es-419.json`, import.meta.url), 'utf8'));
for (const id of ['castle', 'lighthouse']) test(`${id} Spanish research copy covers and matches the current source`, () => {
  const english = getLesson(id), result = load(id), translated = result.lesson;
  const source = {
    ...Object.fromEntries(fields.filter((field) => english[field] !== undefined).map((field) => [field, english[field]])),
    pilotPhases: english.pilotPhases,
    steps: Object.fromEntries(english.steps.map((step) => [step.id,
      Object.fromEntries(stageFields.filter((field) => step[field] !== undefined).map((field) => [field, step[field]]))])),
  };
  assert.equal(result.locale, 'es-419');
  assert.equal(result.lessonId, id);
  assert.equal(result.reviewStatus, 'assistant-reviewed-awaiting-native-human-review');
  assert.equal(getLanguage(result.locale).ready, releasedLessons(result.locale).length > 0);
  assert.equal(translated.sourceSha256, createHash('sha256').update(JSON.stringify(source)).digest('hex'), 'English source changed; reconcile translation');
  assert.deepEqual(Object.keys(translated.steps), english.steps.map((step) => step.id));
  assert.deepEqual(translated.pilotPhases.map((phase) => phase.id), english.pilotPhases.map((phase) => phase.id));
  for (const field of fields) if (english[field]) assert.ok(translated[field]?.trim(), `${id}/${field}`);
  for (const step of english.steps) for (const field of stageFields) assert.ok(translated.steps[step.id][field]?.trim(), `${id}/${step.id}/${field}`);
});

test('Spatial and optional details are retained in the reviewed castle and lighthouse copies', () => {
  const castle = load('castle').lesson, lighthouse = load('lighthouse').lesson;
  assert.match(castle.steps['bridge-left-edge'].hint, /izquierda/i);
  assert.match(castle.steps['bridge-right-edge'].hint, /más ancho/i);
  assert.match(castle.steps['right-lifting-chain'].spoken, /dejar ambas fuera/i);
  assert.match(lighthouse.steps['tower-left-edge'].hint, /derecha/i);
  assert.match(lighthouse.steps['tower-right-edge'].hint, /izquierda/i);
  assert.match(lighthouse.parentNote, /no algo que tenga que verse de día/i);
  assert.match(lighthouse.steps['light-beam-lower'].spoken, /si no, deja el haz fuera/i);
});
