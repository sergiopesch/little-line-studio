import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getLesson } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';

const pilot = JSON.parse(readFileSync(new URL('../research/spanish-pilot/sun.es-419.json', import.meta.url), 'utf8'));
const fields = ['id', 'title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['id', 'kind', 'title', 'instruction', 'spoken', 'hint', 'notice', 'canSkip', 'quietMs'];

test('Sun pilot covers the current source and records its review status', () => {
  const lesson = getLesson('sun');
  const source = {
    ...Object.fromEntries(fields.map((field) => [field, lesson[field]])),
    steps: lesson.steps.map((step) => Object.fromEntries(stepFields.filter((field) => step[field] !== undefined).map((field) => [field, step[field]]))),
  };
  assert.equal(pilot.status, 'reviewed-internally-pending-native-review');
  assert.equal(getLanguage(pilot.locale).ready, releasedLessons(pilot.locale).length > 0);
  assert.equal(createHash('sha256').update(JSON.stringify(source)).digest('hex'), pilot.sourceTextSha256,
    'The English Sun lesson changed: reconcile and review the pilot again');
  assert.deepEqual(Object.keys(pilot.stages), lesson.steps.map((step) => step.id));
  for (const field of fields.filter((field) => !['id', 'simplify'].includes(field))) {
    assert.ok(pilot[field]?.trim(), `Sun needs ${field}`);
  }
  for (const step of lesson.steps) {
    for (const field of ['title', 'instruction', 'spoken', 'hint']) {
      assert.ok(pilot.stages[step.id][field]?.trim(), `${step.id} needs ${field}`);
    }
  }
  for (const field of ['observe', 'draw', 'colour']) assert.ok(pilot.parentNotes[field]?.trim());
});

test('Sun pilot retains the real-sun safety warning and optional face and details', () => {
  assert.match(pilot.stages.notice.hint, /nunca mires directamente al sol/i);
  assert.match(pilot.stages['sun-left-eye'].spoken, /sol de verdad no tiene cara/i);
  assert.match(pilot.stages['sun-left-eye'].hint, /sin cara/i);
  for (const id of ['lower-left-ray', 'lower-right-ray', 'sun-right-eye', 'sun-smile', 'colour-warmth']) {
    const step = pilot.stages[id];
    assert.match(`${step.instruction} ${step.spoken} ${step.hint}`, /si quieres|puedes|tú decides/i, `${id} must remain optional`);
  }
});
