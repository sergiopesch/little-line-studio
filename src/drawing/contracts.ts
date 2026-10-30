import type { TLDefaultColorStyle } from "@tldraw/tlschema";

/** Authored teaching geometry only; never captured child artwork. */
export interface DrawingPoint { readonly x: number; readonly y: number; readonly z?: number }
export interface PressurePoint extends DrawingPoint { readonly z: number }
export type Coordinate = readonly [number, number];
export type QuadraticCurve = readonly [Coordinate, Coordinate, Coordinate];
export interface AuthoredMark {
  readonly id: string;
  readonly points: readonly DrawingPoint[];
  readonly parts?: readonly (readonly DrawingPoint[])[];
  readonly durationMs: number;
  readonly closed: boolean;
}
export interface AuthoredStroke extends AuthoredMark { readonly step: number }
export interface OutlineMark extends Omit<AuthoredStroke, "parts"> {
  readonly sourceId: string;
  readonly sourceIndex: number;
  readonly startMs: number;
  readonly endMs: number;
}
export interface MarkState {
  readonly visible: boolean;
  readonly current: boolean;
  readonly progress: number;
}
export interface ColourState extends MarkState { readonly opacity: number }
export interface CrayonColour { readonly sdkColor: TLDefaultColorStyle; readonly ink: string; readonly grain: string }
export interface OutlineStyle {
  readonly color?: TLDefaultColorStyle;
  readonly fill?: "none" | "fill";
  readonly dash?: "draw" | "solid";
  readonly size?: "s" | "m" | "l" | "xl";
  readonly ink?: string;
  readonly width?: number;
  readonly grainVariant?: number;
}
export type ResolvedOutlineStyle = OutlineStyle & Required<Pick<OutlineStyle, "color" | "fill" | "dash" | "size">>;
export interface CrayonPath {
  readonly id: string;
  readonly points: readonly PressurePoint[];
  readonly colour: string;
  readonly width: number;
  readonly opacity: number;
  readonly strands: number;
  readonly seed: number;
}
export type CrayonGestureOptions = Partial<Pick<CrayonPath, "width" | "opacity" | "strands">>;
export interface CrayonGesture extends CrayonPath {
  readonly drawMs: number;
  readonly liftMs: number;
  readonly startMs: number;
  readonly endMs: number;
}
export interface CrayonPhase { readonly durationMs: number; readonly gestures: readonly CrayonGesture[] }
export interface CrayonAppearance {
  readonly version: 1;
  readonly medium: "crayon";
  readonly palette: Readonly<Record<string, CrayonColour>>;
  readonly outlineStyles: Readonly<Record<string, OutlineStyle>>;
  readonly colourPhases: Readonly<Record<string, CrayonPhase>>;
}
export interface ColourMark extends ResolvedOutlineStyle {
  readonly id: string;
  readonly phaseId: string;
  readonly gestureId: string;
  readonly points: readonly PressurePoint[];
  readonly ink: string;
  readonly grainVariant: number;
  readonly width: number;
  readonly closed: boolean;
  readonly isPen: boolean;
  readonly opacity: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly phaseDurationMs: number;
}
export interface AppearanceLesson { readonly appearance?: CrayonAppearance }
