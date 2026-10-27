import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getLesson } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';

const fields = ['id','title','invitation','objective','parentNote','simplify','transfer','colouringLabel'];
const stepFields = ['id','kind','title','instruction','spoken','hint','notice','canSkip','quietMs'];
const pilot = (id) => JSON.parse(readFileSync(new URL(`../research/spanish-reviewed/basic/${id}.es-419.json`, import.meta.url), 'utf8'));
for (const id of ['rainbow', 'balloon', 'flower', 'apple', 'fish', 'ladybird', 'ice-cream', 'mushroom']) test(`${id} Spanish pilot covers the current source and records its review status`, () => {
  const lesson = getLesson(id), draft = pilot(id);
  const source = { ...Object.fromEntries(fields.map((key) => [key,lesson[key]])),
    steps: lesson.steps.map((step) => Object.fromEntries(stepFields.filter((key) => step[key] !== undefined).map((key) => [key,step[key]]))) };
  assert.equal(draft.status, 'reviewed-internally-pending-native-review');
  assert.equal(getLanguage(draft.locale).ready, releasedLessons(draft.locale).length > 0);
  assert.equal(draft.sourceTextSha256, createHash('sha256').update(JSON.stringify(source)).digest('hex'), 'Source changed: review the pilot again');
  assert.deepEqual(Object.keys(draft.stages), lesson.steps.map((step) => step.id));
  for (const field of fields.filter((field) => !['id','simplify'].includes(field))) assert.ok(draft[field]?.trim(), field);
  for (const note of ['observe', 'draw', 'colour']) assert.ok(draft.parentNotes[note]?.trim(), note);
  assert.deepEqual(draft.pilotPhases.map((phase) => phase.id), lesson.pilotPhases.map((phase) => phase.id));
  for (const phase of draft.pilotPhases) assert.ok(phase.label?.trim(), `${id}/${phase.id} phase`);
  const noticesByKind = {};
  for (const step of lesson.steps) {
    const group = step.kind === 'explore' ? 'draw' : step.kind;
    noticesByKind[group] ??= step.notice;
    assert.equal(step.notice, noticesByKind[group], `${id}/${step.id} needs individual notice review`);
    for (const field of ['title','instruction','spoken','hint','notice'])
      assert.ok(draft.stages[step.id][field]?.trim(), `${id}/${step.id}/${field}`);
    assert.equal(draft.stages[step.id].notice, draft.parentNotes[group]);
  }
});

test('Rainbow and balloon preserve key optional choices and the colour-learning context', () => {
  const rainbow = pilot('rainbow'), balloon = pilot('balloon');
  assert.match(rainbow.parentNote, /no hacen falta siete colores/i);
  assert.match(rainbow.stages['colour-choice'].spoken, /colores se mezclan/i);
  assert.match(rainbow.stages['fifth-arch'].spoken, /cuando quieras/i);
  assert.match(rainbow.stages['right-cloud'].spoken, /deja esta nube fuera/i);
  assert.match(balloon.stages['upper-dot'].spoken, /sin diseño/i);
  assert.match(balloon.stages['colour-bow'].spoken, /si agregaste un lazo/i);
  assert.match(balloon.stages['colour-body-left'].spoken, /dejo blanco el pequeño brillo/i);
});

test('Mushroom drawings do not imply a guide to edible mushrooms', () => {
  assert.match(pilot('mushroom').parentNote, /no sirven para identificar hongos comestibles/i);
});
