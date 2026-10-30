// @ts-check
/** @typedef {import("./drawing/contracts.ts").DrawingPoint} DrawingPoint */
/** @typedef {import("./drawing/contracts.ts").OutlineStyle} OutlineStyle */
/** @typedef {import("./drawing/contracts.ts").CrayonPhase} CrayonPhase */
/** @typedef {import("./authoring/contracts.ts").RegionPatchOptions} RegionPatchOptions */
/** @typedef {import("./authoring/contracts.ts").ColourRegion} ColourRegion */
/** @typedef {import("./authoring/contracts.ts").AuthoredArt} AuthoredArt */
import { arc, cubic, ellipse, line, quad, rect } from "./lesson-geometry.js";
import { crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";
import { regionPatch } from "./crayon-regions.js";

// These contours describe the subject, independently of the inset crayon paths.
// A closing segment at an overlap is the edge hidden by the foreground object.
/** @param {...readonly DrawingPoint[]} paths */
const B = (...paths) => Object.freeze(paths.flat().map((point) => Object.freeze({ ...point })));
/** @param {readonly DrawingPoint[]} points */
const reverse = (points) => [...points].reverse();
/** @satisfies {Readonly<Record<string, import("./drawing/contracts.ts").CrayonColour>>} */
const palette = {
  blue: { sdkColor: "blue", ink: "#739fbd", grain: "#4d80a4" },
  teal: { sdkColor: "light-blue", ink: "#75b5af", grain: "#55948f" },
  brown: { sdkColor: "orange", ink: "#bd916c", grain: "#9c7252" },
  orange: { sdkColor: "orange", ink: "#df9d60", grain: "#bd7945" },
  yellow: { sdkColor: "yellow", ink: "#e8c86b", grain: "#c9a844" },
  red: { sdkColor: "red", ink: "#d78173", grain: "#b95e55" },
  pink: { sdkColor: "light-red", ink: "#dca7a8", grain: "#bd838a" },
  green: { sdkColor: "green", ink: "#8cad7a", grain: "#6e915b" },
  darkGreen: { sdkColor: "green", ink: "#739064", grain: "#58784d" },
  grey: { sdkColor: "grey", ink: "#a6afb2", grain: "#879498" },
  shadow: { sdkColor: "grey", ink: "#8b999f", grain: "#74858e" },
};

// Every patch is an authored location. Short, alternating curved sweeps lift
// between movements; no region is filled or covered by a mechanical scan.
/**
 * @param {string} id @param {readonly DrawingPoint[]} boundary @param {keyof typeof palette} colour
 * @param {number} cx @param {number} cy @param {number} rx @param {number} ry
 * @param {number} [angle] @param {number} [width] @param {number} [passes]
 * @returns {RegionPatchOptions}
 */
const P = (id, boundary, colour, cx, cy, rx, ry, angle = 0, width = 8, passes = 3) => ({
  id, boundary, colour, cx, cy, rx, ry, angle, width, strands: 3, passes,
});
/** @param {string} id @param {readonly {id: string, ms: number, patches: readonly RegionPatchOptions[]}[]} phases @param {Readonly<Record<string, OutlineStyle>>} [outlineStyles] @returns {AuthoredArt} */
function build(id, phases, outlineStyles = {}) {
  /** @type {Record<string, CrayonPhase>} */
  const colourPhases = {};
  /** @type {Record<string, readonly ColourRegion[]>} */
  const regions = {};
  for (const phase of phases) {
    const patches = phase.patches.map((patch) => regionPatch({ ...patch, id: `${id}-${patch.id}` }));
    colourPhases[phase.id] = crayonPhase(phase.ms, patches.flatMap((patch) => patch.gestures));
    regions[phase.id] = Object.freeze(patches.flatMap((patch) => patch.regions));
  }
  return Object.freeze({
    appearance: defineCrayonAppearance({
      palette: Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, { ...value }])),
      outlineStyles: { default: { color: "black", ink: "#665b55", fill: "none", dash: "draw", size: "m" }, ...outlineStyles },
      colourPhases,
    }),
    regions: Object.freeze(regions),
  });
}

