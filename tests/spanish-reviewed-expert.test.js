import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LESSONS } from '../src/lesson-catalogue.js';
import { localizeLesson } from '../src/spanish-lessons.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';

const fields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stageFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const sourceText = (lesson) => ({
  ...Object.fromEntries(fields.filter((field) => lesson[field] !== undefined).map((field) => [field, lesson[field]])),
  pilotPhases: lesson.pilotPhases,
  steps: Object.fromEntries(lesson.steps.map((step) => [step.id,
    Object.fromEntries(stageFields.filter((field) => step[field] !== undefined).map((field) => [field, step[field]]))])),
});

test('Expert editorial drafts match every current source stage and record their review status', () => {
  const experts = LESSONS.filter((lesson) => lesson.level === 'expert');
  assert.equal(experts.length, 10);
  for (const lesson of experts) {
    const path = new URL(`../research/spanish-reviewed/expert/${lesson.id}.es-419.json`, import.meta.url);
    const wrapper = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(wrapper.locale, 'es-419', lesson.id);
    assert.equal(wrapper.lessonId, lesson.id);
    assert.equal(wrapper.reviewStatus, 'assistant-reviewed-awaiting-native-human-review', lesson.id);
    const translated = wrapper.lesson;
    assert.equal(translated.sourceSha256, createHash('sha256').update(JSON.stringify(sourceText(lesson))).digest('hex'),
      `${lesson.id}: English source changed; review this draft again`);
    assert.deepEqual(Object.keys(translated.steps), lesson.steps.map((step) => step.id), `${lesson.id}: stage coverage`);
    assert.deepEqual(translated.pilotPhases.map((phase) => phase.id), lesson.pilotPhases.map((phase) => phase.id), lesson.id);
    for (const field of fields) if (lesson[field]) assert.ok(translated[field]?.trim(), `${lesson.id}: ${field}`);
    for (const step of lesson.steps) {
      const entry = translated.steps[step.id];
      assert.deepEqual(Object.keys(entry).sort(), [...stageFields].sort(), `${lesson.id}/${step.id}: prose fields only`);
      for (const field of stageFields) assert.ok(entry[field]?.trim(), `${lesson.id}/${step.id}: ${field}`);
    }
  }
  assert.equal(getLanguage('es-419').ready, releasedLessons('es-419').length > 0);
  assert.equal(localizeLesson(experts[0], 'es-419').id, experts[0].id);
});
