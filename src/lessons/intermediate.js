// @ts-check
import {
  line,
  ellipse,
  arc,
  quad,
  cubic,
  join,
  rect,
  dot,
  mark,
} from "../lesson-geometry.js";
import { defineLesson } from "../lesson-model.js";

/** @param {number} x @param {number} y @param {number} w @param {number} h */
function cloud(x, y, w, h) {
  /** @type {import("../drawing/contracts.ts").Coordinate} */
  const start = [x + w * 0.2, y + h * 0.85];
  return join(
    cubic(
      start,
      [x, y + h * 0.9],
      [x - w * 0.05, y + h * 0.35],
      [x + w * 0.2, y + h * 0.32],
    ),
    cubic(
      [x + w * 0.2, y + h * 0.32],
      [x + w * 0.23, y - h * 0.1],
      [x + w * 0.65, y - h * 0.1],
      [x + w * 0.7, y + h * 0.3],
    ),
    cubic(
      [x + w * 0.7, y + h * 0.3],
      [x + w * 0.99, y + h * 0.15],
      [x + w * 1.12, y + h * 0.85],
      [x + w * 0.78, y + h * 0.86],
    ),
    cubic(
      [x + w * 0.78, y + h * 0.86],
      [x + w * 0.6, y + h * 0.92],
      [x + w * 0.4, y + h * 0.85],
      start,
    ),
  );
}

const dog = defineLesson("dog", [
  mark("dog-head", ellipse(300, 145, 80, 68), 9500, true),
  mark(
    "dog-left-ear",
    cubic([231, 105], [175, 80], [175, 220], [233, 181]),
    8000,
  ),
  mark(
    "dog-right-ear",
    cubic([369, 105], [425, 80], [425, 220], [367, 181]),
    8000,
  ),
  mark("dog-body", arc(300, 300, 82, 100, -72, 252), 10000),
  mark("dog-left-leg", line([278, 280], [278, 383]), 7000),
  mark("dog-right-leg", line([322, 280], [322, 383]), 7000),
  mark("dog-left-paw", ellipse(278, 392, 19, 9), 4500, true),
  mark("dog-right-paw", ellipse(322, 392, 19, 9), 4500, true),
  mark("dog-left-haunch", quad([240, 300], [170, 335], [228, 390]), 8000),
  mark("dog-right-haunch", quad([360, 300], [430, 335], [372, 390]), 8000),
  mark("dog-tail", cubic([371, 350], [455, 360], [435, 280], [400, 310]), 9000),
  mark("dog-left-eye", dot(275, 135, 4), 2500, true),
  mark("dog-right-eye", dot(325, 135, 4), 2500, true),
  mark(
    "dog-nose",
    line([291, 157], [309, 157], [300, 169], [291, 157]),
    6000,
    true,
  ),
  mark("dog-nose-line", line([300, 169], [300, 181]), 3000),
  mark("dog-left-mouth", quad([300, 181], [288, 198], [279, 183]), 6000),
  mark("dog-right-mouth", quad([300, 181], [312, 198], [321, 183]), 6000),
  mark("dog-collar", arc(300, 201, 52, 14, 0, 180), 7000),
  mark("dog-patch", ellipse(333, 282, 15, 24, -15), 7000, true),
]);

const turtle = defineLesson("turtle", [
  mark("turtle-shell", ellipse(270, 240, 145, 95), 10000, true),
  mark("turtle-head", ellipse(449, 240, 41, 31), 8000, true),
  mark("turtle-front-foot", quad([349, 320], [355, 385], [386, 297]), 7000),
  mark("turtle-back-foot", quad([177, 313], [176, 377], [215, 326]), 7000),
  mark("turtle-tail", line([126, 240], [88, 252], [131, 260]), 6000),
  mark("turtle-eye", dot(465, 231, 4), 2500, true),
  mark("turtle-mouth", quad([462, 253], [474, 258], [478, 248]), 5000),
  mark("turtle-shell-rim", arc(270, 250, 139, 67, 20, 160), 9000),
  mark(
    "turtle-centre-pattern",
    line(
      [240, 200],
      [288, 200],
      [310, 232],
      [289, 266],
      [242, 266],
      [220, 232],
      [240, 200],
    ),
    10000,
    true,
  ),
  mark("turtle-upper-left", line([240, 200], [196, 159]), 6000),
  mark("turtle-upper-right", line([288, 200], [326, 152]), 6000),
  mark("turtle-right-pattern", line([310, 232], [414, 240]), 7000),
  mark("turtle-lower-right", line([289, 266], [335, 309]), 6000),
  mark("turtle-lower-left", line([242, 266], [205, 309]), 6000),
  mark("turtle-left-pattern", line([220, 232], [125, 240]), 7000),
  mark("turtle-front-toe", line([370, 322], [370, 331]), 3000),
  mark("turtle-back-toe", line([193, 334], [193, 342]), 3000),
  mark("turtle-ground", line([110, 349], [486, 349]), 9000),
]);

