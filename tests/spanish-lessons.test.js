import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LESSONS } from '../src/lesson-catalogue.js';
import { localizeLesson } from '../src/spanish-lessons.js';

const data = JSON.parse(readFileSync(new URL('../research/spanish-draft/lessons.es-419.json', import.meta.url), 'utf8'));
const fields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stageFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];

function textSource(lesson) {
  return {
    ...Object.fromEntries(fields.filter((field) => lesson[field] !== undefined).map((field) => [field, lesson[field]])),
    pilotPhases: lesson.pilotPhases,
    steps: Object.fromEntries(lesson.steps.map((step) => [step.id,
      Object.fromEntries(stageFields.filter((field) => step[field] !== undefined).map((field) => [field, step[field]]))])),
  };
}

test('Spanish covers every source lesson and every authored stage without changing lesson mechanics', () => {
  assert.equal(data.locale, 'es-419');
  assert.deepEqual(Object.keys(data.lessons).sort(), LESSONS.map((lesson) => lesson.id).sort());
  for (const lesson of LESSONS) {
    const entry = data.lessons[lesson.id];
    const hash = createHash('sha256').update(JSON.stringify(textSource(lesson))).digest('hex');
    assert.equal(entry.sourceSha256, hash, `${lesson.id} English text changed; reconcile its Spanish translation`);
    assert.deepEqual(Object.keys(entry.steps), lesson.steps.map((step) => step.id), `${lesson.id} stages`);
    const localized = entry;
    for (const [index, step] of lesson.steps.entries()) {
      const translated = localized.steps[step.id];
      for (const field of stageFields) assert.ok(translated[field]?.trim(), `${lesson.id}/${step.id} missing ${field}`);
      assert.equal(Object.hasOwn(translated, 'id'), false);
      assert.equal(Object.hasOwn(translated, 'quietMs'), false);
      assert.equal(Object.hasOwn(translated, 'canSkip'), false);
      assert.equal(Object.hasOwn(translated, 'stroke'), false);
    }
    for (const field of fields) {
      if (lesson[field]) assert.ok(localized[field]?.trim(), `${lesson.id} missing ${field}`);
    }
    assert.equal(localizeLesson(lesson, 'en-GB'), lesson);
  }
});

test('Spanish cat retains the authored pilot and the sun retains its safety instruction', () => {
  assert.equal(data.lessons.cat.steps['round-head'].title, 'La cabeza redonda');
  assert.match(data.lessons.sun.steps.notice.hint, /nunca/i);
  assert.match(data.lessons.sun.steps.notice.hint, /sol/i);
  assert.equal(localizeLesson(LESSONS[0], 'es-419').steps[1].title, 'La cabeza redonda');
});

test('translation cannot replace authored identity, timing, stage mechanics or phase metadata', () => {
  const lesson = LESSONS[0];
  const actual = JSON.parse(readFileSync(new URL('../src/spanish-lessons.es-419.json', import.meta.url), 'utf8'));
  const fake = structuredClone(actual);
  const translated = fake.lessons[lesson.id];
  Object.assign(translated, { id: 'other', level: 'expert', musicId: 'other' });
  Object.assign(translated.steps[lesson.steps[0].id], { id: 'other', kind: 'explore', quietMs: 0, canSkip: true });
  Object.assign(translated.pilotPhases[0], { extra: 'untrusted' });
  const localized = localizeLesson(lesson, 'es-419', fake);
  assert.equal(localized.id, lesson.id);
  assert.equal(localized.level, lesson.level);
  assert.equal(localized.musicId, lesson.musicId);
  for (const field of ['id', 'kind', 'quietMs', 'canSkip']) assert.equal(localized.steps[0][field], lesson.steps[0][field]);
  assert.equal(Object.hasOwn(localized.pilotPhases[0], 'extra'), false);
  fake.lessons[lesson.id].steps[lesson.steps[0].id].hint = '';
  assert.throws(() => localizeLesson(lesson, 'es-419', fake), /missing teaching text/);
});

test('draft Spanish is marked unreviewed and excludes identified unsafe or untranslated terms', () => {
  assert.equal(data.quality, 'machine-translated-unreviewed');
  const bannedByLesson = {
    apple: /\b(?:salsa|baño)\b/i,
    fish: /\bpescados?\b/i,
    coral: /\bpescados?\b/i,
    elephant: /\b(?:troncos?|oídos?)\b/i,
    'ice-cream': /\b(?:cucharas?|cucharadas?|primicia)\b/i,
    turtle: /\b(?:concha|cáscara)\b/i,
    mushroom: /\bgorras?\b/i,
    rabbit: /\boídos?\b/i,
  };
  const obviousEnglish = /\b(?:the|draw|shape|left|right|colour|coloring|drawing|watch|little|begin|notice|please|your|you|then|with|and|from|trunk|scoop)\b/i;
  function check(value, lessonId, location) {
    if (typeof value === 'string') {
      assert.doesNotMatch(value, obviousEnglish, `${location} contains an English term`);
      if (bannedByLesson[lessonId]) assert.doesNotMatch(value, bannedByLesson[lessonId], `${location} contains a known bad term`);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'sourceSha256' && key !== 'id') check(child, lessonId, `${location}/${key}`);
      }
    }
  }
  for (const [lessonId, lesson] of Object.entries(data.lessons)) check(lesson, lessonId, lessonId);
});
