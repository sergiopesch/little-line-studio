import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getLesson } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';

const fields = ['title','invitation','objective','parentNote','simplify','transfer','colouringLabel'];
const stageFields = ['title','instruction','spoken','hint','notice'];
for (const id of ['cat','sun']) test(`${id} complete Spanish pilot tracks its source and reviewed pilot wording`, () => {
  const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const source = getLesson(id), result = read(`../research/spanish-reviewed/basic/${id}.es-419.json`);
  const pilot = read(`../research/spanish-pilot/${id}.es-419.json`), originalDraft = read('../research/spanish-draft/lessons.es-419.json').lessons[id];
  const snapshot = {
    ...Object.fromEntries(fields.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])),
    pilotPhases: source.pilotPhases,
    steps: Object.fromEntries(source.steps.map((step) => [step.id,
      Object.fromEntries(stageFields.filter((key) => step[key] !== undefined).map((key) => [key, step[key]]))])),
  };
  assert.equal(result.locale, 'es-419');
  assert.equal(result.lessonId, id);
  assert.equal(result.reviewStatus, id === 'cat' ? 'assistant-reviewed-awaiting-native-human-review' : pilot.status);
  assert.equal(getLanguage(result.locale).ready, releasedLessons(result.locale).length > 0);
  const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  assert.equal(result.lesson.sourceSha256, digest, 'English text changed: review the translated pilot');
  assert.equal(result.lesson.sourceSha256, originalDraft.sourceSha256);
  assert.deepEqual(Object.keys(result.lesson.steps), source.steps.map((step) => step.id));
  assert.deepEqual(result.lesson.pilotPhases.map((phase) => phase.id), source.pilotPhases.map((phase) => phase.id));
  for (const phase of result.lesson.pilotPhases) assert.ok(phase.label?.trim());
  for (const key of fields) if (source[key]) assert.ok(result.lesson[key]?.trim(), key);
  for (const step of source.steps) {
    const translated = result.lesson.steps[step.id];
    for (const key of stageFields) assert.ok(translated[key]?.trim(), `${step.id}/${key}`);
    for (const key of ['title','instruction','spoken','hint']) {
      const catEditorialChange = id === 'cat' && ((step.id === 'curved-mouth' && key === 'spoken') || (['left-whisker-upper', 'right-whisker-upper'].includes(step.id) && key === 'instruction'));
      if (!catEditorialChange) assert.equal(translated[key], pilot.stages[step.id][key]);
    }
    assert.equal(translated.notice, pilot.parentNotes[step.kind === 'explore' ? 'draw' : step.kind]);
  }
});

test('Cat editorial pass keeps the mouth shape and optional whiskers clear', () => {
  const result = JSON.parse(readFileSync(new URL('../research/spanish-reviewed/basic/cat.es-419.json', import.meta.url), 'utf8')).lesson;
  assert.match(result.steps['curved-mouth'].spoken, /doble ve suave/i);
  for (const id of ['left-whisker-upper', 'right-whisker-upper']) assert.match(result.steps[id].instruction, /si quieres/i);
});