const butterfly = defineLesson("butterfly", [
  mark("butterfly-body", ellipse(300, 252, 16, 100), 10000, true),
  mark("butterfly-head", ellipse(300, 125, 27, 27), 8000, true),
  mark(
    "butterfly-upper-left",
    join(
      cubic([286, 184], [178, 90], [106, 125], [110, 212]),
      cubic([110, 212], [111, 273], [230, 290], [284, 251]),
    ),
    10000,
  ),
  mark(
    "butterfly-upper-right",
    join(
      cubic([314, 184], [422, 90], [494, 125], [490, 212]),
      cubic([490, 212], [489, 273], [370, 290], [316, 251]),
    ),
    10000,
  ),
  mark(
    "butterfly-lower-left",
    join(
      cubic([284, 251], [220, 253], [140, 260], [155, 332]),
      cubic([155, 332], [175, 402], [267, 375], [291, 334]),
    ),
    9500,
  ),
  mark(
    "butterfly-lower-right",
    join(
      cubic([316, 251], [380, 253], [460, 260], [445, 332]),
      cubic([445, 332], [425, 402], [333, 375], [309, 334]),
    ),
    9500,
  ),
  mark(
    "butterfly-left-antenna",
    cubic([286, 106], [262, 75], [258, 72], [242, 84]),
    7000,
  ),
  mark(
    "butterfly-right-antenna",
    cubic([314, 106], [338, 75], [342, 72], [358, 84]),
    7000,
  ),
  mark("butterfly-left-upper-vein", line([286, 213], [168, 190]), 7000),
  mark("butterfly-right-upper-vein", line([314, 213], [432, 190]), 7000),
  mark("butterfly-left-lower-vein", line([290, 282], [196, 328]), 7000),
  mark("butterfly-right-lower-vein", line([310, 282], [404, 328]), 7000),
  mark("butterfly-left-oval", ellipse(179, 192, 23, 31, -30), 8000, true),
  mark(
    "butterfly-right-diamond",
    line([412, 156], [443, 187], [412, 218], [383, 187], [412, 156]),
    8000,
    true,
  ),
  mark("butterfly-left-spot", dot(210, 330, 6), 2500, true),
  mark("butterfly-right-spot", dot(390, 330, 6), 2500, true),
  mark("butterfly-upper-band", line([286, 236], [314, 236]), 3000),
  mark("butterfly-lower-band", line([285, 268], [315, 268]), 3000),
]);

const owl = defineLesson("owl", [
  mark("owl-body", ellipse(300, 239, 110, 143), 10000, true),
  mark("owl-left-tuft", line([230, 131], [224, 77], [269, 102]), 7000),
  mark("owl-right-tuft", line([331, 102], [376, 77], [370, 131]), 7000),
  mark("owl-left-eye", ellipse(253, 185, 31, 31), 8000, true),
  mark("owl-right-eye", ellipse(347, 185, 31, 31), 8000, true),
  mark("owl-left-pupil", dot(253, 185, 6), 2500, true),
  mark("owl-right-pupil", dot(347, 185, 6), 2500, true),
  mark(
    "owl-beak",
    line([290, 219], [310, 219], [300, 239], [290, 219]),
    6000,
    true,
  ),
  mark(
    "owl-left-wing",
    cubic([215, 229], [238, 236], [243, 304], [254, 326]),
    8000,
  ),
  mark(
    "owl-right-wing",
    cubic([385, 229], [362, 236], [357, 304], [346, 326]),
    8000,
  ),
  mark("owl-branch-top", line([120, 409], [480, 409]), 9000),
  mark("owl-branch-bottom", line([120, 426], [480, 426]), 9000),
  mark("owl-left-leg", line([271, 375], [271, 409]), 3000),
  mark("owl-right-leg", line([329, 375], [329, 409]), 3000),
  mark("owl-left-claw", arc(271, 409, 8, 8, 0, 180), 5000),
  mark("owl-right-claw", arc(329, 409, 8, 8, 0, 180), 5000),
  mark("owl-upper-feather", line([280, 270], [287, 280], [294, 270]), 3000),
  mark("owl-middle-feather", line([307, 286], [314, 296], [321, 286]), 3000),
  mark("owl-lower-feather", line([280, 305], [287, 315], [294, 305]), 3000),
  mark(
    "owl-branch-leaf",
    join(
      quad([445, 409], [480, 375], [470, 402]),
      quad([470, 402], [459, 413], [445, 409]),
    ),
    7000,
    true,
  ),
]);

