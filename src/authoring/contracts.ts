import type { AuthoredStep, TimingLesson } from "../core/contracts.ts";
import type { AuthoredStroke, CrayonAppearance, CrayonPath, DrawingPoint } from "../drawing/contracts.ts";

/** Reviewed authoring data, shared by compilation, the family UI and rehearsals. */
export interface DrawingFrame { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface LessonStep extends AuthoredStep {
  readonly canSkip: boolean;
  readonly stroke?: AuthoredStroke;
}
export type TeachingPhaseId = "observe" | "draw" | "colour" | "explore";
export interface TeachingPhase { readonly id: TeachingPhaseId; readonly label: string }
export interface TeachingText {
  readonly title?: string;
  readonly instruction: string;
  readonly spoken: string;
  readonly hint: string;
  readonly notice?: string;
  readonly canSkip?: boolean;
}
export interface PracticeTeaching extends TeachingText { readonly quietMs: number }
export interface NamedPracticeTeaching extends PracticeTeaching { readonly id: string }
export interface ExplorationTeaching extends TeachingText {
  readonly id: string;
  /** Legacy pack helpers may include this; exploration always compiles without a timer. */
  readonly quietMs?: number;
}
export interface TeachingPack {
  readonly version: 1;
  readonly lessonId: string;
  readonly story: Readonly<Record<string, string>> & { readonly thread: string };
  readonly musicId: string | null;
  readonly colouringLabel: string;
  readonly colourNotice?: string;
  readonly observe: NamedPracticeTeaching;
  readonly draw: Readonly<Record<string, PracticeTeaching>>;
  readonly colourSteps: readonly NamedPracticeTeaching[];
  readonly explore: ExplorationTeaching;
  readonly phases: readonly TeachingPhase[];
}
export interface AuthoredLesson extends TimingLesson {
  readonly title: string;
  readonly invitation: string;
  readonly objective: string;
  readonly parentNote: string;
  readonly simplify: string;
  readonly transfer: string;
  readonly frame: DrawingFrame;
  readonly viewFrame: DrawingFrame;
  readonly strokes: readonly AuthoredStroke[];
  readonly steps: readonly LessonStep[];
  readonly teachingPack?: { readonly version: 1; readonly lessonId: string; readonly story: Readonly<Record<string, string>> };
  readonly pilot?: boolean;
  readonly preparationCompletedBeforeStart?: boolean;
  readonly musicId?: string | null;
  readonly colouringLabel?: string;
  readonly pilotPhases?: readonly TeachingPhase[];
  readonly appearance?: CrayonAppearance;
}
export interface TeachingRegistration {
  readonly id: string;
  readonly pack: TeachingPack;
  readonly appearance: CrayonAppearance;
}
export interface RegionPatchOptions {
  readonly id: string;
  readonly boundary: readonly DrawingPoint[];
  readonly colour: string;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly angle?: number;
  readonly width?: number;
  readonly strands?: number;
  readonly passes?: number;
}
export interface RegionPatch {
  readonly gestures: readonly CrayonPath[];
  readonly regions: readonly ColourRegion[];
}
export interface ColourRegion { readonly gestureId: string; readonly boundary: readonly DrawingPoint[] }
export type ColourRegions = Readonly<Record<string, readonly ColourRegion[]>>;
export interface AuthoredArt { readonly appearance: CrayonAppearance; readonly regions: ColourRegions }
