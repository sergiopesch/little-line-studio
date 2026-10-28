import test from "node:test";
import assert from "node:assert/strict";
import { demonstrationLabel } from "../src/demonstration-label.js";
import { languageAvailabilityCopy } from "../src/languages.js";
import { LESSONS } from "../src/lesson-catalogue.js";
import { localizeLesson } from "../src/spanish-lessons.js";

test("language availability copy reflects whether Spanish is ready", () => {
  assert.match(languageAvailabilityCopy(false, false, false).banner, /^English ready/);
  assert.match(languageAvailabilityCopy(false, false, false).note, /^British English is ready/);
  assert.match(languageAvailabilityCopy(true, false, false).banner, /^English and Spanish ready/);
  assert.match(languageAvailabilityCopy(true, false, false).note, /Latin American Spanish are ready/);
  assert.match(languageAvailabilityCopy(true, true, false).banner, /some Spanish lessons/);
  assert.match(languageAvailabilityCopy(true, true, false).note, /other Spanish drawings are being prepared/);
  assert.equal(languageAvailabilityCopy(true, false, true).banner, "Choose a language for your drawing");
});

test("every demonstration has a localized, accurate screen-reader label", () => {
  for (const lesson of LESSONS) {
    const spanish = localizeLesson(lesson, "es-419");
    for (const [index, step] of lesson.steps.entries()) {
      const englishLabel = demonstrationLabel(lesson, index, "en-GB");
      const spanishLabel = demonstrationLabel(spanish, index, "es-419");
      assert.match(englishLabel, /Draw on your own paper\.$/, `${lesson.id}/${step.id}`);
      assert.match(spanishLabel, /Dibuja en tu propio papel\.$/, `${lesson.id}/${step.id}`);
      assert.doesNotMatch(spanishLabel, /drawing action|teacher reference|Colouring demonstration|trazo 0\b/i, `${lesson.id}/${step.id}`);
    }
  }
});