const sailboat = defineLesson("sailboat", [
  mark("boat-deck", line([140, 300], [460, 300]), 9000),
  mark("boat-hull", quad([140, 300], [180, 420], [460, 300]), 9500),
  mark("boat-mast", line([290, 300], [290, 85]), 9000),
  mark("boat-left-sail-edge", line([290, 85], [163, 273]), 9000),
  mark("boat-left-sail-base", line([163, 273], [290, 273]), 7000),
  mark("boat-right-sail-edge", line([290, 85], [420, 273]), 9000),
  mark("boat-right-sail-base", line([420, 273], [290, 273]), 7000),
  mark("boat-left-porthole", ellipse(245, 325, 10, 10), 4500, true),
  mark("boat-right-porthole", ellipse(341, 325, 10, 10), 4500, true),
  mark("boat-bow-detail", quad([439, 306], [425, 311], [404, 316]), 6000),
  mark(
    "boat-water",
    join(
      cubic([90, 360], [125, 344], [160, 376], [195, 360]),
      cubic([195, 360], [230, 344], [265, 376], [300, 360]),
      cubic([300, 360], [335, 344], [370, 376], [405, 360]),
      cubic([405, 360], [440, 344], [475, 376], [510, 360]),
    ),
    10000,
  ),
  mark(
    "boat-flag",
    line([290, 85], [250, 75], [290, 64], [290, 85]),
    7000,
    true,
  ),
  mark(
    "boat-second-wave",
    cubic([170, 388], [250, 368], [350, 408], [430, 388]),
    9000,
  ),
  mark("boat-sun", ellipse(505, 110, 28, 28), 8000, true),
  mark("boat-cloud", cloud(45, 70, 110, 60), 10000, true),
  mark("boat-bird-left-wing", quad([418, 142], [429, 129], [441, 142]), 5000),
  mark("boat-bird-right-wing", quad([441, 142], [453, 129], [466, 142]), 5000),
]);

const rocket = defineLesson("rocket", [
  mark(
    "rocket-body",
    join(
      line([235, 320], [235, 150]),
      cubic([235, 150], [235, 117], [279, 65], [300, 65]),
      cubic([300, 65], [321, 65], [365, 117], [365, 150]),
      line([365, 150], [365, 320], [235, 320]),
    ),
    10000,
    true,
  ),
  mark("rocket-nose-section", quad([245, 130], [300, 155], [355, 130]), 8000),
  mark("rocket-window", ellipse(300, 207, 31, 31), 8000, true),
  mark("rocket-window-rim", ellipse(300, 207, 23, 23), 7000, true),
  mark(
    "rocket-left-fin",
    line([235, 270], [191, 335], [235, 320], [235, 270]),
    8000,
    true,
  ),
  mark(
    "rocket-right-fin",
    line([365, 270], [409, 335], [365, 320], [365, 270]),
    8000,
    true,
  ),
  mark("rocket-engine-section", quad([235, 302], [300, 315], [365, 302]), 8000),
  mark(
    "rocket-flame",
    join(
      cubic([260, 320], [250, 361], [275, 399], [300, 422]),
      cubic([300, 422], [325, 399], [350, 361], [340, 320]),
      line([340, 320], [260, 320]),
    ),
    10000,
    true,
  ),
  mark(
    "rocket-inner-flame",
    join(
      quad([281, 344], [281, 385], [300, 400]),
      quad([300, 400], [320, 376], [319, 344]),
    ),
    8000,
  ),
  mark("rocket-left-stripe", line([250, 162], [250, 285]), 7000),
  mark("rocket-right-stripe", line([350, 162], [350, 285]), 7000),
  mark("rocket-left-button", dot(283, 269, 4), 2500, true),
  mark("rocket-right-button", dot(316, 269, 4), 2500, true),
  mark("rocket-planet", ellipse(113, 166, 42, 34), 9000, true),
  mark("rocket-planet-ring", ellipse(113, 166, 57, 11, -17), 8000, true),
  mark("rocket-upper-star", dot(444, 108, 4), 2500, true),
  mark("rocket-lower-star", dot(484, 192, 3), 2500, true),
  mark(
    "rocket-moon",
    join(
      cubic([490, 257], [441, 260], [444, 324], [490, 326]),
      cubic([490, 326], [466, 304], [466, 279], [490, 257]),
    ),
    9000,
    true,
  ),
]);