const birdBody = B(ellipse(285, 253, 85, 59, -14));
const birdHead = B(ellipse(378, 200, 37, 37));
const birdWing = B(cubic([245, 235], [285, 217], [332, 240], [317, 276]), cubic([317, 276], [286, 284], [258, 272], [245, 235]));
const birdTail = B(quad([215, 265], [181, 278], [144, 320]), quad([144, 320], [206, 308], [237, 295]));
const birdChest = B(ellipse(338, 259, 12, 22, 20));
const birdBranch = B(line([90, 370], [510, 330]), quad([510, 330], [523, 337], [512, 346]), line([512, 346], [92, 386]), quad([92, 386], [78, 379], [90, 370]));
const birdLeaf = B(quad([449, 306], [475, 275], [491, 290]), quad([491, 290], [477, 314], [449, 306]));
const bird = build("bird", [
  { id: "colour-feathers", ms: 28000, patches: [P("lower-body", birdBody, "blue", 279, 288, 33, 9, -10), P("back", birdBody, "blue", 246, 221, 28, 8, -20), P("head", birdHead, "blue", 371, 213, 17, 7, 0, 7), P("tail", birdTail, "blue", 196, 294, 25, 5, -26, 6), P("body-left", birdBody, "blue", 227, 257, 13, 16, -15, 8), P("body-bottom", birdBody, "blue", 300, 297, 21, 4, 0, 6), P("shoulder", birdBody, "blue", 323, 222, 17, 5, -14, 6), P("head-top", birdHead, "blue", 375, 179, 13, 3, -8, 5), P("head-left", birdHead, "blue", 354, 199, 3, 10, -10, 3), P("body-left-low", birdBody, "blue", 228, 275, 15, 12, 25, 11), P("body-bottom-middle", birdBody, "blue", 286, 286, 29, 10, -10, 11), P("body-back-middle", birdBody, "blue", 286, 214, 32, 9, -10, 11), P("head-round", birdHead, "blue", 373, 200, 19, 15, -10, 11)] },
  { id: "colour-wing", ms: 14000, patches: [P("wing-upper", birdWing, "teal", 284, 244, 25, 5, 10, 7), P("wing-lower", birdWing, "teal", 290, 262, 20, 4, 5, 6), P("wing-middle", birdWing, "teal", 281, 253, 19, 5, -5, 6), P("wing-full", birdWing, "teal", 288, 249, 24, 10, 12, 10)] },
  { id: "colour-perch", ms: 15000, patches: [P("branch-left", birdBranch, "brown", 196, 368, 66, 1.5, -5.45, 3), P("branch-right", birdBranch, "brown", 403, 348, 61, 1.5, -5.45, 3), P("leaf", birdLeaf, "green", 474, 296, 9, 2.5, -25, 3), P("branch-middle", birdBranch, "brown", 307, 357, 38, 1, -5.45, 3)] },
  { id: "colour-breast", ms: 11000, patches: [P("breast", birdChest, "orange", 337, 260, 3.5, 8, 20, 3), P("wing-shade", birdWing, "blue", 300, 261, 10, 2, 15, 4)] },
], { "bird-eye": { fill: "fill" }, "first-leg": { width: 2 }, "second-leg": { width: 2 } });

const foxBody = B(ellipse(282, 255, 139, 83));
const foxHead = B(ellipse(382, 263, 49, 43, -12));
const foxTail = B(cubic([145, 250], [102, 343], [265, 393], [355, 322]), cubic([355, 322], [272, 349], [217, 300], [145, 250]));
const foxNearEar = B(line([376, 225], [384, 171], [409, 229]));
const foxFarEar = B(line([408, 233], [431, 195], [432, 253]));
const foxLeaf = B(quad([452, 335], [469, 309], [488, 325]), quad([488, 325], [475, 347], [452, 335]));
const fox = build("fox", [
  { id: "colour-curled-body", ms: 30000, patches: [P("back-left", foxBody, "orange", 222, 224, 45, 20, -17), P("back-middle", foxBody, "orange", 299, 207, 40, 18, 9), P("flank", foxBody, "orange", 298, 260, 40, 22, -12), P("lower-flank", foxBody, "orange", 279, 302, 25, 9), P("back-high", foxBody, "orange", 278, 187, 38, 5, -3, 6), P("flank-left", foxBody, "orange", 188, 255, 23, 17, -18), P("body-centre", foxBody, "orange", 251, 255, 31, 20, 27), P("shoulder", foxBody, "orange", 335, 234, 13, 13, -15, 7), P("body-low-left", foxBody, "orange", 224, 280, 36, 14, -15, 12), P("body-round-middle", foxBody, "orange", 280, 236, 40, 21, -8, 12), P("body-far-left", foxBody, "orange", 173, 265, 12, 12, -20, 10)] },
  { id: "colour-face-ears", ms: 22000, patches: [P("forehead", foxHead, "orange", 389, 244, 20, 6, -10, 6), P("right-cheek", foxHead, "orange", 411, 268, 7, 11, 0, 5), P("near-ear", foxNearEar, "orange", 388, 211, 4, 8, 0, 3), P("far-ear", foxFarEar, "orange", 423, 232, 3, 2, 0, 2), P("head-right", foxHead, "orange", 410, 251, 6, 7, -20, 4), P("head-low", foxHead, "orange", 391, 290, 12, 2, -10, 4), P("head-middle", foxHead, "orange", 398, 258, 10, 12, -10, 9)] },
  { id: "colour-sweeping-tail", ms: 26000, patches: [P("tail-start", foxTail, "orange", 166, 296, 12, 15, -35, 7), P("tail-low", foxTail, "orange", 211, 340, 32, 8, 15), P("tail-middle", foxTail, "orange", 273, 345, 22, 2, -5, 4), P("tail-left", foxTail, "orange", 174, 326, 10, 6, 20, 5), P("tail-sweep", foxTail, "orange", 215, 329, 28, 5, 13, 6), P("tail-return", foxTail, "orange", 257, 341, 23, 3, 1, 5), P("tail-broad", foxTail, "orange", 202, 316, 29, 12, 25, 10), P("tail-inner", foxTail, "orange", 254, 334, 21, 5, 8, 8)] },
  { id: "colour-woodland-layer", ms: 12000, patches: [P("body-shade", foxBody, "brown", 285, 284, 25, 6, 8, 5), P("fallen-leaf", foxLeaf, "yellow", 473, 329, 8, 3, -20, 4)] },
], { "fox-nose": { fill: "fill" }, "sleepy-eye": { width: 2.2 } });

