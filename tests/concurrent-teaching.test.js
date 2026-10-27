import assert from "node:assert/strict";
import test from "node:test";
import { createScriptedSession, getStepTiming, estimateLessonDurationMs, scriptedSessionReducer } from "../src/scripted-session.js";
import { getLessonProgress } from "../src/lesson-progress.js";

const lesson = {
  id: "cat", level: "basic", concurrentTeaching: true,
  steps: [{ id: "mark", kind: "draw", instruction: "Draw a curve.", quietMs: 2000, stroke: { durationMs: 4000 } }],
};
const timing = getStepTiming(lesson, 0, { voiceDurationMs: 9000 });
const start = (extra = {}) => createScriptedSession({ lessonId: "cat", stepIndex: 0, run: 2, timing, ...extra });
const send = (state, type, extra = {}) => scriptedSessionReducer(state, { ...state, type, ...extra });

test("concurrent teaching waits for both real completions in either order", () => {
  for (const order of [["DEMO_DONE", "VOICE_DONE"], ["VOICE_DONE", "DEMO_DONE"]]) {
    let state = start();
    for (let i = 0; i < 100; i++) state = send(state, "TICK", { elapsedMs: 250 });
    assert.equal(state.stage, "instruction", "elapsed time cannot finish the real voice or demo");
    state = send(state, order[0]);
    assert.notEqual(state.stage, "practice", "one completed channel cannot start practice");
    state = send(state, order[1]);
    assert.equal(state.stage, "practice");
    assert.equal(state.remainingMs, 2000, "neither teaching channel consumes practice");
    assert.equal(send(state, "VOICE_DONE"), state);
    assert.equal(send(state, "DEMO_DONE"), state);
  }
});

test("replay resets both completion gates while keeping an unlimited family hold", () => {
  let state = send(send(start(), "DEMO_DONE"), "HOLD");
  state = send(state, "REPLAY");
  assert.equal(state.hold, true);
  assert.equal(state.demonstrationDone, false);
  assert.equal(state.demonstrationElapsedMs, 0);
  const previous = scriptedSessionReducer(state, { type: "VOICE_DONE", lessonId: "cat", stepIndex: 0, run: 2 });
  assert.equal(previous, state, "stale voice completion cannot end a replay");
  state = send(send(state, "VOICE_DONE"), "DEMO_DONE");
  for (let i = 0; i < 200; i++) state = send(state, "TICK", { elapsedMs: 250 });
  assert.equal(state.remainingMs, 2000);
  state = send(state, "CONTINUE");
  for (let i = 0; i < 8; i++) state = send(state, "TICK", { elapsedMs: 250 });
  assert.equal(state.stage, "ready");
  assert.equal(state.stepIndex, 0, "only App can advance lesson selection");
});

test("hidden intervals and stalls do not fast-forward a parallel demonstration", () => {
  const state = send(start(), "TICK", { elapsedMs: 250 });
  assert.equal(state.demonstrationElapsedMs, 250);
  assert.equal(send(state, "TICK", { active: false, elapsedMs: 60000 }), state);
  const interrupted = send(state, "TICK", { elapsedMs: 60000 });
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.demonstrationElapsedMs, 250);
  assert.equal(send(interrupted, "VOICE_DONE"), interrupted);
});

test("parallel estimates count overlapping voice and demonstration once", () => {
  assert.equal(timing.parallelTeaching, true);
  assert.equal(estimateLessonDurationMs(lesson, { narrationDurations: { "cat/mark/instruction": 9000 } }), 12000);
  const sequential = { ...lesson, concurrentTeaching: false };
  assert.equal(estimateLessonDurationMs(sequential, { narrationDurations: { "cat/mark/instruction": 9000 } }), 16000);
  const state = { ...start(), demonstrationElapsedMs: 3000 };
  const progress = getLessonProgress({ lesson, stepIndex: 0, playback: state, stageElapsedMs: 3000, narrationDurations: { "cat/mark/instruction": 9000 } });
  assert.equal(progress.remainingMs, 9000);
});

test("written teaching and still demonstrations retain both gates", () => {
  let state = start({ textOnly: true, timing: { ...timing, instructionMs: 500, demoMs: 0 } });
  state = send(state, "DEMO_DONE");
  state = send(state, "TICK", { elapsedMs: 250 });
  assert.equal(state.stage, "instruction");
  state = send(state, "TICK", { elapsedMs: 250 });
  assert.equal(state.stage, "practice");
  assert.equal(state.remainingMs, 2000);
});
