import { NARRATION_PLAYBACK_RATE } from "./narration-policy.js";
import { getDemonstrationForStep } from "./demonstration-state.js";

// Pacing values are product design hypotheses, not established learning optima.
// Actual media completion gates teaching; these budgets only guide quiet practice.
export const MAX_ACTIVE_TICK_MS = 250;
export const UNEXPECTED_DELAY_MS = 2000;
export const MORE_TIME_MS = 30000;

const QUIET_WINDOWS = Object.freeze({
  basic: Object.freeze({ prepare: 10000, observe: 4000, draw: 12000 }),
  intermediate: Object.freeze({ prepare: 10000, observe: 5000, draw: 18000 }),
  expert: Object.freeze({ prepare: 10000, observe: 6000, draw: 24000 }),
});
const SPEED_MULTIPLIERS = Object.freeze({ slow: 1, slower: 1.5, normal: 0.75 });

function milliseconds(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(value))
    : fallback;
}

function sumMs(left, right) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

export function getStepTiming(
  lesson,
  stepIndex,
  { speed = "slow", still = false, voiceDurationMs = 0 } = {},
) {
  const step = Number.isInteger(stepIndex) && lesson?.steps?.[stepIndex];
  if (!step) throw new TypeError("A known authored lesson step is required.");
  const multiplier = SPEED_MULTIPLIERS[speed] ?? 1;
  const windows = QUIET_WINDOWS[lesson.level] ?? QUIET_WINDOWS.basic;
  const countWords = (text) => text.trim().split(/\s+/).filter(Boolean).length;
  // In written-only mode allow time for both the visible title and instruction,
  // even if the prepared spoken version is shorter.
  const words = Math.max(
    countWords(step.spoken || ""),
    countWords(`${step.title || ""} ${step.instruction || ""}`),
  );
  const readingMs = Math.max(8000, Math.ceil((words / 1.5) * 1000) + 1500);
  const duration = milliseconds(voiceDurationMs / NARRATION_PLAYBACK_RATE);
  const demonstration = getDemonstrationForStep(lesson, stepIndex);
  const hasDemonstration = Boolean(demonstration);
  const authoredDemoMs = hasDemonstration ? milliseconds(demonstration.durationMs) : 0;
  const complexityTime =
    step.kind === "draw" ? Math.max(0, authoredDemoMs - 8000) * 2 : 0;
  const quietMs = milliseconds(
    milliseconds(
      step.quietMs,
      (windows[step.kind] ?? windows.draw) + complexityTime,
    ) * multiplier,
  );
  return Object.freeze({
    instructionMs: duration || readingMs,
    demoMs: still ? 0 : milliseconds(authoredDemoMs * multiplier),
    quietMs,
    hasDemonstration,
    parallelTeaching: lesson.concurrentTeaching === true && hasDemonstration,
    holdOpen: step.kind === "explore",
  });
}

// Build tools can derive a small runtime index without importing transcripts here.
// Manifest durations are seconds; every value returned by this helper is milliseconds.
export function narrationDurationIndex(manifest) {
  return Object.fromEntries(
    Object.entries(manifest?.clips ?? {})
      .filter(
        ([, clip]) =>
          typeof clip?.duration === "number" &&
          clip.duration > 0 &&
          Number.isFinite(clip.duration),
      )
      .map(([key, clip]) => [key, milliseconds(clip.duration * 1000)]),
  );
}

// Excludes open exploration, pauses, extra time and replays. It is an estimate,
// not a deadline; measured clip durations improve it when a compact index exists.
export function estimateLessonDurationMs(
  lesson,
  { narrationDurations = {}, ...options } = {},
) {
  return lesson.steps.reduce((total, step, index) => {
    const timing = getStepTiming(lesson, index, {
      ...options,
      voiceDurationMs:
        narrationDurations[`${lesson.id}/${step.id}/instruction`] ?? 0,
    });
    return sumMs(
      total,
      sumMs(
        timing.parallelTeaching ? Math.max(timing.instructionMs, timing.demoMs) : sumMs(timing.instructionMs, timing.demoMs),
        timing.holdOpen ? 0 : timing.quietMs,
      ),
    );
  }, 0);
}