const elephantBody = B(ellipse(255, 220, 145, 85));
const elephantHead = B(ellipse(407, 216, 69, 60));
const elephantEar = B(cubic([386, 174], [327, 163], [321, 250], [376, 270]), cubic([376, 270], [405, 260], [414, 203], [386, 174]));
const elephantTrunk = B(cubic([468, 228], [499, 255], [458, 354], [514, 351]), quad([514, 351], [532, 357], [517, 370]), reverse(cubic([455, 256], [468, 288], [446, 379], [517, 370])));
const elephantFrontLeg = B(line([346, 288], [343, 376]), quad([343, 376], [364, 391], [385, 376]), line([385, 376], [382, 264]));
const elephantBackLeg = B(line([161, 286], [154, 375]), quad([154, 375], [176, 391], [198, 375]), line([198, 375], [204, 300]));
const elephantPuddle = B(ellipse(479, 411, 53, 12, -4));
const elephant = build("elephant", [
  { id: "colour-large-body", ms: 33000, patches: [P("back", elephantBody, "grey", 229, 177, 61, 19, -10), P("middle", elephantBody, "grey", 225, 216, 70, 23, 11), P("belly", elephantBody, "grey", 262, 263, 58, 21, -11), P("shoulder", elephantBody, "grey", 312, 220, 14, 28), P("back-left", elephantBody, "grey", 163, 198, 23, 17, -10), P("body-high", elephantBody, "grey", 282, 157, 33, 6, 6, 7), P("body-low", elephantBody, "grey", 239, 287, 35, 4, -4, 6), P("body-left-centre", elephantBody, "grey", 161, 228, 22, 18, -8, 12), P("body-back-centre", elephantBody, "grey", 229, 195, 57, 19, -7, 12), P("body-low-centre", elephantBody, "grey", 226, 243, 60, 20, 10, 12), P("body-front-low", elephantBody, "grey", 315, 260, 19, 17, -10, 10), P("body-back-low", elephantBody, "grey", 177, 263, 25, 12, 12, 11)] },
  { id: "colour-head-trunk", ms: 24000, patches: [P("head-top", elephantHead, "grey", 424, 179, 19, 5, 10, 6), P("head-cheek", elephantHead, "grey", 435, 236, 17, 12, -14, 6), P("trunk-upper", elephantTrunk, "grey", 474, 268, 4, 9, 0, 3), P("trunk-tip", elephantTrunk, "grey", 504, 361, 9, 2, 0, 3), P("face-right", elephantHead, "grey", 453, 215, 6, 12, -10, 5), P("trunk-middle", elephantTrunk, "grey", 471, 318, 2, 12, 0, 2), P("head-round", elephantHead, "grey", 425, 222, 17, 16, -14, 10)] },
  { id: "colour-ear-legs", ms: 26000, patches: [P("ear-top", elephantEar, "shadow", 365, 205, 17, 10, 15, 7), P("ear-low", elephantEar, "shadow", 371, 240, 13, 8, 15, 6), P("front-leg", elephantFrontLeg, "grey", 363, 333, 8, 26, 0, 5), P("back-leg", elephantBackLeg, "grey", 176, 339, 9, 25, 0, 5), P("ear-middle", elephantEar, "shadow", 371, 222, 14, 10, -12, 6), P("front-foot", elephantFrontLeg, "grey", 363, 369, 8, 3, 0, 4), P("back-foot", elephantBackLeg, "grey", 176, 369, 9, 3, 0, 4), P("ear-round", elephantEar, "shadow", 369, 222, 16, 22, -10, 11)] },
  { id: "colour-water-layer", ms: 12000, patches: [P("puddle", elephantPuddle, "blue", 478, 411, 31, 1.8, -4, 3), P("belly-shade", elephantBody, "shadow", 283, 281, 31, 3, 0, 4)] },
], { "elephant-eye": { fill: "fill" }, "tail-tuft": { fill: "fill" } });

