import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../src/lesson-catalogue.js';
import { exportGermanItalian } from '../scripts/export-german-italian.mjs';
import german from '../src/german-lessons.de-DE.json' with { type: 'json' };
import italian from '../src/italian-lessons.it-IT.json' with { type: 'json' };
import germanUI from '../src/german-ui.de-DE.json' with { type: 'json' };
import italianUI from '../src/italian-ui.it-IT.json' with { type: 'json' };
import * as germanLesson from '../src/german-lessons.js';
import * as italianLesson from '../src/italian-lessons.js';
import { dynamicLocale } from '../src/locale-dynamic.js';
import { narrationForLocale } from '../src/narration-locales.js';
import { loadLocaleLanguage } from '../src/language-loading.js';
import * as germanDynamic from '../research/german-draft/dynamic.de-DE.js';
import * as italianDynamic from '../research/italian-pilot/dynamic.it-IT.mjs';

test('German and Italian runtime copies match source and preserve lesson mechanics', async () => {
  const source = await exportGermanItalian();
  for (const [locale, data, ui, localizer] of [
    ['de-DE', german, germanUI, germanLesson], ['it-IT', italian, italianUI, italianLesson],
  ]) {
    const expected = source.find(item => item.locale === locale);
    assert.deepEqual(data.lessons, expected.lessons);
    assert.deepEqual(ui, expected.strings);
    for (const lesson of LESSONS) {
      const translated = localizer.localizeLesson(lesson, locale);
      assert.equal(translated.title, localizer.localizedLessonTitle(lesson, locale));
      assert.deepEqual(translated.strokes, lesson.strokes);
      assert.deepEqual(translated.steps.map(s => [s.id, s.kind, s.quietMs, s.canSkip]), lesson.steps.map(s => [s.id, s.kind, s.quietMs, s.canSkip]));
    }
    const damaged = structuredClone(data), first = LESSONS[0];
    delete damaged.lessons[first.id].steps[first.steps[0].id];
    assert.throws(() => localizer.localizeLesson(first, locale, damaged));
    assert.throws(() => localizer.localizeLesson(first, locale, { ...data, locale: 'fr-FR' }));
  }
});

test('German and Italian dynamic accessibility labels match the source draft', () => {
  for (const [locale, localizer, draft] of [['de-DE', germanLesson, germanDynamic], ['it-IT', italianLesson, italianDynamic]]) {
    const dynamic = dynamicLocale(locale);
    for (const lesson of LESSONS) {
      const translated = localizer.localizeLesson(lesson, locale);
      for (const [index] of lesson.steps.entries()) {
        assert.equal(dynamic.board(translated, index), draft.demonstrationLabel(translated, index));
        assert.equal(dynamic.stage(translated, index), draft.stageLabel(translated, index));
      }
    }
    assert.equal(dynamic.copy.duration(15), (locale === 'de-DE' ? draft.GERMAN_DYNAMIC : draft.ITALIAN_DYNAMIC).duration(15));
  }
});

test('German and Italian cannot load with incomplete narration', async () => {
  for (const locale of ['de-DE', 'it-IT']) {
    assert.equal(narrationForLocale(locale, [LESSONS[0]], { index: {}, durations: {} }).ready, false);
    await assert.rejects(loadLocaleLanguage(locale, [LESSONS[0]], { loadNarration: async () => ({ index: {}, durations: {} }) }));
  }
});