export function createScriptedSession({
  lessonId,
  stepIndex,
  run = 0,
  timing,
  textOnly = false,
}) {
  if (
    typeof lessonId !== "string" ||
    !lessonId ||
    !Number.isSafeInteger(stepIndex) ||
    stepIndex < 0 ||
    !Number.isSafeInteger(run) ||
    run < 0 ||
    !timing
  )
    throw new TypeError(
      "A lesson, step, run and authored timing are required.",
    );
  const budget = Object.freeze({
    instructionMs: milliseconds(timing.instructionMs),
    demoMs: milliseconds(timing.demoMs),
    quietMs: milliseconds(timing.quietMs),
    hasDemonstration: timing.hasDemonstration === true,
    parallelTeaching: timing.parallelTeaching === true && timing.hasDemonstration === true,
    holdOpen: timing.holdOpen === true,
  });
  return {
    lessonId,
    stepIndex,
    run,
    stage: "instruction",
    remainingMs: budget.instructionMs,
    timing: budget,
    textOnly: textOnly === true,
    hold: false,
    interrupted: false,
    demonstrationDone: false,
    demonstrationElapsedMs: 0,
  };
}

function matches(state, event) {
  return (
    event?.lessonId === state.lessonId &&
    event.stepIndex === state.stepIndex &&
    event.run === state.run
  );
}

function practice(state) {
  return {
    ...state,
    stage: "practice",
    remainingMs: state.timing.holdOpen ? null : state.timing.quietMs,
  };
}

function afterInstruction(state) {
  return state.timing.hasDemonstration && !state.demonstrationDone
    ? { ...state, stage: "demonstration", remainingMs: null }
    : practice(state);
}

// Effects belong to App. In particular, no media callback changes lesson selection,
// settings or permissions. App may advance one step only after matching stage=ready.
export function scriptedSessionReducer(state, event) {
  if (!matches(state, event)) return state;
  if (event.type === "REPLAY") {
    return {
      ...createScriptedSession({ ...state, run: state.run + 1 }),
      hold: state.hold,
    };
  }
  if (state.interrupted) return state;
  switch (event.type) {
    case "VOICE_DONE":
      return state.stage === "instruction" ? afterInstruction(state) : state;
    case "DEMO_DONE":
      if (state.stage === "instruction" && state.timing.parallelTeaching && !state.demonstrationDone)
        return { ...state, demonstrationDone: true, demonstrationElapsedMs: state.timing.demoMs };
      return state.stage === "demonstration"
        ? practice({ ...state, demonstrationDone: true, demonstrationElapsedMs: state.timing.demoMs })
        : state;
    case "HOLD":
      return state.hold
        ? state
        : {
            ...state,
            hold: true,
            ...(state.stage === "ready"
              ? { stage: "practice", remainingMs: state.timing.quietMs }
              : {}),
          };
    case "CONTINUE":
      return state.hold
        ? {
            ...state,
            hold: false,
            ...(state.stage === "practice"
              ? {
                  remainingMs: state.timing.holdOpen
                    ? null
                    : state.timing.quietMs,
                }
              : {}),
          }
        : state;
    case "EXTEND":
      if (state.timing.holdOpen || !["practice", "ready"].includes(state.stage))
        return state;
      return {
        ...state,
        stage: "practice",
        remainingMs: sumMs(state.remainingMs, MORE_TIME_MS),
      };
    case "TICK": {
      if (event.active === false || state.stage === "ready") return state;
      if (
        typeof event.elapsedMs !== "number" ||
        !Number.isFinite(event.elapsedMs) ||
        event.elapsedMs <= 0
      )
        return state;
      if (event.elapsedMs > UNEXPECTED_DELAY_MS)
        return { ...state, interrupted: true };
      const amount = Math.min(event.elapsedMs, MAX_ACTIVE_TICK_MS);
      if (state.timing.parallelTeaching && !state.demonstrationDone && ["instruction", "demonstration"].includes(state.stage)) {
        state = { ...state, demonstrationElapsedMs: Math.min(state.timing.demoMs, state.demonstrationElapsedMs + amount) };
      }
      if (state.stage === "instruction" && state.textOnly) {
        const remainingMs = Math.max(0, state.remainingMs - amount);
        const next = { ...state, remainingMs };
        return remainingMs === 0 ? afterInstruction(next) : next;
      }
      if (state.stage !== "practice" || state.hold || state.timing.holdOpen)
        return state;
      const remainingMs = Math.max(0, state.remainingMs - amount);
      return {
        ...state,
        remainingMs,
        stage: remainingMs === 0 ? "ready" : "practice",
      };
    }
    default:
      return state;
  }
}
