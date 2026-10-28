import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../src/lesson-catalogue.js';
import { localizeLesson, localizedLessonTitle } from '../src/spanish-spain-lessons.js';
import runtime from '../src/spanish-lessons.es-ES.json' with { type: 'json' };
import ui from '../src/spanish-ui.es-ES.json' with { type: 'json' };
import { exportSpain } from '../scripts/export-spain-lessons.mjs';
import { loadLocaleLanguage } from '../src/language-loading.js';
import { demonstrationLabel } from '../src/demonstration-label.js';
import { stageLabel } from '../src/spanish-spain-dynamic.js';
import { narrationForLocale } from '../src/narration-locales.js';

test('Spain Spanish runtime matches verified source and preserves all lesson mechanics', () => {
  const source = exportSpain();
  assert.deepEqual(runtime.lessons, source.lessons);
  assert.deepEqual(ui, source.strings);
  for (const lesson of LESSONS) {
    const result = localizeLesson(lesson, 'es-ES');
    assert.equal(result.title, localizedLessonTitle(lesson, 'es-ES'));
    assert.deepEqual(result.strokes, lesson.strokes);
    assert.deepEqual(result.steps.map(s => s.id), lesson.steps.map(s => s.id));
    assert.deepEqual(result.steps.map(s => [s.kind, s.quietMs, s.canSkip]), lesson.steps.map(s => [s.kind, s.quietMs, s.canSkip]));
  }
});

test('Spain Spanish runtime rejects stale or incomplete translations', () => {
  const lesson = LESSONS[0];
  assert.throws(() => localizeLesson(lesson, 'es-ES', { ...runtime, locale: 'es-419' }));
  const damaged = structuredClone(runtime);
  delete damaged.lessons[lesson.id].steps[lesson.steps[0].id];
  assert.throws(() => localizeLesson(lesson, 'es-ES', damaged));
});

test('Spain language loading does not silently fall back when narration is incomplete', async () => {
  const lesson = LESSONS[0];
  assert.equal(narrationForLocale('es-ES', [lesson], { index: {}, durations: {} }).ready, false);
  await assert.rejects(loadLocaleLanguage('es-ES', [lesson], {
    loadNarration: async () => ({ index: {}, durations: {} }),
  }));
  const text = await loadLocaleLanguage('es-ES', [lesson], {
    loadNarration: async () => ({ index: {}, durations: {} }),
    validate: () => ({ ready: true }),
  });
  assert.equal(text.localizeLesson(lesson, 'es-ES').title, runtime.lessons[lesson.id].title);
});

test('Spain stage and demonstration labels are localised throughout the catalogue', () => {
  for (const lesson of LESSONS) {
    const translated = localizeLesson(lesson, 'es-ES');
    for (const [index] of lesson.steps.entries()) {
      assert.ok(stageLabel(translated, index).trim());
      assert.match(demonstrationLabel(translated, index, 'es-ES'), /papel/);
    }
  }
});
