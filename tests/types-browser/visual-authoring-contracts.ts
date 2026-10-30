import { CAT_APPEARANCE } from "../../src/cat-appearance.js";
import { SUN_APPEARANCE } from "../../src/sun-appearance.js";
import { RAINBOW_APPEARANCE, rainbowArch } from "../../src/rainbow-appearance.js";
import { BALLOON_APPEARANCE, BALLOON_BODY, BALLOON_COLOUR_REGIONS } from "../../src/balloon-appearance.js";
import { BASIC_COMPLETE_ART, BASIC_COMPLETE_GEOMETRY } from "../../src/basic-complete-appearance.js";
import { INTERMEDIATE_COMPLETE_APPEARANCES } from "../../src/intermediate-complete-appearance.js";
import { EXPERT_COMPLETE_APPEARANCES } from "../../src/expert-complete-appearance.js";
import type { AuthoredArt, ColourRegions } from "../../src/authoring/contracts.ts";
import type { CrayonAppearance, QuadraticCurve } from "../../src/drawing/contracts.ts";

const appearances: readonly CrayonAppearance[] = [CAT_APPEARANCE, SUN_APPEARANCE, RAINBOW_APPEARANCE, BALLOON_APPEARANCE];
const art: readonly AuthoredArt[] = [...Object.values(BASIC_COMPLETE_ART), ...Object.values(INTERMEDIATE_COMPLETE_APPEARANCES), ...Object.values(EXPERT_COMPLETE_APPEARANCES)];
const regions: ColourRegions = BALLOON_COLOUR_REGIONS;
const curve: QuadraticCurve = [[0, 0], [10, 20], [30, 0]];
rainbowArch(100, 80);
void appearances; void art; void regions; void curve;

// @ts-expect-error a quadratic gesture requires its bend and both endpoints
const missingBend: QuadraticCurve = [[0, 0], [30, 0]];
// @ts-expect-error each control point is a pair of numeric coordinates
const invalidPoint: QuadraticCurve = [[0, 0], [10, "20"], [30, 0]];
// @ts-expect-error actual authoring helpers reject nonnumeric radii
rainbowArch("wide", 80);
// @ts-expect-error a misspelled contour must not reach lesson compilation
BASIC_COMPLETE_GEOMETRY.flower["upper-pettel"];
const balloonPoint = BALLOON_BODY[0];
if (balloonPoint) {
  // @ts-expect-error authored geometry must remain immutable during playback
  balloonPoint.x = 200;
}
// @ts-expect-error containment records require an independent closed boundary
const missingBoundary: ColourRegions = { paint: [{ gestureId: "colour" }] };
// @ts-expect-error artwork includes containment data as well as appearance
const incompleteArt: AuthoredArt = { appearance: CAT_APPEARANCE };
// @ts-expect-error real compiled schedules retain numeric durations
const invalidSchedule: CrayonAppearance = { ...CAT_APPEARANCE, colourPhases: { paint: { durationMs: "slow", gestures: [] } } };
// @ts-expect-error real compiled outlines retain the native fill vocabulary
const invalidOutline: CrayonAppearance = { ...CAT_APPEARANCE, outlineStyles: { default: { fill: "gradient" } } };
void missingBend; void invalidPoint; void missingBoundary; void incompleteArt; void invalidSchedule; void invalidOutline;
