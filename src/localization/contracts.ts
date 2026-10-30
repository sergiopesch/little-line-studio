import type { AuthoredLesson, LessonStep, TeachingPhase } from "../authoring/contracts.ts";
import type { NarrationData } from "../core/contracts.ts";

export type CatalogueReviewStatus = "assistant-draft-awaiting-native-human-review" | "assistant-reviewed-awaiting-native-human-review";
export type LocalizedStepText = Pick<LessonStep, "title" | "instruction" | "spoken" | "hint" | "notice">;
export type LocalizedLessonText = Required<Pick<AuthoredLesson,
  "title" | "invitation" | "objective" | "parentNote" | "simplify" | "transfer" | "colouringLabel"
>> & {
  readonly steps: Readonly<Record<string, LocalizedStepText>>;
  readonly pilotPhases: readonly TeachingPhase[];
};
export interface LocalizedCatalogue {
  readonly locale: string;
  readonly reviewStatus: CatalogueReviewStatus;
  readonly lessons: Readonly<Record<string, LocalizedLessonText>>;
}
export interface LanguageText {
  readonly localizeLesson: (lesson: AuthoredLesson, languageId: string, translations?: unknown) => AuthoredLesson;
  readonly localizedLessonTitle: (lesson: Pick<AuthoredLesson, "id" | "title"> | null | undefined, languageId: string) => string | null;
}
export interface DynamicCopy {
  readonly documentTitle: string;
  readonly errorTitle: string;
  readonly errorBody: string;
  readonly errorReload: string;
  readonly levelExplore: (level: string, count: number) => string;
  readonly catalogueRange: (level: string, first: number, last: number, total: number) => string;
  readonly drawTitle: (title: string) => string;
  readonly pageCount: (page: number, total: number) => string;
  readonly duration: (minutes: number) => string;
  readonly remaining: (minutes: number) => string;
  readonly together: (elapsed: string) => string;
  readonly preview: (title: string) => string;
  readonly boardBlank: string;
  readonly boardColour: (title: string) => string;
  readonly boardReference: (title: string) => string;
  readonly boardAction: (title: string, action: number) => string;
  readonly stepObserve: string;
  readonly stepColour: (index: number, total: number) => string;
  readonly stepExplore: string;
  readonly stepDrawing: (index: number, total: number) => string;
  readonly stepPrepare: string;
  readonly stepGeneric: (index: number, total: number) => string;
}
export interface TimelineEstimate { readonly estimateLabel: string; readonly remainingMs: number }
export interface DynamicLocale {
  readonly copy: DynamicCopy;
  readonly stage: (lesson: AuthoredLesson, stepIndex: number) => string;
  readonly board: (lesson: AuthoredLesson, stepIndex: number) => string;
  readonly estimate: (progress: TimelineEstimate, translate: (text: string) => string) => string;
}
export interface LocaleRegistration {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly flag: string;
  readonly textLocale: string;
  readonly voiceId: string;
  readonly sampleFile: string;
  readonly ui: Readonly<Record<string, string>> | null;
  readonly dynamic: DynamicLocale | null;
  readonly availability: { readonly locale: string; readonly lessons: readonly string[] } | null;
  readonly loadText: () => Promise<LanguageText>;
  readonly loadNarration: () => Promise<NarrationData>;
}
export interface RegisteredLocale extends LocaleRegistration { readonly assetSuffix: string }
