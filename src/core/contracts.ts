/** Public, browser-independent lesson vocabulary. No child or account data. */
export type LevelId = "basic" | "intermediate" | "expert";
export type LessonPhase = "home" | "catalogue" | "gate" | "drawing" | "paused" | "finished";
export type StepKind = "prepare" | "observe" | "draw" | "colour" | "explore";
export type Speed = "slow" | "slower" | "normal";

export interface LessonState {
  readonly phase: LessonPhase;
  readonly level: LevelId;
  readonly lessonId: string | null;
  readonly step: number;
}

export type LessonCommand =
  | { readonly type: "OPEN_CATALOGUE"; readonly level: LevelId }
  | { readonly type: "SELECT_LESSON"; readonly lessonId: string }
  | { readonly type: "START" | "RESUME"; readonly supervised: boolean }
  | { readonly type: "NEXT" | "BACK" | "PAUSE" | "FINISH" | "KEEP_DRAWING" | "RESTART" | "RESET" };

export interface AuthoredStep {
  readonly id: string;
  readonly kind: StepKind;
  readonly title: string;
  readonly instruction: string;
  readonly spoken: string;
  readonly hint: string;
  readonly notice: string;
  readonly quietMs?: number;
  readonly stroke?: { readonly durationMs: number };
}

export interface TimingLesson {
  readonly id: string;
  readonly level: LevelId;
  readonly steps: readonly AuthoredStep[];
  readonly concurrentTeaching?: boolean;
  readonly strokes?: readonly { readonly step: number; readonly durationMs: number }[];
  readonly appearance?: {
    readonly colourPhases: Readonly<Record<string, { readonly durationMs?: number }>>;
  };
}

export interface StepTiming {
  readonly instructionMs: number;
  readonly demoMs: number;
  readonly quietMs: number;
  readonly hasDemonstration: boolean;
  readonly parallelTeaching: boolean;
  readonly holdOpen: boolean;
}

export interface TimingOptions {
  readonly speed?: Speed;
  readonly still?: boolean;
  readonly voiceDurationMs?: number;
}

export type PlaybackStage = "instruction" | "demonstration" | "practice" | "ready";
export interface ScriptedSession {
  readonly lessonId: string;
  readonly stepIndex: number;
  readonly run: number;
  readonly stage: PlaybackStage;
  readonly remainingMs: number | null;
  readonly timing: StepTiming;
  readonly textOnly: boolean;
  readonly hold: boolean;
  readonly interrupted: boolean;
  readonly demonstrationDone: boolean;
  readonly demonstrationElapsedMs: number;
}

export type PlaybackCommand = {
  readonly lessonId: string;
  readonly stepIndex: number;
  readonly run: number;
} & (
  | { readonly type: "VOICE_DONE" | "DEMO_DONE" | "HOLD" | "CONTINUE" | "EXTEND" | "REPLAY" }
  | { readonly type: "TICK"; readonly elapsedMs: number; readonly active?: boolean }
);
