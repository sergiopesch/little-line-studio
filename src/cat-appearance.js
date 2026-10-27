import { quad } from "./lesson-geometry.js";
import { crayonGesture, crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";

const curve = (id, colour, from, bend, to, options) =>
  crayonGesture(id, quad(from, bend, to), colour, options);

// Leave room for the whole pressure-sensitive crayon, including its grain and
// round ends. The teacher's hand stops inside the line rather than on it.
const furPath = (path, index, side) => {
  const centre = index < 17 ? [300, 250] : [side === "left" ? 215 : 385, 132];
  const inset = index < 17 ? 0.91 : 0.8;
  return path.map(([x, y]) => [centre[0] + (x - centre[0]) * inset, centre[1] + (y - centre[1]) * inset]);
};

// The order moves around small patches, turns back, then lifts the crayon.
// These are authored hand movements, never a scan over a polygon.
const leftFur = [
  [[246, 153], [217, 160], [193, 185]],
  [[193, 194], [217, 170], [254, 157]],
  [[268, 151], [244, 163], [218, 190]],
  [[221, 198], [248, 175], [280, 154]],
  [[288, 165], [266, 185], [240, 207]],
  [[245, 217], [266, 199], [291, 180]],
  [[295, 191], [282, 228], [277, 247]],
  [[180, 205], [169, 231], [171, 259]],
  [[180, 273], [179, 243], [192, 216]],
  [[201, 216], [190, 246], [192, 276]],
  [[203, 287], [223, 263], [240, 236]],
  [[220, 244], [231, 258], [242, 277]],
  [[230, 314], [244, 291], [250, 271]],
  [[189, 288], [199, 316], [225, 335]],
  [[237, 345], [214, 331], [204, 311]],
  [[219, 337], [249, 351], [276, 353]],
  [[305, 349], [274, 348], [251, 332]],
  [[199, 111], [208, 125], [219, 140]],
  [[228, 142], [211, 135], [200, 120]],
  [[199, 137], [200, 148], [206, 155]],
].map((path, index) => curve(`cat-left-fur-${index}`, "ginger", ...furPath(path, index, "left"),
  { width: index >= 17 ? 10 : 20, strands: 5, opacity: 0.78 }));

const rightFur = [
  [[318, 156], [343, 173], [365, 193]],
  [[373, 189], [350, 165], [331, 153]],
  [[351, 155], [384, 165], [401, 190]],
  [[406, 203], [385, 185], [366, 179]],
  [[304, 171], [323, 189], [340, 209]],
  [[329, 214], [314, 200], [306, 190]],
  [[308, 205], [319, 229], [323, 248]],
  [[416, 211], [428, 235], [428, 259]],
  [[417, 271], [419, 240], [408, 221]],
  [[398, 223], [407, 250], [407, 281]],
  [[395, 294], [377, 268], [360, 237]],
  [[377, 247], [365, 260], [357, 278]],
  [[366, 314], [355, 294], [351, 274]],
  [[414, 290], [403, 318], [383, 334]],
  [[368, 344], [390, 330], [399, 312]],
  [[382, 338], [352, 352], [327, 354]],
  [[296, 350], [326, 347], [347, 333]],
  [[400, 111], [389, 126], [379, 141]],
  [[370, 145], [389, 137], [400, 123]],
  [[402, 139], [400, 150], [394, 157]],
].map((path, index) => curve(`cat-right-fur-${index}`, "ginger", ...furPath(path, index, "right"),
  { width: index >= 17 ? 10 : 20, strands: 5, opacity: 0.78 }));

const details = [
  ...[
    [[264, 268], [278, 261], [289, 264]],
    [[285, 276], [271, 277], [257, 286]],
    [[259, 296], [275, 308], [289, 313]],
    [[313, 265], [330, 266], [340, 277]],
    [[340, 288], [327, 284], [315, 278]],
    [[314, 312], [329, 306], [339, 296]],
  ].map((path, index) => curve(`cat-muzzle-${index}`, "cream", ...path, { width: 20 })),
  curve("cat-left-ear-pink-up", "pink", [207, 137], [205, 125], [203, 117], { width: 7 }),
  curve("cat-left-ear-pink-down", "pink", [210, 125], [217, 133], [226, 139], { width: 7 }),
  curve("cat-right-ear-pink-down", "pink", [397, 117], [390, 129], [379, 140], { width: 7 }),
  curve("cat-right-ear-pink-up", "pink", [389, 140], [396, 133], [395, 126], { width: 7 }),
  curve("cat-nose-pink-left", "pink", [298, 264], [299, 265], [300, 266], { width: 2, strands: 3 }),
  curve("cat-nose-pink-right", "pink", [300, 266], [301, 265], [302, 264], { width: 2, strands: 3 }),
];

const patterns = [
  [[272, 155], [280, 172], [282, 184]],
  [[300, 149], [304, 167], [300, 182]],
  [[328, 155], [320, 172], [318, 184]],
  [[180, 272], [193, 276], [203, 280]],
  [[204, 295], [196, 292], [184, 292]],
  [[420, 272], [407, 276], [397, 280]],
  [[396, 295], [404, 292], [416, 292]],
].map((path, index) => curve(`cat-ginger-pattern-${index}`, "dark-ginger", ...path,
  { width: 6, opacity: 0.82, strands: 3 }));

export const CAT_APPEARANCE = defineCrayonAppearance({
  palette: {
    ginger: { sdkColor: "orange", ink: "#e99b45", grain: "#cf782a" },
    "dark-ginger": { sdkColor: "orange", ink: "#c67127", grain: "#ab5b1f" },
    cream: { sdkColor: "yellow", ink: "#f2dfbc", grain: "#dec79f" },
    pink: { sdkColor: "light-red", ink: "#eea3a2", grain: "#d58086" },
  },
  outlineStyles: {
    default: { color: "black", fill: "none", dash: "draw", size: "m" },
    "left-eye": { fill: "fill" },
    "right-eye": { fill: "fill" },
    "little-nose": { size: "s" },
    ...Object.fromEntries([
      "left-whisker-upper", "left-whisker-middle", "left-whisker-lower",
      "right-whisker-upper", "right-whisker-middle", "right-whisker-lower",
    ].map((id) => [id, { size: "s" }])),
  },
  colourPhases: {
    "colour-fur": crayonPhase(20000, leftFur),
    "colour-fur-right": crayonPhase(20000, rightFur),
    "colour-details": crayonPhase(14000, details),
    "colour-patterns": crayonPhase(12000, patterns),
  },
});