const rabbitBody = B(ellipse(270, 286, 112, 81, -8));
const rabbitHead = B(ellipse(386, 227, 51, 43, -12));
const rabbitNearEar = B(cubic([370, 190], [340, 137], [349, 69], [367, 83]), cubic([367, 83], [386, 101], [392, 148], [390, 184]));
const rabbitFarEar = B(cubic([394, 184], [402, 117], [432, 84], [438, 107]), cubic([438, 107], [441, 134], [420, 171], [409, 190]));
const rabbitInnerEar = B(cubic([375, 172], [355, 130], [352, 100], [366, 105]), quad([366, 105], [386, 134], [375, 172]));
const rabbitHaunch = B(ellipse(243, 309, 48, 44, -12));
const rabbitFoot = B(ellipse(274, 362, 60, 14, -3));
const rabbitPaw = B(ellipse(373, 359, 27, 11));
const rabbitLeaf = B(quad([463, 357], [473, 324], [496, 335]), quad([496, 335], [489, 361], [463, 357]));
const rabbit = build("rabbit", [
  { id: "colour-soft-fur", ms: 30000, patches: [P("back", rabbitBody, "brown", 265, 239, 45, 18, -13), P("body-middle", rabbitBody, "brown", 305, 275, 30, 23, 13), P("body-bottom", rabbitBody, "brown", 320, 323, 20, 13), P("head", rabbitHead, "brown", 378, 232, 20, 11, -15, 7), P("back-left", rabbitBody, "brown", 198, 274, 14, 17, -15, 7), P("body-high", rabbitBody, "brown", 290, 220, 26, 5, -5, 6), P("head-high", rabbitHead, "brown", 383, 202, 15, 3, -10, 5), P("body-top-round", rabbitBody, "brown", 269, 248, 43, 21, 9, 12), P("body-right-round", rabbitBody, "brown", 307, 295, 28, 23, -16, 12), P("body-left-round", rabbitBody, "brown", 193, 297, 13, 17, -12, 10), P("head-round", rabbitHead, "brown", 379, 228, 20, 17, -12, 11)] },
  { id: "colour-long-ears", ms: 18000, patches: [P("near-ear-top", rabbitNearEar, "brown", 365, 111, 4, 12, -9, 3), P("near-ear-edge", rabbitNearEar, "brown", 380, 155, 2.5, 15, 0, 2), P("far-ear", rabbitFarEar, "brown", 419, 144, 4, 15, 22, 3), P("near-ear-low", rabbitNearEar, "brown", 381, 171, 2, 5, -10, 2), P("far-ear-high", rabbitFarEar, "brown", 429, 119, 2, 7, 20, 2)] },
  { id: "colour-feet", ms: 23000, patches: [P("haunch", rabbitHaunch, "orange", 242, 307, 24, 14, -12, 7), P("hind-foot", rabbitFoot, "brown", 270, 362, 37, 2, -3, 3), P("front-paw", rabbitPaw, "brown", 372, 359, 14, 1, 0, 3), P("haunch-upper", rabbitHaunch, "orange", 230, 291, 16, 6, -20, 6), P("haunch-low", rabbitHaunch, "orange", 244, 333, 18, 3, -7, 5), P("haunch-round", rabbitHaunch, "orange", 242, 311, 24, 20, -12, 11), P("haunch-left", rabbitHaunch, "orange", 215, 314, 3, 9, -8, 3)] },
  { id: "colour-garden-layer", ms: 13000, patches: [P("inner-ear", rabbitInnerEar, "pink", 369, 133, 2, 5, -5, 2), P("leaf", rabbitLeaf, "green", 480, 344, 7, 3, -20, 4), P("fur-shade", rabbitHaunch, "brown", 251, 330, 15, 3, 0, 4)] },
], { "rabbit-eye": { fill: "fill" }, "rabbit-nose": { fill: "fill" }, "first-whisker": { width: 1.7 }, "second-whisker": { width: 1.7 } });

const cupBody = B(arc(280, 195, 100, 28, 0, 180), cubic([180, 195], [182, 249], [187, 320], [200, 345]), quad([200, 345], [280, 379], [360, 345]), reverse(cubic([380, 195], [378, 249], [373, 320], [360, 345])));
const cupBand = B(quad([184, 251], [280, 278], [376, 251]), reverse(quad([187, 273], [280, 301], [373, 273])));
const cupHandle = B(cubic([376, 236], [483, 193], [492, 343], [366, 325]), reverse(cubic([374, 257], [452, 226], [455, 322], [370, 305])));
const cupSaucer = B(arc(300, 353, 180, 60, 180, 0));
const cupBiscuit = B(ellipse(508, 400, 36, 22, -12));
const cup = build("cup", [
  { id: "colour-cup", ms: 29000, patches: [P("upper-cup", cupBody, "teal", 276, 240, 61, 3, 0, 6), P("left-cup", cupBody, "teal", 225, 312, 15, 18, -4, 7), P("right-cup", cupBody, "teal", 337, 315, 14, 18, 4, 7), P("upper-left", cupBody, "teal", 216, 235, 13, 4, -10, 5), P("upper-right", cupBody, "teal", 340, 237, 13, 4, 10, 5), P("lower-cup", cupBody, "teal", 280, 346, 38, 3, 0, 5), P("cup-upper-wide", cupBody, "teal", 280, 240, 65, 5, 0, 10), P("cup-left-round", cupBody, "teal", 222, 307, 17, 24, -7, 12), P("cup-right-round", cupBody, "teal", 337, 310, 15, 25, 7, 12), P("cup-bottom-wide", cupBody, "teal", 280, 344, 43, 3, 0, 8)] },
  { id: "colour-band-handle", ms: 20000, patches: [P("band", cupBand, "yellow", 280, 275, 57, 2.5, 0, 4), P("handle-upper", cupHandle, "teal", 432, 258, 5, 8, -25, 3), P("handle-lower", cupHandle, "teal", 431, 301, 5, 6, 25, 3), P("band-left", cupBand, "yellow", 223, 268, 17, 2, 12, 3), P("band-right", cupBand, "yellow", 337, 268, 17, 2, -12, 3), P("handle-middle", cupHandle, "teal", 445, 279, 1.5, 7, 0, 2)] },
  { id: "colour-saucer", ms: 23000, patches: [P("saucer-left", cupSaucer, "blue", 218, 385, 35, 5, 12, 6), P("saucer-right", cupSaucer, "blue", 370, 388, 37, 5, -12, 6), P("saucer-middle", cupSaucer, "blue", 299, 400, 38, 3, 0, 5), P("saucer-left-edge", cupSaucer, "blue", 166, 373, 13, 3, 20, 4), P("saucer-right-edge", cupSaucer, "blue", 427, 373, 13, 3, -20, 4), P("saucer-left-wide", cupSaucer, "blue", 213, 381, 29, 7, 15, 10), P("saucer-right-wide", cupSaucer, "blue", 376, 381, 29, 7, -15, 10)] },
  { id: "colour-table-layer", ms: 12000, patches: [P("biscuit", cupBiscuit, "yellow", 508, 407, 20, 2.5, -12, 4), P("cup-shade", cupBody, "blue", 348, 306, 5, 20, 0, 4)] },
], { "biscuit-dot": { fill: "fill" }, "first-steam": { ink: "#a69a92", width: 1.8 }, "second-steam": { ink: "#a69a92", width: 1.8 } });

