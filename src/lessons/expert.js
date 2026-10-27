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
  multiMark,
  sampleEvenly,
} from "../lesson-geometry.js";
import { defineLesson } from "../lesson-model.js";

// Authored foreground contours determine where a pen lifts. Every returned
// piece remains a separate native stroke, so no connector crosses a hidden edge.
function within(point, boundary) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i], b = boundary[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function uncovered(id, points, foreground, durationMs) {
  const sampled = sampleEvenly(points, 0.5), parts = [];
  let part = [];
  for (const point of sampled) {
    if (foreground.some((boundary) => within(point, boundary))) {
      if (part.length > 2) parts.push(part);
      part = [];
    } else part.push(point);
  }
  if (part.length > 2) parts.push(part);
  const closed = Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 0.01;
  if (closed && parts.length > 1 &&
      Math.hypot(parts[0][0].x - sampled[0].x, parts[0][0].y - sampled[0].y) < 0.01 &&
      Math.hypot(parts.at(-1).at(-1).x - sampled.at(-1).x, parts.at(-1).at(-1).y - sampled.at(-1).y) < 0.01) {
    const first = parts.shift();
    parts[parts.length - 1] = [...parts.at(-1), ...first.slice(1)];
  }
  return parts.length === 1 ? mark(id, parts[0], durationMs) : multiMark(id, parts, durationMs);
}

const foxMuzzle = join(quad([355, 252], [337, 259], [318, 282]), quad([318, 282], [347, 291], [368, 282]));
const foxTail = join(cubic([145, 250], [102, 343], [265, 393], [355, 322]), cubic([355, 322], [272, 349], [217, 300], [145, 250]));
const elephantEar = join(cubic([386, 174], [327, 163], [321, 250], [376, 270]), cubic([376, 270], [405, 260], [414, 203], [386, 174]));
const elephantFrontLeg = join(line([346, 288], [343, 376]), quad([343, 376], [364, 391], [385, 376]), line([385, 376], [382, 264]));
const elephantBackLeg = join(line([161, 286], [154, 375]), quad([154, 375], [176, 391], [198, 375]), line([198, 375], [204, 300]));
const elephantTrunk = [
  ...cubic([468, 228], [499, 255], [458, 354], [514, 351]),
  ...quad([514, 351], [532, 357], [517, 370]),
  ...cubic([455, 256], [468, 288], [446, 379], [517, 370]).reverse(),
];
const rabbitFrontLeg = join(line([355, 300], [351, 350]), quad([351, 350], [361, 356], [371, 349]), line([371, 349], [377, 291]));
const coastalRock = join(line([287, 364], [278, 341], [296, 322], [325, 329], [340, 353]), quad([340, 353], [316, 371], [287, 364]));
const pearInFront = join(
  cubic([237, 211], [258, 209], [260, 161], [281, 160]),
  cubic([281, 160], [310, 160], [297, 204], [324, 230]),
  cubic([324, 230], [353, 257], [340, 286], [330, 303]),
);

// Each path is one authored teaching action, in curriculum order. Partial
// contours stop at the foreground form instead of revealing a hidden edge.
export const expertLessons = [
  defineLesson("bird", [
    mark("branch-top", line([90, 370], [510, 330]), 7000),
    mark("branch-bottom", line([92, 386], [512, 346]), 7000),
    mark("branch-left-end", quad([90, 370], [78, 379], [92, 386]), 3000),
    mark("branch-right-end", quad([510, 330], [523, 337], [512, 346]), 3000),
    uncovered("bird-body", ellipse(285, 253, 85, 59, -14), [ellipse(378, 200, 37, 37)], 8000),
    uncovered("bird-head", ellipse(378, 200, 37, 37), [line([411, 188], [448, 202], [413, 211])], 6500),
    mark("bird-beak", line([411, 188], [448, 202], [413, 211]), 4500),
    mark("bird-eye", dot(390, 193, 3), 3000, true),
    mark(
      "folded-wing",
      join(
        cubic([245, 235], [285, 217], [332, 240], [317, 276]),
        cubic([317, 276], [286, 284], [258, 272], [245, 235]),
      ),
      7000,
      true,
    ),
    uncovered(
      "long-tail",
      join(
        quad([215, 265], [181, 278], [144, 320]),
        quad([144, 320], [206, 308], [237, 295]),
      ),
      [ellipse(285, 253, 85, 59, -14)],
      6500,
    ),
    mark("first-leg", line([278, 309], [285, 351]), 4500),
    mark("first-toe", line([285, 351], [306, 349]), 3000),
    mark("second-leg", line([316, 304], [321, 347]), 4500),
    mark("second-toe", line([321, 347], [341, 346]), 3000),
    mark("wing-feather", quad([270, 244], [294, 246], [307, 265]), 4500),
    mark("tail-feather", line([214, 283], [166, 310]), 4500),
    mark("branch-twig", quad([423, 338], [440, 315], [455, 298]), 4500),
    mark(
      "twig-leaf",
      join(
        quad([449, 306], [475, 275], [491, 290]),
        quad([491, 290], [477, 314], [449, 306]),
      ),
      5500,
      true,
    ),
    mark(
      "sky-cloud",
      join(
        cubic([130, 133], [102, 119], [116, 90], [141, 99]),
        cubic([141, 99], [153, 70], [188, 83], [190, 105]),
        cubic([190, 105], [221, 99], [231, 129], [205, 133]),
        line([205, 133], [130, 133]),
      ),
      8000,
      true,
    ),
    mark("chest-patch", ellipse(338, 259, 12, 22, 20), 5500, true),
  ]),
  defineLesson("fox", [
    uncovered("curled-body", ellipse(282, 255, 139, 83), [ellipse(382, 263, 49, 43, -12), foxTail], 8500),
    uncovered("resting-head", ellipse(382, 263, 49, 43, -12), [foxMuzzle], 7000),
    mark(
      "pointed-muzzle",
      join(
        quad([355, 252], [337, 259], [318, 282]),
        quad([318, 282], [347, 291], [368, 282]),
      ),
      6500,
    ),
    mark("fox-nose", dot(320, 281, 4), 3000, true),
    mark("near-ear", line([376, 225], [384, 171], [409, 229]), 5500),
    mark("far-ear", line([408, 233], [431, 195], [432, 253]), 5500),
    mark("sleepy-eye", quad([362, 263], [371, 273], [381, 266]), 4500),
    mark("cheek-curve", quad([397, 267], [384, 289], [360, 289]), 5500),
    mark("tucked-paw", ellipse(335, 312, 28, 11, -5), 5500, true),
    mark(
      "tail-outer-curve",
      cubic([145, 250], [102, 343], [265, 393], [355, 322]),
      8500,
    ),
    mark(
      "tail-return-curve",
      cubic([355, 322], [272, 349], [217, 300], [145, 250]),
      8500,
    ),
    mark("pale-tail-tip", quad([314, 332], [323, 339], [333, 337]), 4500),
    mark("tucked-hind-leg", arc(258, 267, 49, 39, -135, 35), 6500),
    mark("paw-toe", line([343, 306], [346, 315]), 3000),
    mark("inner-ear", line([387, 217], [387, 191], [399, 221]), 4500),
    mark("cheek-fur", line([414, 271], [421, 276]), 3000),
    mark("resting-ground", quad([100, 382], [290, 411], [479, 374]), 8000),
    mark(
      "fallen-leaf",
      join(
        quad([452, 335], [469, 309], [488, 325]),
        quad([488, 325], [475, 347], [452, 335]),
      ),
      5500,
      true,
    ),
    mark("small-stone", ellipse(456, 385, 19, 10), 4500, true),
    mark("tail-fur", quad([210, 331], [225, 341], [240, 342]), 4500),
  ]),
  defineLesson("elephant", [
    uncovered("elephant-body", ellipse(255, 220, 145, 85), [ellipse(407, 216, 69, 60), elephantEar, elephantFrontLeg, elephantBackLeg], 8500),
    uncovered("elephant-head", ellipse(407, 216, 69, 60), [elephantEar, elephantTrunk], 8000),
    mark(
      "large-ear",
      join(
        cubic([386, 174], [327, 163], [321, 250], [376, 270]),
        cubic([376, 270], [405, 260], [414, 203], [386, 174]),
      ),
      8000,
      true,
    ),
    mark(
      "trunk-outer-edge",
      cubic([468, 228], [499, 255], [458, 354], [514, 351]),
      8500,
    ),
    mark(
      "trunk-inner-edge",
      cubic([455, 256], [468, 288], [446, 379], [517, 370]),
      8500,
    ),
    mark("trunk-tip", quad([514, 351], [532, 357], [517, 370]), 4500),
    mark("elephant-eye", dot(437, 205, 3), 3000, true),
    mark(
      "near-front-leg",
      join(
        line([346, 288], [343, 376]),
        quad([343, 376], [364, 391], [385, 376]),
        line([385, 376], [382, 264]),
      ),
      8000,
    ),
    mark(
      "near-back-leg",
      join(
        line([161, 286], [154, 375]),
        quad([154, 375], [176, 391], [198, 375]),
        line([198, 375], [204, 300]),
      ),
      8000,
    ),
    mark(
      "far-front-leg",
      join(
        line([386, 304], [405, 363]),
        quad([405, 363], [404, 381], [385, 374]),
      ),
      6500,
    ),
    mark(
      "far-back-leg",
      join(
        line([200, 325], [219, 363]),
        quad([219, 363], [218, 382], [198, 375]),
      ),
      6500,
    ),
    mark(
      "elephant-tail",
      cubic([112, 215], [83, 224], [104, 276], [80, 286]),
      6500,
    ),
    mark(
      "tail-tuft",
      join(
        quad([80, 286], [60, 292], [69, 306]),
        quad([69, 306], [87, 304], [80, 286]),
      ),
      4500,
      true,
    ),
    mark(
      "small-tusk",
      join(
        quad([454, 253], [474, 276], [493, 271]),
        quad([493, 271], [476, 285], [455, 263]),
      ),
      5500,
    ),
    mark("trunk-crease", quad([467, 299], [473, 302], [479, 299]), 3000),
    mark("first-toenail", arc(354, 379, 5, 7, 180, 360), 3000),
    mark("second-toenail", arc(369, 380, 5, 7, 180, 360), 3000),
    mark("elephant-ground", quad([95, 397], [287, 390], [446, 398]), 8000),
    mark("grass-blade", quad([119, 398], [110, 373], [108, 387]), 4500),
    mark("nearby-puddle", ellipse(479, 411, 53, 12, -4), 6500, true),
  ]),
  defineLesson("rabbit", [
    uncovered("rabbit-body", ellipse(270, 286, 112, 81, -8), [ellipse(386, 227, 51, 43, -12), rabbitFrontLeg, ellipse(274, 362, 60, 14, -3)], 8500),
    uncovered("sideways-head", ellipse(386, 227, 51, 43, -12), [arc(430, 239, 25, 16, -120, 115)], 7000),
    mark("rabbit-muzzle", arc(430, 239, 25, 16, -120, 115), 5500),
    mark("rabbit-nose", dot(454, 240, 3), 3000, true),
    mark("rabbit-eye", dot(405, 218, 3), 3000, true),
    mark(
      "long-near-ear",
      join(
        cubic([370, 190], [340, 137], [349, 69], [367, 83]),
        cubic([367, 83], [386, 101], [392, 148], [390, 184]),
      ),
      8500,
    ),
    mark(
      "long-far-ear",
      join(
        cubic([394, 184], [402, 117], [432, 84], [438, 107]),
        cubic([438, 107], [441, 134], [420, 171], [409, 190]),
      ),
      8000,
    ),
    mark(
      "inner-near-ear",
      join(
        cubic([375, 172], [355, 130], [352, 100], [366, 105]),
        quad([366, 105], [386, 134], [375, 172]),
      ),
      6500,
      true,
    ),
    mark("rabbit-cheek", quad([407, 241], [398, 257], [382, 253]), 4500),
    mark("large-hind-leg", ellipse(243, 309, 48, 44, -12), 7000, true),
    mark("long-hind-foot", ellipse(274, 362, 60, 14, -3), 7000, true),
    mark(
      "short-front-leg",
      join(
        line([355, 300], [351, 350]),
        quad([351, 350], [361, 356], [371, 349]),
        line([371, 349], [377, 291]),
      ),
      6500,
    ),
    mark("front-paw", ellipse(373, 359, 27, 11), 5500, true),
    mark("round-tail", arc(151, 296, 24, 23, 60, 300), 5500),
    mark("rabbit-mouth", quad([445, 250], [436, 258], [427, 252]), 4500),
    mark("first-whisker", line([439, 243], [484, 226]), 4500),
    mark("second-whisker", line([439, 247], [490, 252]), 4500),
    mark("hind-foot-toe", line([312, 357], [315, 367]), 3000),
    mark("rabbit-ground", quad([110, 388], [286, 400], [443, 382]), 8000),
    mark(
      "rabbit-leaf",
      join(
        quad([463, 357], [473, 324], [496, 335]),
        quad([496, 335], [489, 361], [463, 357]),
      ),
      5500,
      true,
    ),
  ]),
  defineLesson("cup", [
    mark("saucer-front-edge", arc(300, 353, 180, 60, 180, 0), 8500),
    mark("cup-rim", ellipse(280, 195, 100, 28), 7000, true),
    mark(
      "cup-left-edge",
      cubic([180, 195], [182, 249], [187, 320], [200, 345]),
      7000,
    ),
    mark(
      "cup-right-edge",
      cubic([380, 195], [378, 249], [373, 320], [360, 345]),
      7000,
    ),
    mark("cup-bottom", quad([200, 345], [280, 379], [360, 345]), 6500),
    mark(
      "handle-outer-loop",
      cubic([376, 236], [483, 193], [492, 343], [366, 325]),
      8000,
    ),
    mark(
      "handle-inner-loop",
      cubic([374, 257], [452, 226], [455, 322], [370, 305]),
      7000,
    ),
    mark("inner-rim", arc(280, 195, 85, 19, 195, 345), 5500),
    mark("saucer-left-return", quad([120, 353], [137, 321], [195, 326]), 6500),
    mark("saucer-right-return", quad([480, 353], [444, 318], [365, 326]), 7000),
    mark("cup-base-arc", quad([218, 356], [280, 384], [342, 356]), 5500),
    mark("cup-upper-band", quad([184, 251], [280, 278], [376, 251]), 6500),
    mark("cup-lower-band", quad([187, 273], [280, 301], [373, 273]), 6500),
    mark(
      "cup-decoration",
      join(
        quad([267, 311], [271, 291], [283, 309]),
        quad([283, 309], [299, 292], [298, 312]),
        line([298, 312], [282, 331], [267, 311]),
      ),
      6500,
      true,
    ),
    mark(
      "first-steam",
      cubic([245, 148], [221, 126], [269, 104], [247, 77]),
      6500,
    ),
    mark(
      "second-steam",
      cubic([298, 147], [278, 120], [323, 102], [304, 70]),
      6500,
    ),
    mark("biscuit", ellipse(508, 400, 36, 22, -12), 6500, true),
    mark("biscuit-dot", dot(509, 397, 3), 3000, true),
    mark("table-left", line([45, 376], [130, 376]), 4500),
    mark("table-right", line([470, 376], [555, 376]), 4500),
  ]),
  defineLesson("fruit-bowl", [
    mark(
      "bowl-body",
      cubic([133, 287], [149, 434], [451, 434], [467, 287]),
      9000,
    ),
    mark("bowl-front-rim", quad([133, 287], [300, 322], [467, 287]), 8000),
    mark("bowl-foot", ellipse(300, 410, 51, 12), 6500, true),
    mark(
      "left-apple",
      join(
        cubic([152, 289], [132, 231], [165, 178], [200, 205]),
        cubic([200, 205], [237, 175], [269, 235], [251, 302]),
      ),
      8000,
    ),
    mark(
      "middle-pear",
      join(
        cubic([237, 211], [258, 209], [260, 161], [281, 160]),
        cubic([281, 160], [310, 160], [297, 204], [324, 230]),
        cubic([324, 230], [353, 257], [340, 286], [330, 303]),
      ),
      8500,
    ),
    mark("pear-stem", quad([281, 160], [283, 147], [291, 143]), 3000),
    // Both visible ends meet the bowl's front-rim curve; the lower arc is hidden.
    mark(
      "right-orange",
      arc(398, 255, 58, 51, 115.23892771966203, 407.69049515970123),
      8000,
    ),
    uncovered(
      "banana-upper-edge",
      cubic([219, 176], [282, 113], [374, 140], [425, 213]),
      [pearInFront, ellipse(398, 255, 58, 51)],
      8000,
    ),
    uncovered(
      "banana-lower-edge",
      cubic([425, 213], [339, 168], [285, 155], [219, 176]),
      [pearInFront, ellipse(398, 255, 58, 51)],
      8000,
    ),
    mark(
      "banana-stalk",
      line([219, 176], [211, 164], [218, 159], [226, 171]),
      4500,
    ),
    mark("hidden-fruit-arc", arc(325, 202, 39, 36, -125, -8), 5500),
    mark("apple-stem", quad([200, 205], [198, 191], [205, 185]), 3000),
    mark(
      "apple-leaf",
      join(
        quad([203, 190], [217, 167], [232, 180]),
        quad([232, 180], [224, 199], [203, 190]),
      ),
      5500,
      true,
    ),
    mark("orange-first-spot", dot(411, 233, 2), 3000, true),
    mark("orange-second-spot", dot(426, 252, 2), 3000, true),
    mark("pear-shine", ellipse(305, 222, 7, 16, -19), 4500, true),
    mark("bowl-band", quad([146, 329], [300, 390], [454, 329]), 8000),
    mark("bowl-decoration", ellipse(300, 377, 8, 7), 4500, true),
    mark("fallen-fruit", ellipse(502, 396, 32, 29), 6500, true),
    mark(
      "fallen-fruit-leaf",
      join(
        quad([505, 367], [510, 344], [533, 351]),
        quad([533, 351], [526, 370], [505, 367]),
      ),
      5500,
      true,
    ),
  ]),
  defineLesson("tree-path", [
    mark(
      "distant-hill",
      cubic([297, 172], [373, 109], [450, 167], [565, 143]),
      8000,
    ),
    mark(
      "path-left-edge",
      cubic([305, 441], [208, 341], [460, 264], [403, 153]),
      9000,
    ),
    mark(
      "path-right-edge",
      cubic([494, 441], [337, 329], [495, 254], [420, 154]),
      9000,
    ),
    mark(
      "trunk-left-edge",
      cubic([134, 356], [151, 303], [155, 248], [151, 207]),
      7000,
    ),
    mark(
      "trunk-right-edge",
      cubic([193, 356], [174, 293], [180, 247], [184, 207]),
      7000,
    ),
    mark("left-branch", quad([155, 237], [124, 219], [109, 182]), 5500),
    mark("right-branch", quad([179, 234], [205, 221], [224, 193]), 5500),
    mark(
      "leafy-crown",
      join(
        cubic([94, 218], [43, 234], [35, 181], [67, 162]),
        cubic([67, 162], [44, 119], [96, 92], [125, 109]),
        cubic([125, 109], [146, 60], [207, 73], [219, 109]),
        cubic([219, 109], [268, 90], [292, 147], [267, 174]),
        cubic([267, 174], [291, 219], [244, 243], [219, 220]),
        cubic([219, 220], [172, 258], [124, 248], [94, 218]),
      ),
      9000,
      true,
    ),
    mark("left-root", quad([134, 356], [118, 369], [98, 369]), 4500),
    mark("right-root", quad([193, 356], [213, 368], [230, 366]), 4500),
    mark(
      "trunk-bark",
      cubic([164, 273], [155, 288], [172, 306], [160, 325]),
      5500,
    ),
    mark(
      "leafy-cluster",
      join(
        cubic([104, 148], [95, 129], [120, 118], [135, 130]),
        cubic([135, 130], [157, 109], [181, 130], [172, 145]),
        cubic([172, 145], [152, 165], [124, 160], [104, 148]),
      ),
      7000,
      true,
    ),
    mark("near-path-stone", ellipse(248, 401, 31, 19, -12), 6500, true),
    mark("far-path-stone", ellipse(460, 229, 11, 7, -12), 4500, true),
    mark("tree-grass", quad([100, 369], [91, 346], [88, 361]), 4500),
    mark("path-grass", quad([505, 413], [519, 384], [518, 405]), 4500),
    mark(
      "distant-bush",
      join(
        cubic([475, 173], [469, 156], [485, 149], [494, 158]),
        cubic([494, 158], [502, 141], [525, 154], [519, 172]),
        line([519, 172], [475, 173]),
      ),
      6500,
      true,
    ),
    mark(
      "landscape-cloud",
      join(
        cubic([357, 91], [336, 81], [345, 58], [367, 62]),
        cubic([367, 62], [382, 38], [410, 53], [409, 68]),
        cubic([409, 68], [437, 59], [447, 86], [426, 91]),
        line([426, 91], [357, 91]),
      ),
      8000,
      true,
    ),
    mark(
      "fallen-tree-leaf",
      join(
        quad([205, 395], [205, 373], [225, 377]),
        quad([225, 377], [225, 395], [205, 395]),
      ),
      5500,
      true,
    ),
    mark("landscape-sun", ellipse(523, 74, 24, 24), 6500, true),
  ]),
  defineLesson("castle", [
    mark("central-wall", rect(210, 225, 180, 115), 8500, true),
    mark("left-tower", rect(135, 166, 75, 174), 8500, true),
    mark("right-tower", rect(390, 166, 75, 174), 8500, true),
    mark("left-tower-roof", line([126, 166], [172, 103], [219, 166]), 7000),
    mark("right-tower-roof", line([381, 166], [428, 103], [474, 166]), 7000),
    mark(
      "arched-gate",
      join(
        line([271, 340], [271, 291]),
        arc(300, 291, 29, 32, 180, 360),
        line([329, 291], [329, 340]),
      ),
      8000,
    ),
    mark("bridge-left-edge", line([271, 340], [238, 431]), 6500),
    mark("bridge-right-edge", line([329, 340], [362, 431]), 6500),
    mark("bridge-near-edge", line([238, 431], [362, 431]), 5500),
    mark("first-bridge-plank", line([261, 367], [339, 367]), 4500),
    mark("second-bridge-plank", line([249, 400], [351, 400]), 5500),
    mark(
      "moat-left",
      cubic([67, 395], [118, 359], [197, 366], [254, 387]),
      8000,
    ),
    mark(
      "moat-right",
      cubic([346, 387], [402, 366], [481, 359], [533, 395]),
      8000,
    ),
    mark(
      "left-tower-window",
      join(
        line([157, 239], [157, 212]),
        arc(172, 212, 15, 18, 180, 360),
        line([187, 212], [187, 239], [157, 239]),
      ),
      6500,
      true,
    ),
    mark(
      "right-tower-window",
      join(
        line([412, 239], [412, 212]),
        arc(427, 212, 15, 18, 180, 360),
        line([442, 212], [442, 239], [412, 239]),
      ),
      6500,
      true,
    ),
    mark("castle-flagpole", line([172, 103], [172, 53]), 4500),
    mark("castle-flag", line([172, 53], [218, 65], [172, 79]), 5500),
    mark("left-lifting-chain", line([265, 279], [238, 431]), 7000),
    mark("right-lifting-chain", line([335, 279], [362, 431]), 7000),
    mark("castle-stone", rect(224, 269, 22, 12), 4500, true),
  ]),
  defineLesson("lighthouse", [
    mark("sea-horizon", line([302, 190], [565, 190]), 8000),
    uncovered(
      "coastline",
      cubic([41, 398], [363, 429], [243, 256], [562, 290]),
      [coastalRock],
      9000,
    ),
    mark("tower-left-edge", line([115, 348], [142, 153]), 8000),
    mark("tower-right-edge", line([225, 348], [198, 153]), 8000),
    mark("tower-base", quad([115, 348], [170, 365], [225, 348]), 6500),
    mark("lantern-platform", rect(127, 143, 86, 10), 7000, true),
    mark("lantern-room", rect(142, 94, 56, 49), 7000, true),
    mark("lantern-roof", line([131, 94], [170, 62], [209, 94]), 6500),
    mark("lantern-divider", line([170, 94], [170, 143]), 4500),
    mark(
      "lighthouse-door",
      join(
        line([156, 353], [156, 316]),
        arc(170, 316, 14, 17, 180, 360),
        line([184, 316], [184, 353]),
      ),
      6500,
    ),
    mark("tower-upper-stripe", quad([133, 219], [170, 230], [207, 219]), 5500),
    mark("tower-lower-stripe", quad([124, 285], [170, 298], [216, 285]), 5500),
    mark("light-beam-upper", line([198, 107], [513, 58]), 8500),
    mark("light-beam-lower", line([198, 130], [530, 174]), 8500),
    mark(
      "coastal-rock",
      join(
        line([287, 364], [278, 341], [296, 322], [325, 329], [340, 353]),
        quad([340, 353], [316, 371], [287, 364]),
      ),
      7000,
      true,
    ),
    mark(
      "near-wave",
      cubic([392, 331], [404, 315], [425, 316], [439, 330]),
      5500,
    ),
    mark("far-wave", quad([468, 243], [487, 231], [505, 242]), 4500),
    mark(
      "coastal-cloud",
      join(
        cubic([339, 146], [321, 137], [328, 113], [347, 119]),
        cubic([347, 119], [358, 99], [384, 108], [384, 125]),
        cubic([384, 125], [406, 118], [413, 141], [394, 146]),
        line([394, 146], [339, 146]),
      ),
      8000,
      true,
    ),
    mark(
      "distant-boat",
      join(
        quad([475, 203], [493, 224], [511, 203]),
        line([511, 203], [475, 203]),
      ),
      5500,
      true,
    ),
    mark(
      "lighthouse-path",
      cubic([120, 443], [242, 416], [157, 387], [170, 355]),
      8000,
    ),
  ]),
  defineLesson("coral", [
    mark("seabed", cubic([42, 407], [193, 377], [390, 438], [559, 401]), 9000),
    mark(
      "seabed-rock",
      join(
        cubic([247, 401], [220, 365], [251, 339], [277, 354]),
        cubic([277, 354], [311, 344], [333, 381], [315, 406]),
        quad([315, 406], [282, 416], [247, 401]),
      ),
      8000,
      true,
    ),
    mark(
      "coral-main-branch",
      cubic([134, 395], [140, 335], [131, 286], [151, 228]),
      8000,
    ),
    mark("coral-left-fork", quad([138, 331], [102, 311], [86, 273]), 6500),
    mark("coral-right-fork", quad([139, 305], [179, 288], [191, 254]), 6500),
    mark("coral-left-twig", quad([107, 310], [81, 314], [64, 297]), 4500),
    mark("coral-right-twig", quad([179, 277], [210, 284], [221, 266]), 4500),
    mark(
      "rounded-coral",
      join(
        cubic([377, 411], [347, 367], [367, 310], [397, 315]),
        cubic([397, 315], [421, 282], [455, 313], [454, 336]),
        cubic([454, 336], [490, 339], [493, 390], [470, 410]),
        quad([470, 410], [423, 424], [377, 411]),
      ),
      9000,
      true,
    ),
    mark(
      "coral-first-ridge",
      cubic([391, 399], [373, 367], [392, 328], [408, 334]),
      6500,
    ),
    mark(
      "coral-second-ridge",
      cubic([425, 402], [409, 372], [432, 337], [445, 351]),
      6500,
    ),
    mark(
      "hidden-seaweed",
      join(
        cubic([255, 348], [236, 310], [277, 282], [262, 244]),
        cubic([262, 244], [303, 287], [268, 321], [275, 352]),
      ),
      8500,
    ),
    mark(
      "second-seaweed",
      join(
        cubic([322, 382], [305, 312], [335, 294], [328, 270]),
        cubic([328, 270], [364, 311], [330, 353], [335, 405]),
      ),
      8000,
    ),
    mark("swimming-fish", ellipse(384, 192, 64, 33, -5), 8000, true),
    mark(
      "fish-tail",
      line([324, 183], [286, 163], [293, 218], [324, 203]),
      6500,
    ),
    mark("fish-eye", dot(424, 185, 3), 3000, true),
    mark(
      "fish-fin",
      join(
        quad([376, 188], [342, 197], [367, 216]),
        line([367, 216], [376, 188]),
      ),
      5500,
      true,
    ),
    mark("first-bubble", ellipse(459, 148, 9, 10), 4500, true),
    mark("second-bubble", ellipse(477, 112, 13, 14), 5500, true),
    mark(
      "seabed-shell",
      join(
        quad([191, 399], [158, 358], [178, 356]),
        quad([178, 356], [190, 337], [201, 357]),
        quad([201, 357], [229, 350], [212, 392]),
        line([212, 392], [191, 399]),
      ),
      7000,
      true,
    ),
    mark("fish-stripe", quad([397, 159], [380, 190], [399, 223]), 5500),
  ]),
];
