import type { AuthoredStep, LevelId, NarrationData, Speed, TimingLesson } from "../core/contracts.ts";

/** Fields used by the family interface; authored data is verified by the build. */
export interface LessonView extends TimingLesson {
  readonly title: string;
  readonly invitation: string;
  readonly parentNote: string;
  readonly simplify?: string;
  readonly teachingPack?: { readonly version: number; readonly lessonId: string };
  readonly pilot?: boolean;
  readonly musicId?: string;
  readonly colouringLabel?: string;
  readonly viewFrame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly steps: readonly (AuthoredStep & { readonly canSkip?: boolean })[];
  readonly strokes: readonly { readonly id: string; readonly step: number; readonly durationMs: number }[];
}

export interface LevelView {
  readonly id: LevelId;
  readonly name: string;
  readonly short: string;
  readonly description: string;
  readonly image: string;
}

export interface LanguageView {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly flag: string;
  readonly ready: boolean;
}

export interface InitialSelection {
  readonly languageId: string;
  readonly level: LevelId;
  readonly localizeLesson: (lesson: LessonView, locale: string) => LessonView;
  readonly localizedTitle: (lesson: LessonView, locale: string) => string | null;
  readonly narration: NarrationData | null;
}

/** The SDK renderer reports media progress; it cannot issue lesson commands. */
export interface DemonstrationBoardProps {
  readonly lesson: LessonView;
  readonly stepIndex?: number;
  readonly replayKey?: number;
  readonly paused?: boolean;
  readonly speed?: Speed;
  readonly still?: boolean;
  readonly onPlayingChange?: (playing: boolean) => void;
  readonly onReady?: () => void;
  readonly onComplete?: (stepIndex: number, run: number) => void;
}
