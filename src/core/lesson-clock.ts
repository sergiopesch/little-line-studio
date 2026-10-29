import { MAX_ACTIVE_TICK_MS, UNEXPECTED_DELAY_MS } from "./scripted-session.ts";
import type { PlaybackStage } from "./contracts.ts";

interface ClockIdentity {
  readonly session: number | undefined;
  readonly stepIndex: number | null;
  readonly run: number | null;
  readonly stage: PlaybackStage | null;
}
export interface LessonClock extends ClockIdentity {
  readonly active: boolean;
  readonly textOnly: boolean;
  readonly elapsedMs: number;
  readonly stageElapsedMs: number;
}
export type ClockCommand = ClockIdentity & (
  | { readonly type: "SYNC"; readonly active: boolean; readonly textOnly: boolean }
  | { readonly type: "TICK"; readonly deltaMs: number; readonly hidden: boolean }
);

function addMs(left: number, right: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function clockMatches(clock: LessonClock, event: ClockIdentity) {
  return (
    clock.session === event.session &&
    clock.stepIndex === event.stepIndex &&
    clock.run === event.run &&
    clock.stage === event.stage
  );
}

export function createLessonClock({ session }: { session?: number } = {}): LessonClock {
  return {
    session,
    stepIndex: null,
    run: null,
    stage: null,
    active: false,
    textOnly: false,
    elapsedMs: 0,
    stageElapsedMs: 0,
  };
}

// The actual narration restarts after interruption; a paused demonstration and
// text-only reading resume their existing progress instead. Together-time keeps
// both attempts, while a fresh voiced attempt receives its full estimate again.
export function lessonClockReducer(clock: LessonClock, event: ClockCommand): LessonClock {
  if (event.type === "SYNC") {
    const matches = clockMatches(clock, event);
    const active = event.active === true;
    const textOnly = event.textOnly === true;
    const restartedVoice =
      matches &&
      !clock.active &&
      active &&
      event.stage === "instruction" &&
      !textOnly;
    const elapsedMs = clock.session === event.session ? clock.elapsedMs : 0;
    const stageElapsedMs = matches && !restartedVoice ? clock.stageElapsedMs : 0;
    if (
      matches &&
      clock.active === active &&
      clock.textOnly === textOnly &&
      clock.elapsedMs === elapsedMs &&
      clock.stageElapsedMs === stageElapsedMs
    )
      return clock;
    return {
      session: event.session,
      stepIndex: event.stepIndex,
      run: event.run,
      stage: event.stage,
      active,
      textOnly,
      elapsedMs,
      stageElapsedMs,
    };
  }
  if (
    event.type !== "TICK" ||
    !clockMatches(clock, event) ||
    !clock.active ||
    event.hidden === true ||
    typeof event.deltaMs !== "number" ||
    !Number.isFinite(event.deltaMs) ||
    event.deltaMs <= 0 ||
    event.deltaMs > UNEXPECTED_DELAY_MS
  )
    return clock;
  const amount = Math.min(event.deltaMs, MAX_ACTIVE_TICK_MS);
  return {
    ...clock,
    elapsedMs: addMs(clock.elapsedMs, amount),
    stageElapsedMs: addMs(clock.stageElapsedMs, amount),
  };
}
