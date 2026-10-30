// @ts-check
/** @typedef {import("./drawing/contracts.ts").Coordinate} Coordinate */
/** @typedef {import("./drawing/contracts.ts").QuadraticCurve} QuadraticCurve */
import { line, quad } from "./lesson-geometry.js";
import { crayonGesture, crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";

/**
 * @param {string} id @param {string} colour
 * @param {Coordinate} from @param {Coordinate} bend @param {Coordinate} to
 * @param {import("./drawing/contracts.ts").CrayonGestureOptions} options
 */
const curve = (id, colour, from, bend, to, options) =>
  crayonGesture(id, quad(from, bend, to), colour, options);
/** @param {QuadraticCurve} path @returns {QuadraticCurve} */
const centrePath = (path) => {
  /** @param {Coordinate} point @returns {Coordinate} */
  const move = ([x, y]) => [300 + (x - 300) * 0.93, 240 + (y - 240) * 0.93];
  return [move(path[0]), move(path[1]), move(path[2])];
};

/** @type {readonly QuadraticCurve[]} */
const leftCentrePaths = [
  [[303, 155], [258, 163], [233, 192]],
  [[226, 203], [247, 182], [280, 167]],
  [[305, 173], [268, 187], [245, 211]],
  [[232, 222], [254, 209], [282, 193]],
  [[306, 201], [281, 217], [257, 237]],
  [[240, 237], [271, 234], [307, 228]],
  [[218, 220], [216, 241], [225, 260]],
  [[237, 270], [230, 250], [234, 233]],
  [[246, 244], [252, 260], [260, 277]],
  [[281, 273], [270, 255], [260, 244]],
  [[307, 244], [285, 254], [272, 270]],
  [[237, 277], [249, 296], [269, 309]],
  [[282, 318], [259, 307], [248, 288]],
  [[257, 290], [275, 302], [305, 312]],
  [[307, 290], [287, 286], [275, 277]],
  [[307, 323], [283, 323], [267, 317]],
];
const leftCentre = leftCentrePaths.map((path, index) => curve(`sun-left-yellow-${index}`, "yellow", ...centrePath(path),
  { width: 18, opacity: 0.83, strands: 5 }));

/** @type {readonly QuadraticCurve[]} */
const rightCentrePaths = [
  [[314, 156], [341, 163], [365, 186]],
  [[373, 197], [353, 180], [325, 169]],
  [[295, 181], [331, 189], [355, 211]],
  [[365, 223], [342, 207], [320, 198]],
  [[296, 207], [325, 220], [345, 234]],
  [[359, 242], [337, 232], [312, 224]],
  [[382, 221], [385, 245], [376, 261]],
  [[364, 272], [370, 252], [364, 234]],
  [[353, 246], [350, 261], [340, 280]],
  [[320, 274], [329, 254], [340, 244]],
  [[295, 239], [315, 250], [326, 261]],
  [[366, 279], [353, 300], [335, 311]],
  [[318, 319], [340, 306], [352, 289]],
  [[342, 290], [326, 300], [308, 309]],
  [[294, 294], [317, 288], [329, 283]],
  [[309, 325], [326, 321], [341, 314]],
];
const rightCentre = rightCentrePaths.map((path, index) => curve(`sun-right-yellow-${index}`, "yellow", ...centrePath(path),
  { width: 18, opacity: 0.83, strands: 5 }));

// These narrow strokes follow the actual ray outlines. In particular the lower
// left ray follows its curve instead of taking a shortcut across the bend.
const rays = [
  line([300, 126], [300, 71]),
  line([300, 354], [300, 409]),
  line([186, 240], [121, 240]),
  line([414, 240], [479, 240]),
  line([220, 160], [179, 119]),
  line([380, 160], [421, 119]),
  quad([224, 316], [190, 330], [174, 368]).slice(3, -3).reverse(),
  line([421, 361], [380, 320]),
].map((points, index) => crayonGesture(`sun-orange-ray-${index}`, points, "orange",
  { width: 2, opacity: 0.84, strands: 3 }));

/** @type {readonly QuadraticCurve[]} */
const warmthPaths = [
  [[249, 181], [266, 165], [280, 163]],
  [[321, 164], [338, 170], [353, 184]],
  [[218, 235], [218, 250], [225, 263]],
  [[381, 237], [382, 252], [376, 266]],
  [[247, 285], [255, 300], [271, 309]],
  [[330, 309], [345, 299], [353, 284]],
  [[244, 251], [251, 248], [258, 252]],
  [[342, 252], [349, 248], [356, 251]],
];
const warmth = warmthPaths.map((path, index) => curve(`sun-warmth-${index}`, "ochre", ...path,
  { width: index > 5 ? 8 : 9, opacity: 0.6 }));

export const SUN_APPEARANCE = defineCrayonAppearance({
  palette: {
    yellow: { sdkColor: "yellow", ink: "#f6ce32", grain: "#e6b821" },
    orange: { sdkColor: "orange", ink: "#efa331", grain: "#d88720" },
    ochre: { sdkColor: "orange", ink: "#e8ab3b", grain: "#cd9029" },
  },
  outlineStyles: {
    default: { color: "black", fill: "none", dash: "draw", size: "m" },
    "sun-left-eye": { fill: "fill" },
    "sun-right-eye": { fill: "fill" },
    ...Object.fromEntries([
      "upward-ray", "downward-ray", "left-ray", "right-ray", "upper-left-ray",
      "upper-right-ray", "lower-left-ray", "lower-right-ray",
    ].map((id) => [id, { color: "orange", ink: "#b57c24", width: 7 }])),
  },
  colourPhases: {
    "colour-centre-left": crayonPhase(20000, leftCentre),
    "colour-centre-right": crayonPhase(20000, rightCentre),
    "colour-rays": crayonPhase(12000, rays),
    "colour-warmth": crayonPhase(10000, warmth),
  },
});
