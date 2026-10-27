import { arc, cubic, ellipse, join, line, quad, rect } from "./lesson-geometry.js";
import { crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";
import { regionPatch } from "./crayon-regions.js";

const palette = {
  tan: { sdkColor: "orange", ink: "#c99b6c", grain: "#af8058" },
  brown: { sdkColor: "orange", ink: "#ab7656", grain: "#8c5b43" },
  cream: { sdkColor: "yellow", ink: "#e7cf9b", grain: "#c5ab77" },
  green: { sdkColor: "green", ink: "#82ad72", grain: "#638e55" },
  darkGreen: { sdkColor: "green", ink: "#648e64", grain: "#49704c" },
  orange: { sdkColor: "orange", ink: "#e6a05e", grain: "#c38147" },
  red: { sdkColor: "red", ink: "#d8786c", grain: "#b65c53" },
  yellow: { sdkColor: "yellow", ink: "#e7c45c", grain: "#c7a240" },
  blue: { sdkColor: "light-blue", ink: "#86b4ca", grain: "#6597b1" },
  deepBlue: { sdkColor: "blue", ink: "#6c91b0", grain: "#517391" },
  grey: { sdkColor: "grey", ink: "#aab2b6", grain: "#879499" },
  violet: { sdkColor: "light-violet", ink: "#b099c4", grain: "#917ba6" },
};

// These closed contours describe the subject, independently of the short inset
// crayon movements. Unpainted details and paper gaps remain part of each picture.
const closed = (...paths) => Object.freeze(join(...paths));
const patch = (id, boundary, colour, cx, cy, rx, ry, options = {}) =>
  regionPatch({ id, boundary, colour, cx, cy, rx, ry, width: 12, strands: 3, passes: 5, ...options });
const phase = (durationMs, patches) => ({
  paint: crayonPhase(durationMs, patches.flatMap((entry) => entry.gestures)),
  regions: Object.freeze(patches.flatMap((entry) => entry.regions)),
});
function appearance(phases, details = {}) {
  return Object.freeze({
    appearance: defineCrayonAppearance({
      palette,
      outlineStyles: { default: { color: "black", ink: "#68595b", fill: "none", dash: "draw", size: "m" }, ...details },
      colourPhases: Object.fromEntries(Object.entries(phases).map(([id, value]) => [id, value.paint])),
    }),
    regions: Object.freeze(Object.fromEntries(Object.entries(phases).map(([id, value]) => [id, value.regions]))),
  });
}

const dogHead = ellipse(300, 145, 80, 68);
const dogBody = closed(arc(300, 300, 82, 100, -72, 252), line([274.66, 204.89], [325.34, 204.89]));
const dogLeftEar = closed(cubic([231, 105], [175, 80], [175, 220], [233, 181]), line([233, 181], [231, 105]));
const dogRightEar = closed(cubic([369, 105], [425, 80], [425, 220], [367, 181]), line([367, 181], [369, 105]));
const dog = appearance({
  "colour-coat": phase(32000, [
    patch("dog-coat-cheek-left", dogHead, "tan", 247, 163, 18, 32, { width: 10 }),
    patch("dog-coat-cheek-right", dogHead, "tan", 353, 163, 18, 32, { width: 10 }),
    patch("dog-coat-forehead", dogHead, "tan", 300, 112, 58, 24, { angle: -8 }),
    patch("dog-coat-chest", dogBody, "tan", 300, 253, 64, 38, { width: 14, angle: -8 }),
    patch("dog-coat-middle", dogBody, "tan", 300, 294, 65, 34, { width: 14, angle: 7 }),
    patch("dog-coat-belly", dogBody, "tan", 300, 343, 58, 37, { width: 14, angle: -5 }),
  ]),
  "colour-ears": phase(18000, [
    patch("dog-ear-left", dogLeftEar, "brown", 208, 145, 14, 30, { width: 8 }),
    patch("dog-ear-right", dogRightEar, "brown", 392, 145, 14, 30, { width: 8 }),
    patch("dog-body-edge", dogBody, "brown", 355, 309, 15, 44, { width: 10, angle: 8 }),
  ]),
  "colour-patch": phase(8000, [patch("dog-optional-patch", ellipse(333, 282, 15, 24, -15), "brown", 333, 282, 7, 15, { width: 4, strands: 2 })]),
}, { "dog-left-eye": { fill: "fill" }, "dog-right-eye": { fill: "fill" }, "dog-nose": { fill: "fill" } });

const turtleShell = ellipse(270, 240, 145, 95);
const turtle = appearance({
  "colour-shell": phase(30000, [
    patch("turtle-shell-upper", turtleShell, "green", 270, 185, 96, 31, { width: 14, angle: -6 }),
    patch("turtle-shell-middle-left", turtleShell, "green", 205, 233, 58, 36, { width: 14, angle: -9 }),
    patch("turtle-shell-middle-right", turtleShell, "green", 334, 233, 58, 36, { width: 14, angle: 9 }),
    patch("turtle-shell-centre", turtleShell, "green", 270, 244, 44, 30, { width: 14, angle: 7 }),
    patch("turtle-shell-lower", turtleShell, "green", 270, 292, 100, 28, { width: 14, angle: 5 }),
  ]),
  "colour-small-parts": phase(17000, [
    patch("turtle-head-colour", ellipse(449, 240, 41, 31), "cream", 438, 241, 23, 18, { width: 8 }),
    patch("turtle-head-lower-colour", ellipse(449, 240, 41, 31), "cream", 467, 249, 9, 5, { width: 4, strands: 2 }),
    patch("turtle-front-foot-colour", closed(quad([349, 320], [355, 385], [386, 297]), line([386, 297], [349, 320])), "green", 365, 328, 9, 11, { width: 4, strands: 2 }),
    patch("turtle-back-foot-colour", closed(quad([177, 313], [176, 377], [215, 326]), line([215, 326], [177, 313])), "green", 190, 334, 9, 8, { width: 4, strands: 2 }),
  ]),
  "colour-shell-shadow": phase(15000, [
    patch("turtle-shell-shadow-left", turtleShell, "darkGreen", 211, 282, 50, 17, { width: 10 }),
    patch("turtle-shell-shadow-right", turtleShell, "darkGreen", 330, 282, 50, 17, { width: 10 }),
  ]),
}, { "turtle-eye": { fill: "fill" } });

const butterflyUpperLeft = closed(cubic([286, 184], [178, 90], [106, 125], [110, 212]), cubic([110, 212], [111, 273], [230, 290], [284, 251]), line([284, 251], [286, 184]));
const butterflyUpperRight = closed(cubic([314, 184], [422, 90], [494, 125], [490, 212]), cubic([490, 212], [489, 273], [370, 290], [316, 251]), line([316, 251], [314, 184]));
const butterflyLowerLeft = closed(cubic([284, 251], [220, 253], [140, 260], [155, 332]), cubic([155, 332], [175, 402], [267, 375], [291, 334]), line([291, 334], [284, 251]));
const butterflyLowerRight = closed(cubic([316, 251], [380, 253], [460, 260], [445, 332]), cubic([445, 332], [425, 402], [333, 375], [309, 334]), line([309, 334], [316, 251]));
const butterfly = appearance({
  "colour-upper-wings": phase(33000, [
    patch("butterfly-upper-left-top", butterflyUpperLeft, "orange", 190, 164, 64, 31, { width: 14, angle: -12 }),
    patch("butterfly-upper-left-middle", butterflyUpperLeft, "orange", 195, 216, 66, 38, { width: 14, angle: 9 }),
    patch("butterfly-upper-left-inner", butterflyUpperLeft, "orange", 255, 212, 15, 32, { width: 10 }),
    patch("butterfly-upper-right-top", butterflyUpperRight, "orange", 410, 164, 64, 31, { width: 14, angle: 12 }),
    patch("butterfly-upper-right-middle", butterflyUpperRight, "orange", 405, 216, 66, 38, { width: 14, angle: -9 }),
    patch("butterfly-upper-right-inner", butterflyUpperRight, "orange", 345, 212, 15, 32, { width: 10 }),
  ]),
  "colour-lower-wings": phase(28000, [
    patch("butterfly-lower-left", butterflyLowerLeft, "yellow", 215, 316, 58, 45, { width: 14, angle: -12 }),
    patch("butterfly-lower-left-tip", butterflyLowerLeft, "yellow", 218, 350, 33, 17, { width: 10 }),
    patch("butterfly-lower-right", butterflyLowerRight, "yellow", 385, 316, 58, 45, { width: 14, angle: 12 }),
    patch("butterfly-lower-right-tip", butterflyLowerRight, "yellow", 382, 350, 33, 17, { width: 10 }),
    patch("butterfly-body-colour", ellipse(300, 252, 16, 100), "brown", 300, 251, 8, 80, { width: 4, strands: 2 }),
  ]),
  "colour-wing-edges": phase(15000, [
    patch("butterfly-left-edge", butterflyUpperLeft, "red", 137, 205, 11, 31, { width: 8, angle: -8 }),
    patch("butterfly-right-edge", butterflyUpperRight, "red", 463, 205, 11, 31, { width: 8, angle: 8 }),
  ]),
}, { "butterfly-left-spot": { fill: "fill" }, "butterfly-right-spot": { fill: "fill" } });

const owlBody = ellipse(300, 239, 110, 143);
const owl = appearance({
  "colour-feathers": phase(35000, [
    patch("owl-left-face-edge", owlBody, "tan", 208, 196, 6, 40, { width: 6, strands: 2 }),
    patch("owl-right-face-edge", owlBody, "tan", 392, 196, 6, 40, { width: 6, strands: 2 }),
    patch("owl-left-shoulder", owlBody, "tan", 233, 244, 24, 23, { width: 10 }),
    patch("owl-right-shoulder", owlBody, "tan", 367, 244, 24, 23, { width: 10 }),
    patch("owl-belly", owlBody, "cream", 300, 298, 62, 64, { width: 14, angle: -8 }),
    patch("owl-lower-belly", owlBody, "cream", 300, 352, 54, 17),
    patch("owl-forehead", owlBody, "tan", 300, 130, 58, 25),
  ]),
  "colour-wings": phase(18000, [
    patch("owl-left-wing-colour", owlBody, "brown", 228, 290, 17, 48, { width: 12, angle: -12 }),
    patch("owl-right-wing-colour", owlBody, "brown", 372, 290, 17, 48, { width: 12, angle: 12 }),
  ]),
  "colour-perch": phase(15000, [
    patch("owl-branch-left-colour", rect(120, 409, 360, 17), "brown", 191, 417, 60, 2, { width: 4, strands: 2 }),
    patch("owl-branch-right-colour", rect(120, 409, 360, 17), "brown", 390, 417, 60, 2, { width: 4, strands: 2 }),
    patch("owl-beak-colour", line([290, 219], [310, 219], [300, 239], [290, 219]), "yellow", 300, 225, 2.5, 1, { width: 2, strands: 2, passes: 2 }),
  ]),
}, { "owl-left-pupil": { fill: "fill" }, "owl-right-pupil": { fill: "fill" } });

const hull = closed(quad([140, 300], [180, 420], [460, 300]), line([460, 300], [140, 300]));
const sailboat = appearance({
  "colour-hull": phase(22000, [
    patch("sailboat-hull-left", hull, "red", 235, 323, 56, 20, { width: 14, angle: -8 }),
    patch("sailboat-hull-right", hull, "red", 343, 323, 56, 18, { width: 14, angle: 8 }),
    patch("sailboat-hull-lower", hull, "red", 282, 345, 56, 10, { width: 10 }),
  ]),
  "colour-sails": phase(32000, [
    patch("sailboat-left-sail-colour", line([290, 85], [163, 273], [290, 273], [290, 85]), "cream", 245, 230, 75, 55, { angle: -10 }),
    patch("sailboat-right-sail-colour", line([290, 85], [420, 273], [290, 273], [290, 85]), "blue", 337, 230, 75, 55, { angle: 10 }),
    patch("sailboat-left-sail-top", line([290, 85], [163, 273], [290, 273], [290, 85]), "cream", 272, 167, 12, 32, { width: 9 }),
    patch("sailboat-right-sail-top", line([290, 85], [420, 273], [290, 273], [290, 85]), "blue", 309, 167, 12, 32, { width: 9 }),
    patch("sailboat-left-sail-bottom", line([290, 85], [163, 273], [290, 273], [290, 85]), "cream", 241, 257, 34, 5, { width: 8 }),
    patch("sailboat-right-sail-bottom", line([290, 85], [420, 273], [290, 273], [290, 85]), "blue", 343, 257, 34, 5, { width: 8 }),
  ]),
  "colour-hull-shade": phase(10000, [patch("sailboat-hull-shade", hull, "brown", 280, 347, 59, 4, { width: 6 })]),
});

const rocketBody = closed(line([235, 320], [235, 150]), cubic([235, 150], [235, 117], [279, 65], [300, 65]), cubic([300, 65], [321, 65], [365, 117], [365, 150]), line([365, 150], [365, 320], [235, 320]));
const rocketFlame = closed(cubic([260, 320], [250, 361], [275, 399], [300, 422]), cubic([300, 422], [325, 399], [350, 361], [340, 320]), line([340, 320], [260, 320]));
const rocket = appearance({
  "colour-rocket-body": phase(33000, [
    patch("rocket-nose-colour", rocketBody, "red", 300, 113, 43, 25, { angle: -8 }),
    patch("rocket-nose-upper-colour", rocketBody, "red", 300, 88, 21, 10, { width: 10 }),
    patch("rocket-body-upper-colour", rocketBody, "grey", 300, 160, 49, 11),
    patch("rocket-body-left-colour", rocketBody, "grey", 253, 225, 11, 62, { width: 10 }),
    patch("rocket-body-right-colour", rocketBody, "grey", 347, 225, 11, 62, { width: 10 }),
    patch("rocket-body-bottom-colour", rocketBody, "grey", 300, 274, 49, 24),
    patch("rocket-engine-colour", rocketBody, "grey", 300, 305, 45, 5, { width: 8 }),
  ]),
  "colour-fins-and-window": phase(20000, [
    patch("rocket-fin-left-colour", line([235, 270], [191, 335], [235, 320], [235, 270]), "red", 222, 311, 10, 11, { width: 5, passes: 4 }),
    patch("rocket-fin-right-colour", line([365, 270], [409, 335], [365, 320], [365, 270]), "red", 378, 311, 10, 11, { width: 5, passes: 4 }),
    patch("rocket-window-colour", ellipse(300, 207, 23, 23), "blue", 300, 207, 16, 14, { width: 6 }),
  ]),
  "colour-flame": phase(24000, [
    patch("rocket-flame-upper", rocketFlame, "orange", 300, 334, 24, 7, { width: 6 }),
    patch("rocket-flame-left", rocketFlame, "orange", 279, 354, 13, 24, { width: 8 }),
    patch("rocket-flame-right", rocketFlame, "orange", 321, 354, 13, 24, { width: 8 }),
    patch("rocket-flame-lower", rocketFlame, "orange", 300, 393, 10, 16, { width: 6 }),
    patch("rocket-flame-centre", rocketFlame, "yellow", 300, 370, 13, 23, { width: 8 }),
  ]),
}, { "rocket-left-button": { fill: "fill" }, "rocket-right-button": { fill: "fill" }, "rocket-upper-star": { fill: "fill" }, "rocket-lower-star": { fill: "fill" } });

const houseRoof = line([130, 190], [255, 85], [380, 190], [130, 190]);
const houseWalls = rect(130, 190, 250, 145);
const house = appearance({
  "colour-roof": phase(21000, [
    patch("house-roof-middle", houseRoof, "red", 255, 157, 100, 34, { width: 13, angle: -7 }),
    patch("house-roof-peak", houseRoof, "red", 255, 124, 22, 18, { width: 10 }),
    patch("house-roof-lower", houseRoof, "red", 255, 177, 92, 5, { width: 10 }),
  ]),
  "colour-walls": phase(32000, [
    patch("house-wall-top", houseWalls, "cream", 255, 212, 108, 10),
    patch("house-wall-left", houseWalls, "cream", 144, 270, 4, 47, { width: 5 }),
    patch("house-wall-left-gap", houseWalls, "cream", 219, 278, 6, 44, { width: 10 }),
    patch("house-wall-right-gap", houseWalls, "cream", 295, 278, 6, 44, { width: 10 }),
    patch("house-wall-right", houseWalls, "cream", 368, 270, 4, 47, { width: 5 }),
    patch("house-wall-lower-left", houseWalls, "cream", 183, 308, 35, 27),
    patch("house-wall-lower-right", houseWalls, "cream", 329, 308, 36, 27),
  ]),
  "colour-door-and-glass": phase(19000, [
    patch("house-door-colour", rect(235, 260, 45, 75), "brown", 257, 297, 15, 31, { width: 8 }),
    patch("house-left-glass", rect(156, 230, 46, 50), "blue", 179, 255, 16, 18, { width: 7 }),
    patch("house-right-glass", rect(310, 230, 46, 50), "blue", 333, 255, 16, 18, { width: 7 }),
  ]),
}, { "house-door-handle": { fill: "fill" } });

const train = appearance({
  "colour-engine": phase(29000, [
    patch("train-cab-left-colour", rect(140, 155, 110, 115), "green", 150, 211, 4, 43, { width: 5 }),
    patch("train-cab-right-colour", rect(140, 155, 110, 115), "green", 241, 189, 4, 25, { width: 5 }),
    patch("train-cab-bottom-colour", rect(140, 155, 110, 115), "green", 195, 249, 42, 17, { width: 10 }),
    patch("train-cab-top-colour", rect(140, 155, 110, 115), "green", 195, 167, 42, 5, { width: 6 }),
    patch("train-boiler-colour", ellipse(351, 237, 112, 33), "green", 351, 237, 100, 30, { angle: -7 }),
  ]),
  "colour-base-and-wheels": phase(28000, [
    patch("train-base-left-colour", rect(120, 270, 350, 45), "red", 218, 292, 85, 15, { width: 10 }),
    patch("train-base-middle-colour", rect(120, 270, 350, 45), "red", 300, 292, 30, 15, { width: 10 }),
    patch("train-base-right-colour", rect(120, 270, 350, 45), "red", 384, 292, 75, 15, { width: 10 }),
    patch("train-wheel-left-colour", ellipse(196, 337, 28, 28), "grey", 196, 337, 19, 17, { width: 8 }),
    patch("train-wheel-right-colour", ellipse(390, 337, 28, 28), "grey", 390, 337, 19, 17, { width: 8 }),
  ]),
  "colour-glass-and-shadow": phase(15000, [
    patch("train-window-colour", rect(160, 180, 70, 48), "blue", 195, 204, 25, 15, { width: 8 }),
    patch("train-boiler-shadow", ellipse(351, 237, 112, 33), "darkGreen", 349, 252, 68, 5, { width: 6 }),
  ]),
});

const cactusStem = closed(line([270, 344], [270, 136]), arc(300, 136, 30, 35, 180, 360), line([330, 136], [330, 344], [270, 344]));
const cactusPot = closed(quad([220, 350], [240, 435], [300, 428]), quad([300, 428], [360, 435], [380, 350]), line([380, 350], [220, 350]));
const cactusLeft = closed(line([270, 246], [214, 246], [214, 190]), arc(227, 190, 13, 13, 180, 360), line([240, 190], [240, 220], [270, 220], [270, 246]));
const cactusRight = closed(line([330, 213], [377, 213], [377, 160]), arc(390, 160, 13, 13, 180, 360), line([403, 160], [403, 239], [330, 239], [330, 213]));
const cactus = appearance({
  "colour-cactus": phase(30000, [
    patch("cactus-stem-middle", cactusStem, "green", 300, 232, 28, 110),
    patch("cactus-stem-upper", cactusStem, "green", 300, 139, 19, 25, { width: 10 }),
    patch("cactus-stem-lower", cactusStem, "green", 300, 321, 22, 10, { width: 10 }),
    patch("cactus-left-arm-colour", cactusLeft, "green", 227, 212, 5, 21, { width: 5 }),
    patch("cactus-left-arm-join", cactusLeft, "green", 249, 233, 18, 6, { width: 5 }),
    patch("cactus-right-arm-colour", cactusRight, "green", 390, 191, 5, 32, { width: 5 }),
    patch("cactus-right-arm-join", cactusRight, "green", 352, 225, 18, 6, { width: 5 }),
  ]),
  "colour-pot": phase(24000, [
    patch("cactus-pot-top-colour", cactusPot, "orange", 300, 365, 61, 8, { width: 10 }),
    patch("cactus-pot-middle-colour", cactusPot, "orange", 300, 391, 75, 34, { width: 14, angle: -8 }),
    patch("cactus-pot-lower-colour", cactusPot, "orange", 300, 416, 39, 8, { width: 10 }),
    patch("cactus-pot-rim-colour", ellipse(300, 350, 80, 17), "brown", 300, 351, 61, 5, { width: 6 }),
  ]),
  "colour-cactus-shade": phase(12000, [
    patch("cactus-stem-shadow", cactusStem, "darkGreen", 318, 245, 2, 86, { width: 4, strands: 2, passes: 4 }),
  ]),
});

const robot = appearance({
  "colour-metal": phase(35000, [
    patch("robot-head-top-colour", rect(235, 100, 130, 90), "grey", 300, 111, 53, 8, { width: 8 }),
    patch("robot-head-cheek-left", rect(235, 100, 130, 90), "grey", 249, 155, 7, 23, { width: 6 }),
    patch("robot-head-cheek-right", rect(235, 100, 130, 90), "grey", 351, 155, 7, 23, { width: 6 }),
    patch("robot-head-middle-colour", rect(235, 100, 130, 90), "grey", 300, 145, 13, 24, { width: 8 }),
    patch("robot-head-lower-colour", rect(235, 100, 130, 90), "grey", 300, 179, 44, 5, { width: 6 }),
    patch("robot-body-bottom-colour", rect(220, 210, 160, 130), "grey", 300, 318, 68, 13),
    patch("robot-body-top-colour", rect(220, 210, 160, 130), "grey", 300, 226, 68, 12),
    patch("robot-body-left-colour", rect(220, 210, 160, 130), "grey", 239, 275, 10, 40, { width: 10 }),
    patch("robot-body-right-colour", rect(220, 210, 160, 130), "grey", 361, 275, 10, 40, { width: 10 }),
  ]),
  "colour-control-panel": phase(20000, [
    patch("robot-panel-left-colour", rect(260, 244, 80, 52), "blue", 282, 270, 12, 16, { width: 7 }),
    patch("robot-panel-right-colour", rect(260, 244, 80, 52), "blue", 318, 270, 12, 16, { width: 7 }),
    patch("robot-panel-middle-colour", rect(260, 244, 80, 52), "blue", 300, 270, 8, 16, { width: 6, passes: 4 }),
    patch("robot-left-hand-colour", ellipse(148, 286, 14, 14), "yellow", 148, 286, 6, 5, { width: 4, strands: 2, passes: 4 }),
    patch("robot-right-hand-colour", ellipse(451, 222, 14, 14), "yellow", 451, 222, 6, 5, { width: 4, strands: 2, passes: 4 }),
  ]),
  "colour-metal-shade": phase(14000, [
    patch("robot-body-side-colour", rect(220, 210, 160, 130), "deepBlue", 365, 275, 3, 43, { width: 4 }),
    patch("robot-head-side-colour", rect(235, 100, 130, 90), "deepBlue", 352, 148, 3, 29, { width: 3, strands: 2 }),
  ]),
}, { "robot-left-button": { fill: "fill" }, "robot-right-button": { fill: "fill" } });

export const INTERMEDIATE_COMPLETE_APPEARANCES = Object.freeze({ dog, turtle, butterfly, owl, sailboat, rocket, house, train, cactus, robot });
