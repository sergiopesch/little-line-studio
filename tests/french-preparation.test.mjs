import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { LESSONS } from '../src/lesson-catalogue.js';
import { FRENCH_UI } from '../src/french-ui.fr-FR.js';
import { FRENCH_DYNAMIC, demonstrationLabel, stageLabel, timelineEstimate } from '../src/french-dynamic.fr-FR.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('French exporter fails closed until the reviewed catalogue is complete', () => {
  const result = spawnSync(process.execPath, ['scripts/export-reviewed-french.mjs'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const complete = LESSONS.every((lesson) => existsSync(`research/french-reviewed/${lesson.level}/${lesson.id}.fr-FR.json`));
  if (complete) {
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.count, 30);
    assert.equal(Object.keys(output.texts).length, 1460);
    assert.equal(output.reviewStatus, 'assistant-reviewed-awaiting-native-human-review');
    const runtime = JSON.parse(readFileSync('src/french-lessons.fr-FR.json', 'utf8'));
    assert.deepEqual(runtime.lessons, output.lessons);
  } else {
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});

test('French UI covers the established dictionary and preserves dynamic information', () => {
  const source = readFileSync('src/i18n.jsx', 'utf8');
  const keys = [...source.matchAll(/^  ("(?:[^"\\]|\\.)*"): /gm)].map((match) => JSON.parse(match[1]));
  assert.ok(keys.length >= 196);
  for (const key of keys) assert.ok(typeof FRENCH_UI[key] === 'string' && FRENCH_UI[key].trim(), key);
  assert.match(FRENCH_DYNAMIC.catalogueRange('Débutant', 1, 6, 10), /1 à 6 sur 10/);
  assert.match(FRENCH_DYNAMIC.duration(7), /7 minutes/);
  assert.match(FRENCH_DYNAMIC.boardAction('Chat', 3), /Chat.*3/);
  assert.match(FRENCH_DYNAMIC.stepColour(2, 5), /2 SUR 5/);
});

test('French dynamic labels follow authored stages and estimates', () => {
  const lesson = LESSONS.find(({ id }) => id === 'cat');
  assert.match(demonstrationLabel(lesson, 0), /sur ta feuille/);
  assert.equal(stageLabel(lesson, 0), 'OBSERVE');
  assert.match(stageLabel(lesson, lesson.steps.findIndex(({ kind }) => kind === 'colour')), /COLORIAGE 1 SUR/);
  assert.equal(timelineEstimate({ estimateLabel: 'About 3 min left', remainingMs: 130000 }, () => 'bad'), 'Environ 3 min restantes');
  assert.equal(timelineEstimate({ estimateLabel: 'Paused · nothing moves ahead', remainingMs: 0 }, (s) => FRENCH_UI[s]), 'En pause · rien n’avance');
});

test('reviewed lesson records retain all source stages and geometry identities', () => {
  const lessons = LESSONS.filter((lesson) => existsSync(`research/french-reviewed/${lesson.level}/${lesson.id}.fr-FR.json`));
  assert.equal(lessons.length, 30);
  for (const lesson of lessons) {
    const id = lesson.id;
    const reviewed = JSON.parse(readFileSync(`research/french-reviewed/${lesson.level}/${id}.fr-FR.json`, 'utf8'));
    assert.equal(reviewed.status, 'assistant-reviewed-awaiting-native-human-review');
    assert.equal(reviewed.sourceLessonSha256, hash(lesson));
    assert.deepEqual(Object.keys(reviewed.stages), lesson.steps.map(({ id }) => id));
    for (const step of lesson.steps) {
      assert.deepEqual(Object.keys(reviewed.stages[step.id]).sort(), ['hint', 'instruction', 'notice', 'spoken', 'title']);
      for (const text of Object.values(reviewed.stages[step.id])) assert.ok(typeof text === 'string' && text.trim());
    }
  }
});

test('French runtime localization preserves authored geometry and fails closed on missing text', async () => {
  const { localizeLesson, localizedLessonTitle } = await import('../src/french-lessons.js');
  for (const lesson of LESSONS) {
    const french = localizeLesson(lesson, 'fr-FR');
    assert.equal(french.id, lesson.id);
    assert.equal(french.strokes, lesson.strokes);
    assert.deepEqual(french.steps.map(({ id }) => id), lesson.steps.map(({ id }) => id));
    assert.ok(localizedLessonTitle(lesson, 'fr-FR'));
    assert.equal(localizeLesson(lesson, 'en-GB'), lesson);
  }
  assert.throws(() => localizeLesson(LESSONS[0], 'fr-FR', { locale: 'fr-FR',
    reviewStatus: 'assistant-reviewed-awaiting-native-human-review', lessons: {} }), /does not match/);
  assert.throws(() => localizeLesson(LESSONS[0], 'fr-FR', { locale: 'en-GB', lessons: {} }), /invalid locale/);
});