const bowlBody = B(cubic([133, 287], [149, 434], [451, 434], [467, 287]), reverse(quad([133, 287], [300, 322], [467, 287])));
const bowlApple = B(cubic([152, 289], [132, 231], [165, 178], [200, 205]), cubic([200, 205], [237, 175], [269, 235], [251, 302]), reverse(quad([152, 289], [201, 302], [251, 302])));
const bowlPear = B(cubic([237, 211], [258, 209], [260, 161], [281, 160]), cubic([281, 160], [310, 160], [297, 204], [324, 230]), cubic([324, 230], [353, 257], [340, 286], [330, 303]), line([330, 303], [251, 302], [237, 211]));
const bowlOrange = B(arc(398, 255, 58, 51, 115.23892771966203, 407.69049515970123));
const bowlBanana = B(cubic([219, 176], [282, 113], [374, 140], [425, 213]), cubic([425, 213], [339, 168], [285, 155], [219, 176]));
const bowlLeaf = B(quad([203, 190], [217, 167], [232, 180]), quad([232, 180], [224, 199], [203, 190]));
const fallenFruit = B(ellipse(502, 396, 32, 29));
const bowl = build("fruit-bowl", [
  { id: "colour-apple-pear", ms: 27000, patches: [P("apple-left", bowlApple, "red", 173, 248, 12, 20), P("apple-right", bowlApple, "red", 218, 253, 15, 22), P("pear-top", bowlPear, "green", 279, 192, 7, 14, 0, 5), P("pear-body", bowlPear, "green", 300, 261, 17, 20, 0, 7), P("apple-top", bowlApple, "red", 183, 222, 16, 5, -5, 5), P("pear-middle", bowlPear, "green", 282, 226, 8, 14, 0, 5), P("apple-round", bowlApple, "red", 199, 254, 29, 25, -12, 12), P("pear-round", bowlPear, "green", 287, 254, 20, 27, -7, 11)] },
  { id: "colour-banana", ms: 11000, patches: [P("banana-left", bowlBanana, "yellow", 268, 156, 17, 1, -4, 2), P("banana-right", bowlBanana, "yellow", 354, 173, 22, 1, 25, 2)] },
  { id: "colour-oranges", ms: 24000, patches: [P("orange-left", bowlOrange, "orange", 377, 261, 17, 19, -8), P("orange-right", bowlOrange, "orange", 420, 275, 16, 11), P("fallen-fruit", fallenFruit, "orange", 502, 398, 16, 13, 0, 6), P("orange-low", bowlOrange, "orange", 400, 292, 16, 3, 0, 4), P("fallen-fruit-top", fallenFruit, "orange", 501, 379, 10, 2, 0, 4), P("orange-round", bowlOrange, "orange", 398, 261, 31, 24, 9, 12), P("extra-fruit-round", fallenFruit, "orange", 502, 397, 16, 13, 0, 9)] },
  { id: "colour-bowl", ms: 25000, patches: [P("bowl-left", bowlBody, "blue", 222, 339, 34, 12, 15), P("bowl-right", bowlBody, "blue", 375, 339, 34, 12, -15), P("bowl-low", bowlBody, "blue", 300, 391, 27, 4, 0, 5), P("bowl-middle", bowlBody, "blue", 297, 335, 39, 10, 0, 7), P("bowl-lower-left", bowlBody, "blue", 248, 375, 23, 3, 12, 5), P("bowl-left-round", bowlBody, "blue", 222, 343, 37, 21, 12, 12), P("bowl-right-round", bowlBody, "blue", 374, 342, 37, 21, -12, 12)] },
  { id: "colour-still-life-layer", ms: 10000, patches: [P("apple-leaf", bowlLeaf, "green", 219, 185, 4, 1.5, -20, 2), P("bowl-shadow", bowlBody, "teal", 359, 369, 21, 3, -15, 4)] },
], { "orange-first-spot": { fill: "fill" }, "orange-second-spot": { fill: "fill" } });

