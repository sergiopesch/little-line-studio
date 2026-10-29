#!/usr/bin/env node
// One-time migration evidence against an immutable, trusted Git revision.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { LESSONS } from "../src/lesson-catalogue.js";
import { createPublicCatalogue } from "../src/agent/catalogue.js";
import { LOCALES } from "../src/locale-registry.js";
import * as currentLesson from "../src/lesson.js";
import * as currentPlayback from "../src/scripted-session.js";

const baseline = process.argv[2] ?? "2d87262966ef20d5e8c82b997f870e86436ffc26";
if (!/^[a-f0-9]{40}$/.test(baseline)) throw new Error("Provide a full trusted baseline commit SHA.");
const directory = await mkdtemp(join(tmpdir(), "trazolino-engine-parity-"));
const root = resolve(import.meta.dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
let comparisons = 0, timingComparisons = 0, seed = 472019;
function same(actual, expected, context) { assert.deepEqual(actual, expected, context); comparisons++; }
function random(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; }

try {
  // The unchanged dependencies must really be identical, not silently taken from a changed checkout.
  const unchanged = ["src/lessons", "src/lesson-model.js", "src/lesson-catalogue.js", "src/lesson-levels.js",
    "src/demonstration-state.js", "src/narration-policy.js", "src/curriculum-scripts.json"];
  for (const path of unchanged) assert.equal(git("diff", baseline, "--", path), "", `Parity dependency changed: ${path}`);
  async function historical(name) {
    const source = git("show", `${baseline}:src/${name}.js`).replace(/from "(\.\/[^\"]+)"/g,
      (_, path) => `from ${JSON.stringify(pathToFileURL(resolve(root, "src", path)).href)}`);
    const file = join(directory, `${name}.mjs`);
    await writeFile(file, source);
    return import(pathToFileURL(file).href);
  }
  const oldLesson = await historical("lesson"), oldPlayback = await historical("scripted-session");
  const catalogue = createPublicCatalogue();
  const actions = ["NEXT", "BACK", "PAUSE", "RESUME", "START", "FINISH", "KEEP_DRAWING", "RESTART", "MODEL_OUTPUT", "RESET", "OPEN_CATALOGUE", "SELECT_LESSON"];
  for (const lesson of LESSONS) {
    let before = oldLesson.initialLesson, after = currentLesson.initialLesson;
    const sequence = [
      { type: "OPEN_CATALOGUE", level: lesson.level }, { type: "SELECT_LESSON", lessonId: lesson.id },
      { type: "START", supervised: false }, { type: "START", supervised: true },
      ...Array.from({ length: lesson.steps.length + 3 }, () => ({ type: "NEXT" })),
      { type: "PAUSE" }, { type: "RESUME", supervised: false }, { type: "RESUME", supervised: true },
      { type: "FINISH" }, { type: "KEEP_DRAWING" }, { type: "RESUME", supervised: true },
      ...Array.from({ length: 1000 }, () => ({ type: actions[random(actions.length)], supervised: random(2) === 1, level: lesson.level, lessonId: lesson.id })),
    ];
    for (const event of sequence) {
      before = oldLesson.lessonReducer(before, event); after = currentLesson.lessonReducer(after, event);
      same(after, before, `${lesson.id}/${event.type}`);
    }
  }
  for (const locale of LOCALES) for (const lesson of LESSONS) {
    const { lesson: localized, durations } = await catalogue.load(locale.id, lesson.id);
    for (const speed of ["slow", "slower", "normal"]) for (const still of [false, true]) {
      same(currentPlayback.estimateLessonDurationMs(localized, { speed, still, narrationDurations: durations }),
        oldPlayback.estimateLessonDurationMs(localized, { speed, still, narrationDurations: durations }), `${locale.id}/${lesson.id}/estimate`);
      for (const [stepIndex, step] of localized.steps.entries()) {
        const options = { speed, still, voiceDurationMs: durations[`${lesson.id}/${step.id}/instruction`] };
        const oldTiming = oldPlayback.getStepTiming(localized, stepIndex, options);
        const timing = currentPlayback.getStepTiming(localized, stepIndex, options);
        same(timing, oldTiming, `${locale.id}/${lesson.id}/${step.id}/timing`); timingComparisons++;
        for (const textOnly of [false, true]) {
          let before = oldPlayback.createScriptedSession({ lessonId: lesson.id, stepIndex, timing: oldTiming, textOnly });
          let after = currentPlayback.createScriptedSession({ lessonId: lesson.id, stepIndex, timing, textOnly });
          const events = [{ type: "DEMO_DONE" }, { type: "HOLD" }, { type: "TICK", elapsedMs: 250 },
            { type: "VOICE_DONE" }, { type: "DEMO_DONE" }, { type: "CONTINUE" }, { type: "EXTEND" },
            { type: "REPLAY" }, { type: "VOICE_DONE" }, { type: "DEMO_DONE" },
            { type: "TICK", elapsedMs: 60000, active: false }, { type: "TICK", elapsedMs: 2001 },
            { type: "VOICE_DONE" }, { type: "REPLAY" }, { type: "VOICE_DONE", run: -1 }];
          for (const event of events) {
            const command = { lessonId: lesson.id, stepIndex, run: before.run, ...event };
            before = oldPlayback.scriptedSessionReducer(before, command);
            after = currentPlayback.scriptedSessionReducer(after, command);
            same(after, before, `${locale.id}/${lesson.id}/${step.id}/${event.type}`);
          }
        }
      }
    }
  }
  function bench(reducer) {
    const state = currentPlayback.createScriptedSession({ lessonId: "cat", stepIndex: 0, timing: { instructionMs: 1000 } });
    const event = { type: "TICK", lessonId: "cat", stepIndex: 0, run: 0, elapsedMs: 250 };
    for (let i = 0; i < 10000; i++) reducer(state, event);
    const times = [];
    for (let trial = 0; trial < 5; trial++) {
      const start = performance.now();
      for (let i = 0; i < 100000; i++) reducer(state, event);
      times.push((performance.now() - start) / 100000);
    }
    return times.sort((a, b) => a - b)[2];
  }
  const report = {
    baseline, candidate: git("rev-parse", "HEAD").trim(), workingTreeDirty: Boolean(git("status", "--porcelain").trim()),
    node: process.version, lessons: LESSONS.length, locales: LOCALES.length,
    comparisons, timingComparisons, mismatches: 0, seed: 472019,
    medianMillisecondsPerTick: { baseline: bench(oldPlayback.scriptedSessionReducer), candidate: bench(currentPlayback.scriptedSessionReducer) },
    limitations: ["Deterministic state and timing parity, not media listening or family usability", "Microbenchmark is local evidence, not an end-to-end speed claim", "New malformed-input rejection is tested separately"],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally { await rm(directory, { recursive: true, force: true }); }