const house = defineLesson("house", [
  mark("house-walls", rect(130, 190, 250, 145), 9500, true),
  mark("house-left-roof", line([130, 190], [255, 85]), 8000),
  mark("house-right-roof", line([255, 85], [380, 190]), 8000),
  mark("house-door", rect(235, 260, 45, 75), 8000, true),
  mark("house-door-handle", dot(270, 300, 3), 2500, true),
  mark("house-left-window", rect(156, 230, 46, 50), 8000, true),
  mark("house-right-window", rect(310, 230, 46, 50), 8000, true),
  mark("house-left-window-bar", line([179, 230], [179, 280]), 3000),
  mark("house-right-window-bar", line([333, 230], [333, 280]), 3000),
  mark(
    "house-chimney",
    line([315, 135.4], [315, 107], [338, 107], [338, 154.7]),
    8000,
  ),
  mark("house-left-path", quad([235, 335], [216, 385], [188, 443]), 8000),
  mark("house-right-path", quad([280, 335], [302, 388], [326, 443]), 8000),
  mark("house-flower-stem", line([456, 398], [456, 314]), 7000),
  mark("house-flower-centre", ellipse(456, 298, 15, 15), 4500, true),
  mark(
    "house-upper-petal",
    cubic([449, 285], [429, 253], [483, 253], [463, 285]),
    7000,
  ),
  mark(
    "house-left-petal",
    cubic([442, 291], [407, 274], [407, 321], [442, 305]),
    7000,
  ),
  mark(
    "house-lower-petal",
    cubic([449, 311], [430, 345], [485, 345], [463, 311]),
    7000,
  ),
  mark(
    "house-right-petal",
    cubic([470, 291], [505, 274], [505, 321], [470, 305]),
    7000,
  ),
  mark(
    "house-flower-leaf",
    join(
      quad([456, 365], [424, 340], [431, 370]),
      quad([431, 370], [448, 379], [456, 365]),
    ),
    7000,
    true,
  ),
  mark("house-ground", quad([80, 339], [130, 351], [178, 340]), 7000),
  mark("house-garden-stone", ellipse(367, 397, 15, 10), 4500, true),
  mark("house-cloud", cloud(430, 85, 110, 55), 10000, true),
]);

const train = defineLesson("train", [
  mark("train-base", rect(120, 270, 350, 45), 9500, true),
  mark("train-cab", line([140, 270], [140, 155], [250, 155], [250, 222]), 9000),
  mark("train-boiler", ellipse(351, 237, 112, 33), 9500, true),
  mark("train-front-wheel", ellipse(390, 337, 28, 28), 8000, true),
  mark("train-back-wheel", ellipse(196, 337, 28, 28), 8000, true),
  mark("train-front-hub", ellipse(390, 337, 8, 8), 5000, true),
  mark("train-back-hub", ellipse(196, 337, 8, 8), 5000, true),
  mark("train-wheel-link", line([196, 337], [390, 337]), 8000),
  mark("train-window", rect(160, 180, 70, 48), 8000, true),
  mark("train-cab-roof", line([125, 155], [264, 155]), 7000),
  mark("train-chimney", rect(350, 154, 22, 50), 6500, true),
  mark("train-front-slope", line([470, 300], [510, 335]), 6000),
  mark("train-front-base", line([510, 335], [470, 315]), 6000),
  mark("train-boiler-face", arc(424, 237, 24, 31, -65, 65), 7000),
  mark("train-front-lamp", ellipse(465, 235, 11, 11), 4500, true),
  mark(
    "train-coupling",
    cubic([120, 291], [92, 291], [92, 318], [107, 312]),
    6000,
  ),
  mark("train-first-puff", cloud(341, 110, 40, 28), 8000, true),
  mark("train-second-puff", cloud(315, 66, 46, 30), 8000, true),
  mark("train-upper-rail", line([90, 366], [520, 366]), 10000),
  mark("train-lower-rail", line([90, 380], [520, 380]), 10000),
]);