const treeCrown = B(cubic([94, 218], [43, 234], [35, 181], [67, 162]), cubic([67, 162], [44, 119], [96, 92], [125, 109]), cubic([125, 109], [146, 60], [207, 73], [219, 109]), cubic([219, 109], [268, 90], [292, 147], [267, 174]), cubic([267, 174], [291, 219], [244, 243], [219, 220]), cubic([219, 220], [172, 258], [124, 248], [94, 218]));
const treeTrunk = B(cubic([134, 356], [151, 303], [155, 248], [151, 207]), line([151, 207], [184, 207]), reverse(cubic([193, 356], [174, 293], [180, 247], [184, 207])));
const treePath = B(cubic([305, 441], [208, 341], [460, 264], [403, 153]), line([403, 153], [420, 154]), reverse(cubic([494, 441], [337, 329], [495, 254], [420, 154])));
const treeCluster = B(cubic([104, 148], [95, 129], [120, 118], [135, 130]), cubic([135, 130], [157, 109], [181, 130], [172, 145]), cubic([172, 145], [152, 165], [124, 160], [104, 148]));
const treeStone = B(ellipse(248, 401, 31, 19, -12));
const treeSun = B(ellipse(523, 74, 24, 24));
const tree = build("tree-path", [
  { id: "colour-leafy-crown", ms: 31000, patches: [P("leaves-left", treeCrown, "green", 91, 172, 25, 19), P("leaves-high", treeCrown, "green", 170, 111, 32, 13), P("leaves-right", treeCrown, "green", 234, 154, 23, 19), P("leaves-low", treeCrown, "green", 168, 215, 39, 10), P("leaves-middle", treeCrown, "green", 169, 174, 36, 17, -10), P("leaves-upper-left", treeCrown, "green", 99, 125, 17, 9, 10, 6), P("leaves-low-right", treeCrown, "green", 235, 208, 17, 8, -20, 6), P("leaves-centre-round", treeCrown, "green", 174, 176, 42, 26, -18, 12), P("leaves-left-round", treeCrown, "green", 88, 172, 27, 25, 22, 12), P("leaves-right-round", treeCrown, "green", 234, 154, 26, 24, -22, 12), P("leaves-top-round", treeCrown, "green", 171, 110, 30, 19, 12, 11), P("leaves-low-round", treeCrown, "green", 164, 217, 35, 9, 0, 11)] },
  { id: "colour-tree-trunk", ms: 17000, patches: [P("trunk-upper", treeTrunk, "brown", 167, 270, 3, 19, 0, 3), P("trunk-lower", treeTrunk, "brown", 165, 326, 8, 11, 0, 4), P("trunk-middle", treeTrunk, "brown", 166, 300, 4, 12, 0, 3), P("trunk-base", treeTrunk, "brown", 163, 345, 12, 1.5, 0, 3)] },
  { id: "colour-winding-path", ms: 26000, patches: [P("path-near", treePath, "yellow", 408, 414, 39, 12, 0, 7), P("path-middle", treePath, "yellow", 380, 348, 17, 11, 0, 6), P("path-turn", treePath, "yellow", 413, 283, 9, 10, 0, 4), P("path-far", treePath, "yellow", 422, 213, 3, 7, 0, 2), P("path-near-left", treePath, "yellow", 365, 400, 15, 13, 20, 5), P("path-middle-turn", treePath, "yellow", 393, 316, 12, 10, -20, 5), P("path-near-round", treePath, "yellow", 415, 414, 39, 13, 5, 12), P("path-middle-round", treePath, "yellow", 380, 353, 16, 16, -10, 10)] },
  { id: "colour-landscape-layer", ms: 14000, patches: [P("leaf-cluster", treeCluster, "darkGreen", 138, 140, 18, 3, 0, 4), P("near-stone", treeStone, "grey", 248, 402, 16, 4, -12, 4), P("sun", treeSun, "yellow", 523, 74, 10, 5, 0, 5)] },
]);

