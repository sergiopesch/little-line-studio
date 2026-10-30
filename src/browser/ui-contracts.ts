import type { AuthoredLesson } from "../authoring/contracts.ts";
import type { LevelId, NarrationData, Speed } from "../core/contracts.ts";

/** The family interface consumes the compiled authoring contract. */
export type LessonView = AuthoredLesson;

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
