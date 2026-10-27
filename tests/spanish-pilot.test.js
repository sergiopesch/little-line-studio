import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getLesson } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';

const draft = JSON.parse(readFileSync(new URL('../research/spanish-pilot/cat.es-419.json', import.meta.url), 'utf8'));

test('Spanish cat draft covers the exact current source and records its review status', () => {
  const lesson = getLesson(draft.lessonId);
  const source = lesson.steps.map(({ id, kind, title, instruction, spoken, hint, notice }) =>
    ({ id, kind, title, instruction, spoken, hint, notice }));
  assert.equal(draft.status, 'draft-unreviewed');
  assert.equal(getLanguage(draft.locale).ready, releasedLessons(draft.locale).length > 0);
  assert.equal(createHash('sha256').update(JSON.stringify(source)).digest('hex'), draft.sourceStepSha256,
    'English source changed: reconcile the Spanish draft before using it');
  assert.deepEqual(Object.keys(draft.stages), source.map((step) => step.id));
  for (const step of source) {
    for (const field of ['title', 'instruction', 'spoken', 'hint']) {
      assert.ok(draft.stages[step.id][field]?.trim(), `${step.id} needs ${field}`);
    }
  }
  for (const field of ['observe', 'draw', 'colour']) assert.ok(draft.parentNotes[field]?.trim());
});
