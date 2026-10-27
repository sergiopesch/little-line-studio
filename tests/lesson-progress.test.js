import assert from "node:assert/strict";
import test from "node:test";
import {
  createLessonClock,
  formatRemainingTime,
  formatTogetherTime,
  getLessonProgress,
  lessonClockReducer,
} from "../src/lesson-progress.js";
import { getStepTiming } from "../src/scripted-session.js";

const lesson = {
  id: "cat-pilot",
  level: "basic",
  steps: [
    { id: "look", kind: "observe", instruction: "Look together.", quietMs: 10000 },
    {
      id: "head",
      kind: "draw",
      instruction: "Draw a circle.",
      quietMs: 20000,
      stroke: { durationMs: 5000 },
    },
    {
      id: "fur",
      kind: "colour",
      instruction: "Choose a colour.",
      quietMs: 60000,
    },
    {
      id: "own",
      kind: "explore",
      instruction: "Make it yours.",
      quietMs: 999999,
    },
  ],
};
const durations = Object.fromEntries(
  lesson.steps.map((step) => [`${lesson.id}/${step.id}/instruction`, 9000]),
);
const options = { lesson, narrationDurations: durations };
function state(stepIndex, overrides = {}) {
  return {
    lessonId: lesson.id,
    stepIndex,
    stage: "instruction",
    timing: getStepTiming(lesson, stepIndex, { voiceDurationMs: 9000 }),
    textOnly: false,
    hold: false,
    ...overrides,
  };
}

test("timeline estimates actual current stage plus future budgets, not elapsed wall time", () => {
  const playback = state(1, { stage: "practice", remainingMs: 12000 });
  const progress = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback,
    elapsedMs: 65000,
  });
  assert.equal(progress.elapsedMs, 65000);
  assert.equal(progress.remainingMs, 92000);
  assert.equal(progress.phaseKey, "drawing");
  assert.equal(progress.estimateLabel, "About 2 min left");
  const longerTogether = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback,
    elapsedMs: 300000,
  });
  assert.equal(longerTogether.remainingMs, progress.remainingMs);
  assert.equal(longerTogether.progressPercent, progress.progressPercent);
});

test("voiced instruction and rendered demonstration use their own active stage clock", () => {
  const instruction = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: state(1),
    stageElapsedMs: 3000,
  });
  assert.equal(instruction.remainingMs, 112000);
  const demo = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: state(1, { stage: "demonstration" }),
    stageElapsedMs: 3000,
  });
  assert.equal(demo.remainingMs, 102000);
  const stillWaitingForMedia = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: state(1),
    stageElapsedMs: 999999,
  });
  assert.equal(stillWaitingForMedia.remainingMs, 105000);
  assert.equal(stillWaitingForMedia.phaseKey, "drawing");
});

test("text-only reading uses controller remaining time, with no double subtraction", () => {
  const progress = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: state(1, { textOnly: true, remainingMs: 4000 }),
    stageElapsedMs: 7000,
  });
  assert.equal(progress.remainingMs, 109000);
});

test("More time hides a finite deadline while extensions and replay update the estimate", () => {
  const atPractice = state(1, { stage: "practice", remainingMs: 1000 });
  const nearEnd = getLessonProgress({ ...options, stepIndex: 1, playback: atPractice });
  const held = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: { ...atPractice, hold: true },
    elapsedMs: 600000,
  });
  assert.equal(held.isHeld, true);
  assert.equal(held.estimateLabel, "More time · estimate paused");
  assert.equal(held.progressPercent, nearEnd.progressPercent);
  const extended = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: { ...atPractice, remainingMs: 31000 },
  });
  assert.equal(extended.remainingMs, nearEnd.remainingMs + 30000);
  const replay = getLessonProgress({ ...options, stepIndex: 1, playback: state(1) });
  assert.ok(replay.remainingMs > nearEnd.remainingMs);
});

test("colouring follows drawing, and final exploration has no quiet-time budget or deadline", () => {
  const colouring = getLessonProgress({
    ...options,
    stepIndex: 2,
    playback: state(2, { stage: "practice", remainingMs: 60000 }),
  });
  assert.equal(colouring.phaseLabel, "Colouring");
  assert.equal(colouring.segments[0].status, "complete");
  assert.equal(colouring.segments[0].progress, 1);
  assert.equal(colouring.remainingMs, 70000);
  const open = getLessonProgress({
    ...options,
    stepIndex: 3,
    playback: state(3, { stage: "practice", remainingMs: null, hold: true }),
    elapsedMs: 3600000,
  });
  assert.equal(open.remainingMs, 0);
  assert.equal(open.progressPercent, 100);
  assert.equal(open.isOpenTime, true);
  assert.equal(open.isHeld, false);
  assert.equal(open.estimateLabel, "Stay as long as you like");
  assert.equal(open.segments[2].progress, 1);
});

