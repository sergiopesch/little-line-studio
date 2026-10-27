import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LESSONS } from "../src/lesson-catalogue.js";
import { COMPLETE_REGISTRATIONS } from "../src/lesson-packs.js";
import { getOutlineMarks } from "../src/outline-marks.js";
import { getColourMarks } from "../src/crayon-appearance.js";
import music from "../src/lesson-music-catalogue.json" with { type: "json" };

test("all thirty subjects have distinct stories, original music briefs and exact level assignments", () => {
  assert.equal(Object.keys(music).length, 30);
  assert.equal(new Set(Object.values(music).map((entry) => entry.prompt)).size, 30);
  assert.equal(new Set(LESSONS.map((lesson) => lesson.teachingPack.story.thread)).size, 30);
  assert.equal(new Set(LESSONS.map((lesson) => lesson.steps[0].spoken)).size, 30);
  for (const lesson of LESSONS) {
    assert.equal(music[lesson.id].level, lesson.level);
    assert.equal(lesson.musicId, lesson.id);
    assert.equal(music[lesson.id].seconds, 90);
    assert.match(music[lesson.id].prompt, /instrumental/i);
    assert.match(music[lesson.id].prompt, /No vocals/i);
  }
});

test("new packs keep every native colour movement within its render budget and independent contour contract", () => {
  assert.equal(COMPLETE_REGISTRATIONS.length, 26);
  const identities = new Set();
  for (const registration of COMPLETE_REGISTRATIONS) {
    const lesson = LESSONS.find((entry) => entry.id === registration.id);
    const marks = getColourMarks(lesson);
    assert.ok(marks.length > 20 && marks.length < 280, lesson.id);
    assert.ok(marks.length + getOutlineMarks(lesson).length < 300, lesson.id);
    const regions = Object.values(registration.regions).flat();
    const regionIds = regions.map((entry) => entry.gestureId);
    const gestures = Object.values(lesson.appearance.colourPhases).flatMap((phase) => phase.gestures);
    assert.deepEqual([...regionIds].sort(), gestures.map((entry) => entry.id).sort(), lesson.id);
    for (const mark of marks) {
      assert.ok(mark.width >= 0.5 && mark.width <= 20, mark.id);
      assert.equal(identities.has(mark.id), false, mark.id);
      identities.add(mark.id);
    }
    assert.ok(lesson.steps.reduce((sum, step) => sum + (step.quietMs ?? 0), 0) <= 100000, lesson.id);
  }
});

test("all new native crayon ink, caps, grain and six partial prefixes remain inside actual subject contours at both SDK zoom modes", () => {
  const result = JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(new URL("./helpers/native-complete-containment.mjs", import.meta.url))],
    { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 }));
  assert.equal(result.results.length, 26);
  assert.deepEqual(result.failures, []);
  for (const lesson of result.results) {
    assert.equal(lesson.prefixes, lesson.nativeRecords * 12, lesson.id);
    assert.ok(lesson.inkPoints > lesson.prefixes, lesson.id);
  }
});