const cactus = defineLesson("cactus", [
  mark("cactus-pot-rim", arc(300, 350, 80, 17, -68, 248), 8000),
  mark(
    "cactus-pot",
    join(
      quad([220, 350], [240, 435], [300, 428]),
      quad([300, 428], [360, 435], [380, 350]),
    ),
    9500,
  ),
  mark(
    "cactus-main-stem",
    join(
      line([270, 344], [270, 136]),
      arc(300, 136, 30, 35, 180, 360),
      line([330, 136], [330, 344]),
    ),
    10000,
  ),
  mark("cactus-left-arm-out", line([270, 246], [214, 246], [214, 190]), 8000),
  mark(
    "cactus-left-arm-back",
    join(
      arc(227, 190, 13, 13, 180, 360),
      line([240, 190], [240, 220], [270, 220]),
    ),
    8000,
  ),
  mark("cactus-right-arm-out", line([330, 213], [377, 213], [377, 160]), 8000),
  mark(
    "cactus-right-arm-back",
    join(
      arc(390, 160, 13, 13, 180, 360),
      line([403, 160], [403, 239], [330, 239]),
    ),
    9000,
  ),
  mark("cactus-left-spine", line([270, 275], [259, 270]), 3000),
  mark("cactus-right-spine", line([330, 273], [341, 268]), 3000),
  mark("cactus-upper-left-spine", line([270, 155], [259, 150]), 3000),
  mark("cactus-upper-right-spine", line([330, 143], [341, 139]), 3000),
  mark("cactus-stem-texture", quad([300, 143], [291, 239], [300, 328]), 8000),
  mark("cactus-upper-pot-band", quad([238, 388], [300, 401], [362, 388]), 8000),
  mark("cactus-lower-pot-band", quad([246, 405], [300, 419], [354, 405]), 8000),
  mark("cactus-flower-centre", ellipse(300, 89, 10, 10), 4500, true),
  mark(
    "cactus-left-petal",
    cubic([291, 85], [268, 69], [265, 105], [292, 94]),
    7000,
  ),
  mark(
    "cactus-right-petal",
    cubic([309, 85], [332, 69], [335, 105], [308, 94]),
    7000,
  ),
  mark("cactus-stone", ellipse(418, 413, 18, 11), 4500, true),
]);

const robot = defineLesson("robot", [
  mark("robot-body", rect(220, 210, 160, 130), 9500, true),
  mark("robot-head", rect(235, 100, 130, 90), 10000, true),
  mark("robot-left-neck", line([280, 190], [280, 210]), 3000),
  mark("robot-right-neck", line([320, 190], [320, 210]), 3000),
  mark("robot-left-eye", ellipse(270, 133, 12, 12), 4500, true),
  mark("robot-right-eye", ellipse(330, 133, 12, 12), 4500, true),
  mark("robot-mouth", quad([274, 165], [300, 184], [326, 165]), 7000),
  mark("robot-antenna", line([300, 100], [300, 70]), 3000),
  mark("robot-antenna-tip", ellipse(300, 60, 9, 9), 4500, true),
  mark("robot-left-arm", line([220, 240], [160, 280]), 7000),
  mark("robot-right-arm", line([380, 240], [440, 225]), 7000),
  mark("robot-left-hand", ellipse(148, 286, 14, 14), 4500, true),
  mark("robot-right-hand", ellipse(451, 222, 14, 14), 4500, true),
  mark("robot-left-leg", line([260, 340], [260, 400]), 6000),
  mark("robot-right-leg", line([340, 340], [340, 400]), 6000),
  mark("robot-left-foot", line([260, 400], [225, 400]), 3000),
  mark("robot-right-foot", line([340, 400], [375, 400]), 3000),
  mark("robot-panel", rect(260, 244, 80, 52), 8000, true),
  mark("robot-left-button", dot(281, 270, 4), 2500, true),
  mark("robot-right-button", dot(319, 270, 4), 2500, true),
]);

export const intermediateLessons = [
  dog,
  turtle,
  butterfly,
  owl,
  sailboat,
  rocket,
  house,
  train,
  cactus,
  robot,
];
