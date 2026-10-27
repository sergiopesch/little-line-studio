import assert from "node:assert/strict";
import test from "node:test";
import { LESSONS } from "../src/lesson-catalogue.js";
import manifest from "../src/narration-manifest.json" with { type: "json" };
import {
  createScriptedSession,
  estimateLessonDurationMs,
  getStepTiming,
  MAX_ACTIVE_TICK_MS,
  MORE_TIME_MS,
  narrationDurationIndex,
  scriptedSessionReducer,
} from "../src/scripted-session.js";

const timing = Object.freeze({
  instructionMs: 1000,
  demoMs: 3000,
  quietMs: 1000,
  hasDemonstration: true,
  holdOpen: false,
});
const start = (overrides = {}) =>
  createScriptedSession({
    lessonId: "cat",
    stepIndex: 2,
    run: 4,
    timing,
    ...overrides,
  });
const send = (state, type, extra = {}) =>
  scriptedSessionReducer(state, {
    type,
    lessonId: state.lessonId,
    stepIndex: state.stepIndex,
    run: state.run,
    ...extra,
  });
function ticks(state, count, elapsedMs = 250, extra = {}) {
  for (let index = 0; index < count; index++)
    state = send(state, "TICK", { elapsedMs, ...extra });
  return state;
}
const practice = (state = start()) =>
  send(send(state, "VOICE_DONE"), "DEMO_DONE");

test("actual voice and rendered demonstration gate the whole quiet window in order", () => {
  let state = start();
  const initial = state;
  assert.equal(ticks(state, 1000), state, "time cannot finish actual voice");
  assert.equal(
    send(state, "DEMO_DONE"),
    state,
    "early board completion cannot skip speech",
  );
  state = send(state, "VOICE_DONE");
  assert.equal(state.stage, "demonstration");
  assert.equal(
    ticks(state, 1000),
    state,
    "elapsed authored demo budget is not actual completion",
  );
  assert.equal(
    send(state, "VOICE_DONE"),
    state,
    "duplicate speech completion is harmless",
  );
  state = send(state, "DEMO_DONE");
  assert.equal(state.stage, "practice");
  assert.equal(state.remainingMs, timing.quietMs);
  assert.equal(send(state, "DEMO_DONE"), state);
  state = ticks(state, 3);
  assert.equal(state.stage, "practice");
  assert.equal(state.remainingMs, 250);
  state = ticks(state, 1);
  assert.equal(state.stage, "ready");
  assert.equal(state.remainingMs, 0);
  assert.equal(
    state.stepIndex,
    initial.stepIndex,
    "scheduler never advances lesson selection itself",
  );
  assert.equal(
    ticks(state, 100),
    state,
    "one ready signal cannot consume another step",
  );
});

test("voice-off reading uses active time before the board, with no budget carried across phases", () => {
  let state = start({ textOnly: true });
  state = ticks(state, 3);
  assert.equal(state.stage, "instruction");
  assert.equal(state.remainingMs, 250);
  state = ticks(state, 1);
  assert.equal(state.stage, "demonstration");
  assert.equal(state.remainingMs, null);
  state = send(state, "DEMO_DONE");
  assert.equal(
    state.remainingMs,
    1000,
    "reading never spends the child's practice time",
  );
});

test("observation and preparation skip animation but retain their complete quiet windows", () => {
  for (const textOnly of [true, false]) {
    let state = start({
      textOnly,
      timing: { ...timing, hasDemonstration: false },
    });
    state = textOnly ? ticks(state, 4) : send(state, "VOICE_DONE");
    assert.equal(state.stage, "practice");
    assert.equal(state.remainingMs, timing.quietMs);
  }
});