test("the final open-ended stage never presents a countdown before practice", () => {
  const cases = [
    { stage: "instruction", remainingMs: 10000, progressPercent: 93, open: false },
    { stage: "demonstration", remainingMs: 5000, progressPercent: 96, open: false },
    { stage: "practice", remainingMs: 0, progressPercent: 100, open: true },
  ];
  for (const expected of cases) {
    const timing = expected.stage === "demonstration"
      ? { ...state(3).timing, hasDemonstration: true, demoMs: 5000 }
      : state(3).timing;
    const playback = state(3, { stage: expected.stage, timing, hold: expected.open });
    const progress = getLessonProgress({ ...options, stepIndex: 3, playback });
    assert.equal(progress.estimateLabel, "Stay as long as you like", expected.stage);
    assert.equal(progress.remainingMs, expected.remainingMs, expected.stage);
    assert.equal(progress.progressPercent, expected.progressPercent, expected.stage);
    assert.equal(progress.isOpenTime, expected.open, expected.stage);

    const interrupted = getLessonProgress({
      ...options, stepIndex: 3, playback: { ...playback, interrupted: true },
    });
    assert.equal(interrupted.estimateLabel, "Paused · nothing moves ahead", expected.stage);
    assert.equal(interrupted.progressPercent, progress.progressPercent, expected.stage);
    if (!expected.open) {
      const held = getLessonProgress({
        ...options, stepIndex: 3, playback: { ...playback, hold: true },
      });
      assert.equal(held.estimateLabel, "More time · estimate paused", expected.stage);
      assert.equal(held.progressPercent, progress.progressPercent, expected.stage);
    }
  }
});

test("an open-ended stage followed by another stage keeps its existing estimate", () => {
  const followed = {
    ...lesson,
    steps: [...lesson.steps, { id: "next", kind: "draw", instruction: "One more line.", quietMs: 20000 }],
  };
  const progress = getLessonProgress({ ...options, lesson: followed, stepIndex: 3, playback: state(3) });
  assert.equal(progress.estimateLabel, "Less than a minute left");
});

test("speed, reduced motion, voice choice and board fallback change only estimated budgets", () => {
  const normal = getLessonProgress({ ...options, stepIndex: 0 });
  const slower = getLessonProgress({ ...options, stepIndex: 0, speed: "slower" });
  assert.ok(slower.remainingMs > normal.remainingMs);
  const still = getLessonProgress({ ...options, stepIndex: 0, still: true });
  assert.equal(normal.remainingMs - still.remainingMs, 5000);
  const noVoice = getLessonProgress({ ...options, stepIndex: 0, voiceOn: false });
  assert.equal(noVoice.remainingMs, normal.remainingMs - 8000);
  const fallback = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: state(1, {
      timing: { ...state(1).timing, hasDemonstration: false },
    }),
  });
  const regular = getLessonProgress({ ...options, stepIndex: 1, playback: state(1) });
  assert.equal(regular.remainingMs - fallback.remainingMs, 5000);
});

test("stale session identities do not leak a previous step's remaining time", () => {
  const fresh = getLessonProgress({ ...options, stepIndex: 2 });
  for (const playback of [
    state(1, { stage: "practice", remainingMs: 1 }),
    { ...state(2), lessonId: "another-cat", remainingMs: 1 },
  ]) {
    const progress = getLessonProgress({ ...options, stepIndex: 2, playback });
    assert.equal(progress.remainingMs, fresh.remainingMs);
  }
  const interrupted = getLessonProgress({
    ...options,
    stepIndex: 2,
    playback: state(2, { interrupted: true }),
  });
  assert.equal(interrupted.estimateLabel, "Paused · nothing moves ahead");
});

test("board-unavailable mode excludes all remaining demonstrations without changing quiet practice", () => {
  const normal = getLessonProgress({ ...options, stepIndex: 0 });
  const unavailable = getLessonProgress({
    ...options,
    stepIndex: 0,
    boardUnavailable: true,
  });
  assert.equal(normal.remainingMs - unavailable.remainingMs, 5000);
  const currentDraw = getLessonProgress({
    ...options,
    stepIndex: 1,
    playback: state(1, { stage: "demonstration" }),
    boardUnavailable: true,
  });
  assert.equal(currentDraw.remainingMs, 100000);
  const colouring = getLessonProgress({
    ...options,
    stepIndex: 2,
    playback: state(2, { stage: "practice", remainingMs: 45000 }),
    boardUnavailable: true,
  });
  assert.equal(colouring.remainingMs, 55000);
});

