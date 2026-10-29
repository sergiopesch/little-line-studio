import type { TimingLesson } from "./core/contracts.ts";

export function clampStageIndex(lesson: Pick<TimingLesson, "steps">, stepIndex: number) {
  return Number.isInteger(stepIndex)
    ? Math.max(0, Math.min(lesson.steps.length - 1, stepIndex))
    : 0;
}

// Shared by the trusted controller, time estimate and native SDK renderer. A
// colouring demonstration has the same completion gate as an authored mark.
export function getDemonstrationForStep(lesson: TimingLesson, stepIndex: number): { kind: "draw" | "colour"; durationMs: number } | undefined {
  const step = clampStageIndex(lesson, stepIndex);
  const current = lesson.steps[step];
  if (!current) throw new TypeError("A demonstration needs an authored lesson step.");
  const stroke =
    current.stroke ??
    lesson.strokes?.find((entry) => entry.step === step);
  if (current.kind === "draw" && stroke)
    return { kind: "draw", durationMs: stroke.durationMs };
  const durationMs = current.kind === "colour"
    ? lesson.appearance?.colourPhases[current.id]?.durationMs
    : undefined;
  return durationMs ? { kind: "colour", durationMs } : undefined;
}

// Observation and exploration show the actual full reference. During drawing,
// only earlier marks and the current partial mark are visible.
export function demonstrationState(lesson: Pick<TimingLesson, "steps"> & { readonly strokes: readonly { readonly step: number }[] }, stepIndex: number, currentProgress = 0) {
  const step = clampStageIndex(lesson, stepIndex);
  const current = lesson.steps[step];
  if (!current) throw new TypeError("A demonstration needs an authored lesson step.");
  const kind = current.kind;
  const reference = ["observe", "colour", "explore"].includes(kind);
  const progress = Number.isFinite(currentProgress)
    ? Math.max(0, Math.min(1, currentProgress))
    : 0;
  return lesson.strokes.map((stroke) => ({
    visible: reference || (kind === "draw" && stroke.step <= step),
    progress:
      reference || stroke.step < step ? 1 : stroke.step === step ? progress : 0,
    current: kind === "draw" && stroke.step === step,
  }));
}

export function advanceProgress(
  progress: number,
  elapsedMs: number,
  durationMs: number,
  paused = false,
) {
  if (paused) return progress;
  return Math.min(
    1,
    progress + Math.max(0, Math.min(elapsedMs, 100)) / durationMs,
  );
}
