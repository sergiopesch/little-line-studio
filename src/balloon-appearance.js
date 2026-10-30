// @ts-check
import { arc, cubic, ellipse, quad } from "./lesson-geometry.js";
import { crayonGesture, crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";

/** @param {readonly import("./drawing/contracts.ts").DrawingPoint[]} points */
const fixedPath = (points) => Object.freeze(points.map(point => Object.freeze(point)));
export const BALLOON_BODY = fixedPath(ellipse(300, 190, 105, 132));
export const BALLOON_LEFT_BOW = fixedPath(cubic([300, 333], [245, 302], [242, 365], [300, 333]));
export const BALLOON_RIGHT_BOW = fixedPath(cubic([300, 333], [345, 301], [363, 363], [300, 333]));
export const BALLOON_SHINE = fixedPath(arc(300, 190, 78, 105, 210, 258));

const bodyOptions = { width: 16, opacity: 0.8, strands: 4 };
/** @param {string} side @param {readonly import("./drawing/contracts.ts").QuadraticCurve[]} paths */
const curves = (side, paths) => paths.map((path, index) =>
  crayonGesture(`balloon-${side}-red-${index}`, quad(...path), "red", bodyOptions));

// Small changes of direction and real pen lifts model a hand colouring patches.
// The upper-left space remains white beside the shine; no flat fill hides it.
const leftBody = curves("left", [
  [[253, 159], [236, 171], [223, 188]],
  [[222, 203], [245, 185], [270, 170]],
  [[287, 160], [267, 185], [250, 202]],
  [[232, 218], [255, 208], [280, 192]],
  [[294, 184], [274, 210], [253, 226]],
  [[221, 234], [235, 247], [254, 252]],
  [[272, 237], [261, 258], [250, 271]],
  [[239, 266], [251, 281], [270, 289]],
  [[287, 277], [267, 287], [261, 295]],
  [[280, 300], [287, 303], [299, 302]],
  [[301, 289], [283, 280], [271, 266]],
  [[296, 246], [277, 251], [269, 261]],
  [[296, 223], [281, 229], [266, 237]],
  [[286, 207], [302, 214], [309, 227]],
]);
const rightBody = curves("right", [
  [[308, 85], [331, 90], [349, 106]],
  [[366, 120], [343, 107], [319, 101]],
  [[307, 115], [332, 127], [355, 142]],
  [[375, 148], [355, 137], [335, 137]],
  [[303, 141], [324, 154], [349, 164]],
  [[385, 166], [375, 187], [375, 208]],
  [[365, 215], [370, 197], [366, 181]],
  [[351, 180], [348, 198], [353, 219]],
  [[330, 184], [327, 209], [338, 228]],
  [[302, 175], [314, 190], [318, 210]],
  [[382, 230], [373, 250], [360, 262]],
  [[351, 250], [359, 272], [341, 289]],
  [[318, 300], [339, 294], [351, 281]],
  [[304, 272], [322, 281], [331, 295]],
  [[307, 246], [322, 263], [338, 271]],
  [[328, 234], [349, 234], [366, 242]],
]);
/** @type {readonly {id: string, boundary: readonly import("./drawing/contracts.ts").DrawingPoint[], path: import("./drawing/contracts.ts").QuadraticCurve}[]} */
const bowPaths = [
  { id: "left-bow-upper", boundary: BALLOON_LEFT_BOW, path: [[267, 331], [276, 330], [283, 331]] },
  { id: "left-bow-lower", boundary: BALLOON_LEFT_BOW, path: [[283, 336], [275, 337], [267, 336]] },
  { id: "right-bow-upper", boundary: BALLOON_RIGHT_BOW, path: [[319, 332], [326, 331], [333, 332]] },
  { id: "right-bow-lower", boundary: BALLOON_RIGHT_BOW, path: [[333, 336], [326, 337], [319, 336]] },
];
const bow = bowPaths.map(({ id, path }) =>
  crayonGesture(`balloon-${id}`, quad(...path), "yellow", { width: 3, opacity: 0.9, strands: 2 }));

// Intended closed regions are independent of the inset crayon paths. The
// renderer keeps native SDK pressure strokes; these polygons support validation.
export const BALLOON_COLOUR_REGIONS = Object.freeze({
  "colour-body-left": Object.freeze(leftBody.map((gesture) => Object.freeze({ gestureId: gesture.id, boundary: BALLOON_BODY }))),
  "colour-body-right": Object.freeze(rightBody.map((gesture) => Object.freeze({ gestureId: gesture.id, boundary: BALLOON_BODY }))),
  "colour-bow": Object.freeze(bow.map((gesture, index) => {
    const path = bowPaths[index];
    if (!path) throw new TypeError("A bow gesture needs its authored contour.");
    return Object.freeze({ gestureId: gesture.id, boundary: path.boundary });
  })),
});

export const BALLOON_APPEARANCE = defineCrayonAppearance({
  palette: {
    red: { sdkColor: "red", ink: "#e7766c", grain: "#ce5d57" },
    yellow: { sdkColor: "yellow", ink: "#edc347", grain: "#d4a72e" },
  },
  outlineStyles: {
    default: { color: "black", ink: "#68555a", fill: "none", dash: "draw", size: "m" },
    "flowing-string": { ink: "#766b70", width: 2.1, size: "s" },
    "balloon-shine": { ink: "#d9958c", width: 1.5, size: "s" },
    "upper-dot": { fill: "fill" },
    "middle-dot": { fill: "fill" },
    "lower-dot": { fill: "fill" },
  },
  colourPhases: {
    "colour-body-left": crayonPhase(16000, leftBody),
    "colour-body-right": crayonPhase(16000, rightBody),
    "colour-bow": crayonPhase(8000, bow),
  },
});
