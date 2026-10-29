import { getStepTiming } from "./scripted-session.js";
export { createLessonClock, lessonClockReducer } from "./core/lesson-clock.ts";

const PHASES = Object.freeze([
  Object.freeze({ key: "drawing", label: "Drawing" }),
  Object.freeze({ key: "colouring", label: "Colouring" }),
  Object.freeze({ key: "own-time", label: "Your own time" }),
]);

function finiteMs(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, value)
    : 0;
}

function addMs(left, right) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function clampFraction(value) {
  return Math.max(0, Math.min(1, value));
}

function phaseFor(step) {
  if (step.kind === "explore") return "own-time";
  return ["colour", "color", "colouring"].includes(step.kind)
    ? "colouring"
    : "drawing";
}

function timingBudget(timing) {
  return {
    instructionMs: finiteMs(timing.instructionMs),
    demoMs: timing.hasDemonstration ? finiteMs(timing.demoMs) : 0,
    parallelTeaching: timing.hasDemonstration && timing.parallelTeaching === true,
    quietMs: timing.holdOpen ? 0 : finiteMs(timing.quietMs),
    holdOpen: timing.holdOpen === true,
  };
}

function totalBudget(timing) {
  const teachingMs = timing.parallelTeaching
    ? Math.max(timing.instructionMs, timing.demoMs)
    : addMs(timing.instructionMs, timing.demoMs);
  return addMs(teachingMs, timing.quietMs);
}

function currentRemaining(timing, state, stageElapsedMs) {
  const afterInstruction = addMs(timing.demoMs, timing.quietMs);
  switch (state?.stage) {
    case "ready":
      return 0;
    case "practice":
      return timing.holdOpen
        ? 0
        : finiteMs(state.remainingMs ?? timing.quietMs);
    case "demonstration":
      return addMs(
        Math.max(0, timing.demoMs - (timing.parallelTeaching ? finiteMs(state.demonstrationElapsedMs) : stageElapsedMs)),
        timing.quietMs,
      );
    default: {
      const instructionRemaining = state?.textOnly
        ? finiteMs(state.remainingMs ?? timing.instructionMs)
        : Math.max(0, timing.instructionMs - stageElapsedMs);
      if (timing.parallelTeaching) {
        const demonstrationRemaining = state?.demonstrationDone ? 0 : Math.max(0, timing.demoMs - finiteMs(state?.demonstrationElapsedMs ?? stageElapsedMs));
        return addMs(Math.max(instructionRemaining, demonstrationRemaining), timing.quietMs);
      }
      return addMs(instructionRemaining, afterInstruction);
    }
  }
}

export function formatTogetherTime(elapsedMs) {
  const seconds = Math.floor(finiteMs(elapsedMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatRemainingTime(remainingMs) {
  if (finiteMs(remainingMs) < 60000) return "Less than a minute left";
  return `About ${Math.ceil(remainingMs / 60000)} min left`;
}

// This describes the authored plan; it never advances the lesson or treats its
// estimate as a deadline. App supplies an active clock, so paused/hidden time is
// not inferred here from wall time or from completed steps' original budgets.
export function getLessonProgress({
  lesson,
  stepIndex,
  playback,
  elapsedMs = 0,
  stageElapsedMs = 0,
  speed = "slow",
  still = false,
  voiceOn = true,
  boardUnavailable = false,
  narrationDurations = {},
}) {
  if (
    !lesson?.steps?.length ||
    !Number.isInteger(stepIndex) ||
    !lesson.steps[stepIndex]
  )
    throw new TypeError("A known authored lesson step is required.");

  const candidate = playback?.state ?? playback;
  const state =
    candidate?.lessonId === lesson.id && candidate.stepIndex === stepIndex
      ? candidate
      : null;
  const timings = lesson.steps.map((step, index) => {
    const authoredTiming = getStepTiming(lesson, index, {
      speed,
      still,
      voiceDurationMs: voiceOn
        ? finiteMs(narrationDurations[`${lesson.id}/${step.id}/instruction`])
        : 0,
    });
    const timing =
      index === stepIndex && state?.timing ? state.timing : authoredTiming;
    return timingBudget(
      boardUnavailable ? { ...timing, hasDemonstration: false } : timing,
    );
  });
  const current = timings[stepIndex];
  const remainingHere = currentRemaining(
    current,
    state,
    finiteMs(stageElapsedMs),
  );
  const remainingMs = timings.slice(stepIndex + 1).reduce(
    (sum, timing) => addMs(sum, totalBudget(timing)),
    remainingHere,
  );
  const phaseKey = phaseFor(lesson.steps[stepIndex]);
  const isOpenTime = current.holdOpen && state?.stage === "practice";
  const isHeld = state?.hold === true && !isOpenTime;
  const isInterrupted = state?.interrupted === true;
  const totals = Object.fromEntries(PHASES.map(({ key }) => [key, 0]));
  const completed = { ...totals };
  for (let index = 0; index < timings.length; index++) {
    const key = phaseFor(lesson.steps[index]);
    const budget = totalBudget(timings[index]);
    totals[key] = addMs(totals[key], budget);
    if (index < stepIndex) completed[key] = addMs(completed[key], budget);
    if (index === stepIndex)
      completed[key] = addMs(
        completed[key],
        Math.max(0, budget - Math.min(budget, remainingHere)),
      );
  }
  const allBudgets = Object.values(totals).reduce(addMs, 0);
  const allCompleted = Object.values(completed).reduce(addMs, 0);
  const activePhase = PHASES.findIndex(({ key }) => key === phaseKey);
  const segments = PHASES.map((phase, index) => ({
    ...phase,
    status:
      index < activePhase ? "complete" : index === activePhase ? "current" : "next",
    progress:
      index < activePhase || (phase.key === "own-time" && isOpenTime)
        ? 1
        : totals[phase.key]
          ? clampFraction(completed[phase.key] / totals[phase.key])
          : 0,
  }));
  const finalOpenStage = current.holdOpen && stepIndex === lesson.steps.length - 1;
  const estimateLabel = isInterrupted
    ? "Paused · nothing moves ahead"
    : isHeld
      ? "More time · estimate paused"
      : isOpenTime || finalOpenStage
        ? "Stay as long as you like"
        : formatRemainingTime(remainingMs);

  return {
    elapsedMs: finiteMs(elapsedMs),
    remainingMs,
    phaseKey,
    phaseLabel: PHASES[activePhase].label,
    isOpenTime,
    isHeld,
    isInterrupted,
    estimateLabel,
    progressPercent: isOpenTime
      ? 100
      : Math.round(clampFraction(allCompleted / (allBudgets || 1)) * 100),
    segments,
  };
}