const castleWall = B(rect(210, 225, 180, 115));
const castleLeftTower = B(rect(135, 166, 75, 174));
const castleRightTower = B(rect(390, 166, 75, 174));
const castleLeftRoof = B(line([126, 166], [172, 103], [219, 166]));
const castleRightRoof = B(line([381, 166], [428, 103], [474, 166]));
const castleGate = B(line([271, 340], [271, 291]), arc(300, 291, 29, 32, 180, 360), line([329, 291], [329, 340]));
const castleBridge = B(line([271, 340], [329, 340], [362, 431], [238, 431]));
const castleLeftWindow = B(line([157, 239], [157, 212]), arc(172, 212, 15, 18, 180, 360), line([187, 212], [187, 239]));
const castleRightWindow = B(line([412, 239], [412, 212]), arc(427, 212, 15, 18, 180, 360), line([442, 212], [442, 239]));
const castleFlag = B(line([172, 53], [218, 65], [172, 79]));
const castle = build("castle", [
  { id: "colour-stone-walls", ms: 33000, patches: [P("left-tower", castleLeftTower, "grey", 172, 285, 18, 28), P("right-tower", castleRightTower, "grey", 428, 285, 18, 28), P("wall-left", castleWall, "grey", 239, 311, 12, 14, 0, 6), P("wall-right", castleWall, "grey", 359, 300, 16, 19), P("wall-top", castleWall, "grey", 300, 241, 37, 3, 0, 4), P("left-tower-high", castleLeftTower, "grey", 173, 181, 20, 2, 0, 3), P("right-tower-high", castleRightTower, "grey", 428, 181, 20, 2, 0, 3), P("left-wall-low", castleWall, "grey", 241, 326, 13, 1.5, 0, 3), P("right-wall-low", castleWall, "grey", 357, 326, 15, 1.5, 0, 3), P("left-tower-round", castleLeftTower, "grey", 172, 286, 22, 28, -5, 12), P("right-tower-round", castleRightTower, "grey", 428, 286, 22, 28, 5, 12), P("wall-left-round", castleWall, "grey", 240, 308, 13, 14, 0, 9), P("wall-right-round", castleWall, "grey", 357, 301, 15, 21, 0, 10)] },
  { id: "colour-pointed-roofs", ms: 21000, patches: [P("left-roof", castleLeftRoof, "red", 172, 145, 17, 4, 0, 5), P("right-roof", castleRightRoof, "red", 428, 145, 17, 4, 0, 5), P("left-roof-high", castleLeftRoof, "red", 172, 132, 6, 2, 0, 3), P("right-roof-high", castleRightRoof, "red", 428, 132, 6, 2, 0, 3), P("left-roof-round", castleLeftRoof, "red", 172, 146, 18, 3, 0, 9), P("right-roof-round", castleRightRoof, "red", 428, 146, 18, 3, 0, 9)] },
  { id: "colour-wooden-bridge", ms: 21000, patches: [P("gate", castleGate, "brown", 300, 303, 13, 21, 0, 6), P("bridge-top", castleBridge, "brown", 300, 366, 13, 8, 0, 5), P("bridge-near", castleBridge, "brown", 300, 405, 26, 9, 0, 7), P("bridge-middle", castleBridge, "brown", 300, 385, 22, 3, 0, 4), P("gate-low", castleGate, "brown", 299, 330, 13, 1.5, 0, 3)] },
  { id: "colour-castle-light", ms: 14000, patches: [P("left-window", castleLeftWindow, "blue", 172, 220, 5, 7, 0, 3), P("right-window", castleRightWindow, "blue", 427, 220, 5, 7, 0, 3), P("flag", castleFlag, "yellow", 188, 65, 6, 1, 0, 2), P("right-wall-shade", castleRightTower, "shadow", 449, 289, 2, 25, 0, 3)] },
], { "moat-left": { ink: "#739fbd", width: 2.4 }, "moat-right": { ink: "#739fbd", width: 2.4 } });

const lighthouseTower = B(line([142, 153], [198, 153], [225, 348]), quad([225, 348], [170, 365], [115, 348]));
const lighthouseBand = B(quad([133, 219], [170, 230], [207, 219]), line([207, 219], [216, 285]), reverse(quad([124, 285], [170, 298], [216, 285])));
const lighthouseLeftGlass = B(rect(142, 94, 28, 49));
const lighthouseRightGlass = B(rect(170, 94, 28, 49));
const lighthouseRoof = B(line([131, 94], [170, 62], [209, 94]));
const lighthouseRock = B(line([287, 364], [278, 341], [296, 322], [325, 329], [340, 353]), quad([340, 353], [316, 371], [287, 364]));
const lighthouseBoat = B(quad([475, 203], [493, 224], [511, 203]), line([511, 203], [475, 203]));
const lighthouseDoor = B(line([156, 353], [156, 316]), arc(170, 316, 14, 17, 180, 360), line([184, 316], [184, 353]));
const lighthouse = build("lighthouse", [
  { id: "colour-tower-band", ms: 20000, patches: [P("stripe-left", lighthouseBand, "red", 151, 254, 10, 15, 0, 6), P("stripe-right", lighthouseBand, "red", 186, 254, 11, 15, 0, 6), P("stripe-middle", lighthouseBand, "red", 169, 255, 10, 18, 4, 6), P("stripe-upper", lighthouseBand, "red", 169, 235, 24, 2, 0, 3), P("stripe-lower", lighthouseBand, "red", 169, 278, 27, 2, 0, 3)] },
  { id: "colour-lantern", ms: 18000, patches: [P("left-glass", lighthouseLeftGlass, "yellow", 156, 119, 4, 11, 0, 3), P("right-glass", lighthouseRightGlass, "yellow", 184, 119, 4, 11, 0, 3), P("roof", lighthouseRoof, "red", 170, 84, 9, 1, 0, 3), P("left-glass-low", lighthouseLeftGlass, "yellow", 156, 133, 4, 1, 0, 3), P("right-glass-low", lighthouseRightGlass, "yellow", 184, 133, 4, 1, 0, 3)] },
  { id: "colour-coastal-details", ms: 18000, patches: [P("rock", lighthouseRock, "grey", 307, 347, 14, 6, 0, 5), P("boat", lighthouseBoat, "brown", 493, 208, 7, 0.8, 0, 2), P("door", lighthouseDoor, "brown", 170, 331, 4, 9, 0, 3), P("rock-low", lighthouseRock, "grey", 308, 357, 14, 1, 0, 3), P("rock-top", lighthouseRock, "grey", 306, 335, 7, 1, 0, 3)] },
  { id: "colour-tower-shadow", ms: 14000, patches: [P("lower-shadow", lighthouseTower, "grey", 212, 320, 2, 18, -8, 3), P("upper-shadow", lighthouseTower, "grey", 196, 192, 2, 15, -8, 3), P("tower-shade-low", lighthouseTower, "grey", 213, 343, 2, 5, -8, 2)] },
], { "sea-horizon": { ink: "#739fbd", width: 2 }, "near-wave": { ink: "#739fbd", width: 2 }, "far-wave": { ink: "#739fbd", width: 1.7 }, "light-beam-upper": { ink: "#c9a844", width: 1.7 }, "light-beam-lower": { ink: "#c9a844", width: 1.7 } });