test("cat colouring gates each shorter practice window on real teaching and painting completion", () => {
  const cat = LESSONS.find((lesson) => lesson.id === "cat");
  const windows = [2000, 6000, 6000, 4000, 4000, 1000];
  let colourIndex = 0;
  for (const [stepIndex, step] of cat.steps.entries()) {
    if (step.kind !== "colour") continue;
    const authored = getStepTiming(cat, stepIndex);
    assert.equal(authored.quietMs, windows[colourIndex++], step.id);
    assert.equal(authored.hasDemonstration, ["colour-fur", "colour-fur-right", "colour-details", "colour-patterns"].includes(step.id), step.id);
    assert.equal(authored.demoMs > 0, authored.hasDemonstration, step.id);
    assert.equal(authored.holdOpen, false, step.id);
    let state = createScriptedSession({
      lessonId: cat.id,
      stepIndex,
      run: stepIndex,
      timing: authored,
    });
    assert.equal(ticks(state, 10000).stage, "instruction", "time cannot complete real narration");
    state = send(state, "VOICE_DONE");
    if (authored.hasDemonstration) state = send(state, "DEMO_DONE");
    assert.equal(state.stage, "practice");
    assert.equal(state.remainingMs, authored.quietMs);
    assert.equal(
      ticks(state, 1, 60000, { active: false }),
      state,
      "hidden colouring time is not consumed",
    );
    const held = send(state, "HOLD");
    assert.equal(ticks(held, 10000), held, "More time stays open indefinitely");
    const replayed = send(held, "REPLAY");
    assert.equal(replayed.hold, true);
    let afterReplay = send(replayed, "VOICE_DONE");
    if (authored.hasDemonstration) afterReplay = send(afterReplay, "DEMO_DONE");
    assert.equal(afterReplay.stage, "practice");
    assert.equal(ticks(afterReplay, 10000), afterReplay);
    state = send(afterReplay, "CONTINUE");
    assert.equal(state.remainingMs, authored.quietMs);
    const remainingTicks = authored.quietMs / MAX_ACTIVE_TICK_MS;
    state = ticks(state, remainingTicks - 1);
    assert.equal(state.stage, "practice");
    assert.equal(state.remainingMs, MAX_ACTIVE_TICK_MS);
    state = ticks(state, 1);
    assert.equal(state.stage, "ready");
    assert.equal(state.stepIndex, stepIndex, "the trusted owner advances selection");
  }
  assert.equal(colourIndex, 6);
});

test("inactive ticks freeze reading and practice, even across a long hidden interval", () => {
  for (const state of [start({ textOnly: true }), practice()]) {
    assert.equal(ticks(state, 100, 60000, { active: false }), state);
    assert.equal(state.interrupted, false);
    assert.equal(ticks(state, 1).remainingMs, 750);
  }
});

test("active stalls request interruption without catching up or consuming the current window", () => {
  for (const state of [start(), send(start(), "VOICE_DONE"), practice()]) {
    const stalled = send(state, "TICK", { elapsedMs: 2001 });
    assert.equal(stalled.interrupted, true);
    assert.equal(stalled.remainingMs, state.remainingMs);
    assert.equal(stalled.stage, state.stage);
    assert.equal(ticks(stalled, 100), stalled);
    assert.equal(send(stalled, "VOICE_DONE"), stalled);
    assert.equal(send(stalled, "DEMO_DONE"), stalled);
    const replayed = send(stalled, "REPLAY");
    assert.equal(replayed.interrupted, false);
    assert.equal(replayed.stage, "instruction");
    assert.equal(replayed.run, stalled.run + 1);
  }
});

test("late samples below the stall threshold still consume at most one small active tick", () => {
  const state = practice();
  assert.equal(
    send(state, "TICK", { elapsedMs: 2000 }).remainingMs,
    timing.quietMs - MAX_ACTIVE_TICK_MS,
  );
  assert.equal(
    send(state, "TICK", { elapsedMs: 1 }).remainingMs,
    timing.quietMs - 1,
  );
  for (const elapsedMs of [-1, 0, NaN, Infinity, "250", undefined])
    assert.equal(send(state, "TICK", { elapsedMs }), state);
});

test("More time holds indefinitely, including requests made during voice or demonstration", () => {
  for (const where of ["instruction", "demonstration", "practice", "ready"]) {
    let state = start();
    if (where !== "instruction") state = send(state, "VOICE_DONE");
    if (["practice", "ready"].includes(where)) state = send(state, "DEMO_DONE");
    if (where === "ready") state = ticks(state, 4);
    state = send(state, "HOLD");
    assert.equal(state.hold, true);
    if (state.stage === "instruction") state = send(state, "VOICE_DONE");
    if (state.stage === "demonstration") state = send(state, "DEMO_DONE");
    assert.equal(state.stage, "practice");
    const held = state;
    assert.equal(ticks(state, 10000), held);
    state = send(state, "CONTINUE");
    assert.equal(state.hold, false);
    assert.equal(state.remainingMs, timing.quietMs);
    assert.equal(ticks(state, 3).stage, "practice");
    assert.equal(ticks(state, 4).stage, "ready");
  }
});