test("time labels are stable, friendly estimates without a per-second countdown", () => {
  assert.equal(formatTogetherTime(0), "0:00");
  assert.equal(formatTogetherTime(61999), "1:01");
  assert.equal(formatTogetherTime(3600000), "60:00");
  assert.equal(formatRemainingTime(0), "Less than a minute left");
  assert.equal(formatRemainingTime(59999), "Less than a minute left");
  assert.equal(formatRemainingTime(60000), "About 1 min left");
  assert.equal(formatRemainingTime(60001), "About 2 min left");
  for (const value of [-1, NaN, Infinity, "1000", null])
    assert.equal(formatTogetherTime(value), "0:00");
});

test("invalid lesson step inputs fail closed instead of inventing a timeline", () => {
  for (const stepIndex of [-1, 4, 1.5, NaN, "1"])
    assert.throws(() => getLessonProgress({ ...options, stepIndex }), TypeError);
  assert.throws(() => getLessonProgress({ lesson: { steps: [] }, stepIndex: 0 }), TypeError);
});

const clockIdentity = { session: 1, stepIndex: 1, run: 1, stage: "instruction" };
function syncClock(clock, overrides = {}) {
  return lessonClockReducer(clock, {
    type: "SYNC", ...clockIdentity, active: true, textOnly: false, ...overrides,
  });
}
function tickClock(clock, count, overrides = {}) {
  for (let index = 0; index < count; index++)
    clock = lessonClockReducer(clock, {
      type: "TICK", ...clockIdentity, deltaMs: 250, hidden: false, ...overrides,
    });
  return clock;
}

test("resumed voiced instruction resets only its estimate clock, retaining all active together-time", () => {
  let clock = syncClock(createLessonClock({ session: 1 }));
  clock = tickClock(clock, 12);
  assert.equal(clock.elapsedMs, 3000);
  assert.equal(clock.stageElapsedMs, 3000);
  clock = syncClock(clock, { active: false });
  assert.equal(tickClock(clock, 400), clock, "inactive time does not accrue");
  clock = syncClock(clock);
  assert.equal(clock.elapsedMs, 3000);
  assert.equal(clock.stageElapsedMs, 0, "resumed narration plays again from its beginning");
  clock = tickClock(clock, 4);
  assert.equal(clock.elapsedMs, 4000);
  assert.equal(clock.stageElapsedMs, 1000);
  const estimate = getLessonProgress({
    ...options, stepIndex: 1, playback: state(1), ...clock,
  });
  assert.equal(estimate.remainingMs, 114000);
});

test("paused text reading, demonstrations and practice retain their stage progress", () => {
  for (const configuration of [
    { stage: "instruction", textOnly: true },
    { stage: "demonstration", textOnly: false },
    { stage: "practice", textOnly: false },
  ]) {
    let clock = syncClock(createLessonClock({ session: 1 }), configuration);
    clock = tickClock(clock, 8, configuration);
    clock = syncClock(clock, { ...configuration, active: false });
    assert.equal(tickClock(clock, 100, configuration), clock);
    clock = syncClock(clock, configuration);
    assert.equal(clock.stageElapsedMs, 2000);
    assert.equal(clock.elapsedMs, 2000);
  }
});

test("hidden time, stalls and stale timer identities cannot move either clock", () => {
  const clock = tickClock(syncClock(createLessonClock({ session: 1 })), 4);
  for (const overrides of [
    { hidden: true }, { deltaMs: 2001 }, { deltaMs: -1 },
    { deltaMs: NaN }, { deltaMs: Infinity }, { deltaMs: "250" },
    { session: 2 }, { stepIndex: 2 }, { run: 2 }, { stage: "practice" },
  ])
    assert.equal(tickClock(clock, 1, overrides), clock);
  const delayed = tickClock(clock, 1, { deltaMs: 1900 });
  assert.equal(delayed.elapsedMs, clock.elapsedMs + 250);
  assert.equal(delayed.stageElapsedMs, clock.stageElapsedMs + 250);
});

test("new stages and replay reset stage time; only a new family session resets together-time", () => {
  const clock = tickClock(syncClock(createLessonClock({ session: 1 })), 8);
  for (const overrides of [{ stepIndex: 2 }, { run: 2 }, { stage: "demonstration" }]) {
    const next = syncClock(clock, overrides);
    assert.equal(next.elapsedMs, 2000);
    assert.equal(next.stageElapsedMs, 0);
  }
  const fresh = syncClock(clock, { session: 2 });
  assert.equal(fresh.elapsedMs, 0);
  assert.equal(fresh.stageElapsedMs, 0);
  assert.equal(syncClock(clock), clock, "unchanged render synchronization is stable");
});
