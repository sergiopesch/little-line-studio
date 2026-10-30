import test from "node:test";
import assert from "node:assert/strict";
import german from "../src/german-lessons.de-DE.json" with { type: "json" };
import spanish from "../src/spanish-lessons.es-419.json" with { type: "json" };
import { createLessonLocalizer } from "../src/localized-catalogue.js";
import { localizeLesson as localizeSpanish } from "../src/spanish-lessons.js";
import { LESSONS } from "../src/lesson-catalogue.js";
import { LOCALES } from "../src/locale-registry.js";

test("a lazy catalogue module rejects malformed text before it exposes a localizer", () => {
  for (const damage of [
    data => { data.locale = "it-IT"; },
    data => { data.reviewStatus = "approved"; },
    data => { data.lessons.cat.steps.notice.hint = ""; },
    data => { data.lessons.cat.pilotPhases[0].id = "assessment"; },
    data => { data.lessons.cat.steps = []; },
    data => { data.lessons.cat.title = () => "Cat"; },
  ]) {
    const input = structuredClone(german);
    damage(input);
    assert.throws(() => createLessonLocalizer(input, "de-DE"), TypeError);
  }
});

test("Latin American Spanish rejects a mismatched catalogue identity", () => {
  assert.throws(() => localizeSpanish(LESSONS[0], "es-419", { ...spanish, locale: "es-ES" }), /locale|identity/);
});

test("every translated locale copies text without granting control over lesson mechanics", async () => {
  const lesson = LESSONS[0];
  for (const locale of LOCALES.filter(entry => entry.textLocale !== "en-GB")) {
    const localizer = await locale.loadText();
    const translated = localizer.localizeLesson(lesson, locale.id);
    const input = { locale: locale.id,
      reviewStatus: ["es-419", "fr-FR"].includes(locale.id) ? "assistant-reviewed-awaiting-native-human-review" : "assistant-draft-awaiting-native-human-review",
      lessons: { [lesson.id]: { ...translated,
        id: "other", level: "expert", musicId: "other", strokes: [], frame: {},
        steps: Object.fromEntries(translated.steps.map(step => [step.id, {
          ...step, id: "other", kind: "explore", quietMs: 0, canSkip: true, stroke: {},
        }])),
        pilotPhases: translated.pilotPhases.map(phase => ({ ...phase, injected: true })),
      } },
    };
    const result = localizer.localizeLesson(lesson, locale.id, input);
    assert.deepEqual(result, translated, locale.id);
    for (const key of ["strokes", "appearance", "frame", "viewFrame"]) assert.equal(result[key], lesson[key]);
    assert.equal(localizer.localizeLesson(lesson, "en-GB"), lesson);
  }
});

test("a validated catalogue owns its text and ignores inherited lesson names", () => {
  const input = structuredClone(german);
  const localizer = createLessonLocalizer(input, "de-DE");
  const title = localizer.localizedLessonTitle(LESSONS[0], "de-DE");
  input.lessons.cat.title = "Changed after loading";
  assert.equal(localizer.localizedLessonTitle(LESSONS[0], "de-DE"), title);
  for (const id of ["constructor", "__proto__"]) {
    assert.equal(localizer.localizedLessonTitle({ id, title: "Source" }, "de-DE"), null);
    assert.throws(() => localizer.localizeLesson({ ...LESSONS[0], id }, "de-DE"), TypeError);
  }
});