test("a hold never prevents the instruction and demonstration from completing", () => {
  let state = send(start({ textOnly: true }), "HOLD");
  state = ticks(state, 4);
  assert.equal(state.stage, "demonstration");
  state = send(state, "DEMO_DONE");
  assert.equal(state.stage, "practice");
  assert.equal(ticks(state, 100), state);
});

test("optional extension grants thirty more seconds and can recover a just-ready clock", () => {
  for (const before of [practice(), ticks(practice(), 4)]) {
    const extended = send(before, "EXTEND");
    assert.equal(extended.stage, "practice");
    assert.equal(extended.remainingMs, before.remainingMs + MORE_TIME_MS);
  }
});

test("replay uses a new run, starts at instruction and preserves an explicit family hold", () => {
  const state = send(ticks(practice(), 2), "HOLD");
  const replayed = send(state, "REPLAY");
  assert.equal(replayed.stage, "instruction");
  assert.equal(replayed.remainingMs, timing.instructionMs);
  assert.equal(replayed.run, state.run + 1);
  assert.equal(replayed.hold, true);
  assert.equal(replayed.stepIndex, state.stepIndex);
  for (const type of [
    "VOICE_DONE",
    "DEMO_DONE",
    "HOLD",
    "CONTINUE",
    "TICK",
    "REPLAY",
  ])
    assert.equal(
      scriptedSessionReducer(replayed, {
        type,
        lessonId: state.lessonId,
        stepIndex: state.stepIndex,
        run: state.run,
        elapsedMs: 250,
      }),
      replayed,
    );
});

test("unknown, incomplete and cross-lesson/step/run events cannot alter a session", () => {
  const state = practice();
  for (const identity of [
    {},
    { lessonId: "sun", stepIndex: 2, run: 4 },
    { lessonId: "cat", stepIndex: 3, run: 4 },
    { lessonId: "cat", stepIndex: 2, run: 3 },
  ]) {
    for (const type of [
      "VOICE_DONE",
      "DEMO_DONE",
      "TICK",
      "HOLD",
      "CONTINUE",
      "EXTEND",
      "REPLAY",
    ])
      assert.equal(
        scriptedSessionReducer(state, { type, ...identity, elapsedMs: 250 }),
        state,
      );
  }
  assert.equal(
    send(state, "MODEL_OUTPUT", { next: 99, permissions: true }),
    state,
  );
  const nextStep = createScriptedSession({ ...state, stepIndex: 3, run: 5 });
  assert.equal(nextStep.stage, "instruction");
  assert.equal(nextStep.remainingMs, timing.instructionMs);
  assert.equal(nextStep.hold, false);
});

test("exploration remains open after teaching regardless of ticks, extension or hold controls", () => {
  let state = start({
    timing: { ...timing, hasDemonstration: false, holdOpen: true },
  });
  state = send(state, "VOICE_DONE");
  assert.equal(state.stage, "practice");
  assert.equal(state.remainingMs, null);
  assert.equal(ticks(state, 10000), state);
  assert.equal(send(state, "EXTEND"), state);
  state = send(send(state, "HOLD"), "CONTINUE");
  assert.equal(state.remainingMs, null);
  assert.equal(ticks(state, 10000), state);
});

