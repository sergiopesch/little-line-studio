import { test } from "node:test";
import assert from "node:assert/strict";
import { releasedLessons, hasCompleteNarration, isLessonAvailable, narrationForLocale,
  spanishLessonAvailable, validSpanishAvailability } from "../src/narration-locales.js";
import { LESSONS } from "../src/lesson-catalogue.js";
import { getLanguage } from "../src/languages.js";

const lessons = [{ id: "cat", steps: [{ id: "head" }] }];
const path = `/narration/clip-${"a".repeat(64)}.mp3`;
const index = { sample: path, "cat/head/instruction": path, "cat/head/hint": path };
const durations = { sample: 1000, "cat/head/instruction": 2000, "cat/head/hint": 1000 };

test("Spanish voice requires all clips, same-origin paths and measured durations", () => {
  assert.equal(hasCompleteNarration(lessons, index, durations), true);
  assert.equal(hasCompleteNarration(lessons, { ...index, "cat/head/hint": undefined }, durations), false);
  assert.equal(hasCompleteNarration(lessons, { ...index, sample: `https://example.com${path}` }, durations), false);
  assert.equal(hasCompleteNarration(lessons, index, { ...durations, "cat/head/instruction": 0 }), false);
  assert.equal(hasCompleteNarration([], index, durations), false);
});

test("Spanish availability requires a valid release set and complete per-lesson narration", () => {
  const dog = { id: "dog", steps: [{ id: "tail" }] };
  const knownLessons = [...lessons, dog];
  const descriptor = { schemaVersion: 1, locale: "es-419", lessons: ["cat"] };
  const inputs = { descriptor, index, durations, knownLessons };
  assert.equal(validSpanishAvailability({ ...descriptor, lessons: [] }, knownLessons), true);
  assert.equal(spanishLessonAvailable(lessons[0], inputs), true);
  assert.equal(spanishLessonAvailable(dog, inputs), false);
  assert.equal(spanishLessonAvailable(lessons[0], { ...inputs, index: { ...index, sample: undefined } }), false);
  assert.equal(spanishLessonAvailable(lessons[0], { ...inputs, index: { ...index, "cat/head/hint": undefined } }), false);
  assert.equal(spanishLessonAvailable(lessons[0], { ...inputs, durations: { ...durations, "cat/head/instruction": 0 } }), false);
  for (const invalid of [
    { ...descriptor, schemaVersion: 2 }, { ...descriptor, locale: "en-GB" },
    { ...descriptor, lessons: ["dog", "cat"] }, { ...descriptor, lessons: ["cat", "cat"] },
    { ...descriptor, lessons: ["unknown"] }, { ...descriptor, lessons: null },
  ]) assert.equal(spanishLessonAvailable(lessons[0], { ...inputs, descriptor: invalid }), false);
  const all = { ...descriptor, lessons: ["cat", "dog"] };
  const allIndex = { ...index, "dog/tail/instruction": path, "dog/tail/hint": path };
  const allDurations = { ...durations, "dog/tail/instruction": 1000, "dog/tail/hint": 1000 };
  assert.equal(spanishLessonAvailable(dog, { descriptor: all, index: allIndex, durations: allDurations, knownLessons }), true);
});

test("runtime readiness follows the released lessons and never falls back to English", async () => {
  const released = releasedLessons("es-419");
  const resources = await import("../src/spanish-narration.js");
  assert.equal(getLanguage("es-419").ready, released.length > 0);
  assert.ok(LESSONS.every((lesson) => isLessonAvailable("en-GB", lesson)));
  assert.equal(isLessonAvailable("es-419", { id: "unknown" }, resources), false);
  const locale = narrationForLocale("es-419", LESSONS, resources);
  assert.equal(locale.ready, released.length === LESSONS.length);
  if (!locale.ready) {
    assert.deepEqual(locale.index, {});
    assert.deepEqual(locale.durations, {});
  }
  const available = narrationForLocale("es-419", released, resources);
  assert.equal(available.ready, released.length > 0);
  if (available.ready) assert.ok(isNarrationPathForTest(available.index.sample));
  assert.equal(narrationForLocale("es-419", released).ready, false);
});

const isNarrationPathForTest = (value) => /^\/narration\/clip-[a-f0-9]{64}\.mp3$/.test(value);

test("written timing allows reading of the visible title and instruction", async () => {
  const { getStepTiming } = await import("../src/scripted-session.js");
  const lesson = { id: "test", level: "basic", steps: [{
    id: "step", kind: "observe", title: "Mira esta parte con calma",
    instruction: "Busca la línea curva y síguela con tu dedo antes de dibujarla en tu papel",
    spoken: "Mira aquí.",
  }] };
  const timing = getStepTiming(lesson, 0);
  assert.ok(timing.instructionMs >= (19 / 1.5) * 1000);
});