const coralRock = B(cubic([247, 401], [220, 365], [251, 339], [277, 354]), cubic([277, 354], [311, 344], [333, 381], [315, 406]), quad([315, 406], [282, 416], [247, 401]));
const coralRound = B(cubic([377, 411], [347, 367], [367, 310], [397, 315]), cubic([397, 315], [421, 282], [455, 313], [454, 336]), cubic([454, 336], [490, 339], [493, 390], [470, 410]), quad([470, 410], [423, 424], [377, 411]));
const coralFirstWeed = B(cubic([255, 348], [236, 310], [277, 282], [262, 244]), cubic([262, 244], [303, 287], [268, 321], [275, 352]));
const coralSecondWeed = B(cubic([322, 382], [305, 312], [335, 294], [328, 270]), cubic([328, 270], [364, 311], [330, 353], [335, 405]));
const coralFish = B(ellipse(384, 192, 64, 33, -5));
const coralTail = B(line([324, 183], [286, 163], [293, 218], [324, 203]));
const coralFin = B(quad([376, 188], [342, 197], [367, 216]), line([367, 216], [376, 188]));
const coralShell = B(quad([191, 399], [158, 358], [178, 356]), quad([178, 356], [190, 337], [201, 357]), quad([201, 357], [229, 350], [212, 392]), line([212, 392], [191, 399]));
const coral = build("coral", [
  { id: "colour-rounded-coral", ms: 28000, patches: [P("coral-left", coralRound, "pink", 385, 368, 10, 23, -4, 7), P("coral-top", coralRound, "pink", 426, 329, 13, 8, 0, 6), P("coral-right", coralRound, "pink", 453, 380, 15, 22, 0, 7), P("coral-middle", coralRound, "pink", 420, 371, 13, 22, 10, 7), P("coral-low", coralRound, "pink", 422, 404, 24, 2, 0, 4), P("coral-right-high", coralRound, "pink", 454, 350, 8, 4, -10, 5), P("coral-left-round", coralRound, "pink", 386, 368, 10, 24, -5, 10), P("coral-middle-round", coralRound, "pink", 421, 369, 13, 25, 10, 11), P("coral-right-round", coralRound, "pink", 454, 378, 15, 23, 0, 11)] },
  { id: "colour-seaweed", ms: 18000, patches: [P("first-weed-top", coralFirstWeed, "green", 271, 288, 2, 10, 0, 2), P("first-weed-low", coralFirstWeed, "green", 263, 328, 3, 8, 0, 3), P("second-weed", coralSecondWeed, "green", 331, 327, 2, 11, 0, 2), P("first-weed-middle", coralFirstWeed, "green", 269, 305, 2, 6, -10, 2), P("second-weed-low", coralSecondWeed, "green", 329, 365, 2, 12, 0, 2)] },
  { id: "colour-reef-fish", ms: 22000, patches: [P("fish-back", coralFish, "yellow", 371, 177, 23, 3, -5, 5), P("fish-belly", coralFish, "yellow", 408, 203, 18, 5, -5, 5), P("fish-tail", coralTail, "orange", 304, 193, 4, 10, -6, 3), P("fish-right", coralFish, "yellow", 421, 198, 7, 8, 0, 4), P("fish-left", coralFish, "yellow", 342, 191, 5, 9, -5, 4), P("fish-back-round", coralFish, "yellow", 373, 177, 24, 3, -5, 8), P("fish-right-round", coralFish, "yellow", 417, 201, 12, 7, -5, 8)] },
  { id: "colour-shell-fin", ms: 13000, patches: [P("shell", coralShell, "pink", 195, 374, 9, 8, 0, 5), P("fin", coralFin, "orange", 366, 202, 2.5, 1, 0, 2), P("fish-stripe", coralFish, "orange", 390, 190, 2, 15, 0, 3)] },
  { id: "colour-reef-layer", ms: 12000, patches: [P("rock", coralRock, "grey", 277, 379, 19, 10, 0, 6), P("coral-shade", coralRound, "red", 432, 395, 13, 4, 0, 4), P("rock-left", coralRock, "grey", 251, 378, 3, 8, -10, 3)] },
], { "fish-eye": { fill: "fill" }, "coral-main-branch": { ink: "#bd838a", width: 4 }, "coral-left-fork": { ink: "#bd838a", width: 4 }, "coral-right-fork": { ink: "#bd838a", width: 4 }, "coral-left-twig": { ink: "#bd838a", width: 3 }, "coral-right-twig": { ink: "#bd838a", width: 3 } });

export const EXPERT_COMPLETE_APPEARANCES = Object.freeze({ bird, fox, elephant, rabbit, cup, "fruit-bowl": bowl, "tree-path": tree, castle, lighthouse, coral });