test("authored timing adapts to level, mark duration and pace without shortening still practice", () => {
  const makeLesson = (level, durationMs = 8000) => ({
    id: "fixture",
    level,
    steps: [
      {
        id: "mark",
        kind: "draw",
        spoken: "One small mark.",
        stroke: { durationMs },
      },
    ],
  });
  const basic = getStepTiming(makeLesson("basic"), 0);
  const measured = getStepTiming(makeLesson("basic"), 0, { voiceDurationMs: 9000 });
  assert.equal(measured.instructionMs, 10000, "estimates account for gentle 0.9x voice playback");
  const intermediate = getStepTiming(makeLesson("intermediate"), 0);
  const expert = getStepTiming(makeLesson("expert"), 0);
  assert.ok(
    basic.quietMs < intermediate.quietMs &&
      intermediate.quietMs < expert.quietMs,
  );
  assert.ok(
    getStepTiming(makeLesson("basic", 12000), 0).quietMs > basic.quietMs,
  );
  const slower = getStepTiming(makeLesson("basic"), 0, { speed: "slower" });
  assert.ok(slower.quietMs > basic.quietMs && slower.demoMs > basic.demoMs);
  const still = getStepTiming(makeLesson("basic"), 0, { still: true });
  assert.equal(still.demoMs, 0);
  assert.equal(
    still.hasDemonstration,
    true,
    "still boards must still be actually ready",
  );
  assert.equal(still.quietMs, basic.quietMs);
  const authoredWindow = makeLesson("expert", 12000);
  authoredWindow.steps[0].quietMs = 70000;
  assert.equal(getStepTiming(authoredWindow, 0).quietMs, 70000);
  assert.throws(() => getStepTiming(makeLesson("basic"), 99), TypeError);
});

test("actual narration metadata becomes a compact millisecond index for finite lesson estimates", () => {
  const durations = narrationDurationIndex(manifest);
  const [key, clip] = Object.entries(manifest.clips)[0];
  assert.equal(durations[key], Math.ceil(clip.duration * 1000));
  assert.deepEqual(
    narrationDurationIndex({
      clips: { bad: { duration: Infinity }, negative: { duration: -1 } },
    }),
    {},
  );
  for (const lesson of LESSONS) {
    const estimate = estimateLessonDurationMs(lesson, {
      narrationDurations: durations,
    });
    assert.ok(Number.isFinite(estimate) && estimate > 0, lesson.id);
    assert.ok(
      estimateLessonDurationMs(lesson, {
        narrationDurations: durations,
        speed: "slower",
      }) > estimate,
      lesson.id,
    );
    const stillEstimate = estimateLessonDurationMs(lesson, {
      narrationDurations: durations,
      still: true,
    });
    // Concurrent teaching can be voice-limited, so removing motion need not shorten it.
    assert.ok(stillEstimate <= estimate, lesson.id);
    if (!lesson.concurrentTeaching) assert.ok(stillEstimate < estimate, lesson.id);
    const final = getStepTiming(lesson, lesson.steps.length - 1);
    assert.equal(final.holdOpen, true);
    assert.ok(final.instructionMs > 0);
  }
});

test("every authored session reaches open exploration without compulsory family navigation", () => {
  let actions = 0;
  for (const lesson of LESSONS) {
    for (const [stepIndex, step] of lesson.steps.entries()) {
      const timing = getStepTiming(lesson, stepIndex);
      let state = createScriptedSession({
        lessonId: lesson.id,
        stepIndex,
        run: stepIndex,
        timing,
      });
      const identity = { lessonId: lesson.id, stepIndex, run: stepIndex };
      state = scriptedSessionReducer(state, {
        type: "VOICE_DONE",
        ...identity,
      });
      if (timing.hasDemonstration) {
        assert.equal(state.stage, "demonstration");
        state = scriptedSessionReducer(state, {
          type: "DEMO_DONE",
          ...identity,
        });
        actions++;
      }
      assert.equal(state.stage, "practice");
      const ticks = Math.ceil(timing.quietMs / MAX_ACTIVE_TICK_MS) + 2;
      for (let count = 0; count < ticks; count++)
        state = scriptedSessionReducer(state, {
          type: "TICK",
          ...identity,
          elapsedMs: MAX_ACTIVE_TICK_MS,
        });
      assert.equal(
        state.stage,
        step.kind === "explore" ? "practice" : "ready",
        `${lesson.id}/${step.id}`,
      );
    }
  }
  const paintingPhases = LESSONS.reduce((total, lesson) => total + Object.keys(lesson.appearance?.colourPhases ?? {}).length, 0);
  assert.ok(paintingPhases >= 90, "Every drawing includes several authored painting demonstrations.");
  assert.equal(actions, 500 + paintingPhases, "All 500 drawing marks and every crayon phase complete automatically.");
});
