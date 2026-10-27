import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { LESSONS } from '../src/lesson-catalogue.js';

const directory = new URL('../research/spanish-reviewed/intermediate/', import.meta.url);
const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stageFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];

function sourceText(lesson) {
  return {
    ...Object.fromEntries(lessonFields.filter((field) => lesson[field] !== undefined).map((field) => [field, lesson[field]])),
    pilotPhases: lesson.pilotPhases,
    steps: Object.fromEntries(lesson.steps.map((step) => [step.id,
      Object.fromEntries(stageFields.filter((field) => step[field] !== undefined).map((field) => [field, step[field]]))])),
  };
}

test('intermediate Spanish drafts match all current source lessons and stages', () => {
  const lessons = LESSONS.filter((lesson) => lesson.level === 'intermediate');
  assert.deepEqual(readdirSync(directory).filter((name) => name.endsWith('.es-419.json')).sort(),
    lessons.map((lesson) => `${lesson.id}.es-419.json`).sort());
  for (const source of lessons) {
    const record = JSON.parse(readFileSync(new URL(`${source.id}.es-419.json`, directory), 'utf8'));
    assert.equal(record.lessonId, source.id);
    assert.equal(record.locale, 'es-419');
    assert.equal(record.reviewStatus, 'assistant-reviewed-awaiting-native-human-review');
    const textHash = createHash('sha256').update(JSON.stringify(sourceText(source))).digest('hex');
    assert.equal(record.lesson.sourceSha256, textHash, `${source.id}: English text changed; review again`);
    assert.deepEqual(Object.keys(record.lesson.steps), source.steps.map(({ id }) => id), `${source.id}: stage identity/order changed`);
    for (const field of lessonFields) {
      if (source[field]) assert.ok(record.lesson[field]?.trim(), `${source.id}: missing ${field}`);
    }
    for (const step of source.steps) {
      const translated = record.lesson.steps[step.id];
      assert.deepEqual(Object.keys(translated).sort(), [...stageFields].sort(), `${source.id}/${step.id}: unexpected stage fields`);
      for (const field of stageFields)
        assert.ok(translated[field]?.trim(), `${source.id}/${step.id}: missing ${field}`);
    }
  }
});
