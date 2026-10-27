import { arc, cubic, ellipse, join, line, quad } from "./lesson-geometry.js";
import { crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";
import { regionPatch } from "./crayon-regions.js";

const closed = (points) => Object.freeze([...points, { ...points[0] }].map(Object.freeze));
const signedArea = (points) => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0);
function withHoles(outside, holes) {
  const boundary = [...outside];
  for (const source of holes) {
    const hole = Math.sign(signedArea(source)) === Math.sign(signedArea(outside))
      ? [...source].reverse() : [...source];
    const anchor = outside.reduce((best, point, index) =>
      Math.hypot(point.x - hole[0].x, point.y - hole[0].y) <
      Math.hypot(outside[best].x - hole[0].x, outside[best].y - hole[0].y) ? index : best, 0);
    // Retraced bridges carry zero winding. They only make the inset more
    // conservative; no runtime mask covers an escaped colouring movement.
    const approach = outside.slice(0, anchor + 1);
    boundary.push(...approach, ...hole, hole[0], outside[anchor], ...approach.toReversed());
  }
  return Object.freeze(boundary.map(Object.freeze));
}
const petal = (first, second, endAngle, startAngle) => closed(join(
  quad(...first), quad(...second), arc(300, 190, 30, 30, endAngle, startAngle),
));

// These contours describe the actual outlined subject, independently of the
// inset crayon paths. Open stems, fins and grass remain pencil movements.
export const BASIC_COMPLETE_GEOMETRY = Object.freeze({
  flower: Object.freeze({
    "flower-centre": ellipse(300, 190, 30, 30),
    "upper-petal": join(quad([285, 164], [260, 65], [300, 70]), quad([300, 70], [340, 65], [315, 164])),
    "left-petal": join(quad([273, 175], [174, 140], [180, 190]), quad([180, 190], [174, 240], [273, 205])),
    "lower-petal": join(quad([285, 216], [260, 310], [300, 310]), quad([300, 310], [340, 310], [315, 216])),
    "right-petal": join(quad([327, 175], [426, 140], [420, 190]), quad([420, 190], [426, 240], [327, 205])),
    "upper-right-petal": join(quad([315, 164], [385, 78], [389, 110]), quad([389, 110], [418, 130], [327, 175])),
    "lower-left-petal": join(quad([273, 205], [180, 250], [211, 274]), quad([211, 274], [235, 302], [285, 216])),
    "flower-stem": cubic([300, 310], [295, 350], [312, 388], [300, 430]),
    "left-leaf": join(quad([302, 370], [230, 378], [215, 330]), quad([215, 330], [274, 323], [302, 370])),
    "right-leaf": join(quad([304, 395], [333, 335], [389, 350]), quad([389, 350], [374, 401], [304, 395])),
  }),
  apple: Object.freeze({
    "apple-left-side": cubic([300, 155], [135, 65], [135, 375], [300, 370]),
    "apple-right-side": cubic([300, 370], [465, 375], [465, 65], [300, 155]),
    "apple-stalk": quad([300, 155], [298, 120], [322, 93]),
    "apple-leaf": join(quad([305, 120], [345, 65], [395, 100]), quad([395, 100], [362, 142], [305, 120])),
    "leaf-vein": quad([305, 120], [350, 100], [395, 100]),
    "apple-shine": cubic([230, 190], [205, 208], [204, 244], [219, 265]),
    "apple-dip": quad([284, 150], [300, 171], [316, 150]),
    "apple-ground": quad([210, 388], [300, 395], [390, 388]),
  }),
  fish: Object.freeze({
    "fish-body": ellipse(280, 245, 130, 80),
    "fish-tail": line([150, 245], [75, 180], [75, 310], [150, 245]),
    "fish-eye": ellipse(355, 225, 5, 5),
    "fish-mouth": quad([393, 258], [399, 270], [406, 259]),
    "upper-fin": line([250, 167], [290, 115], [330, 171]),
    "lower-fin": line([254, 323], [295, 365], [326, 320]),
    "gill-curve": arc(356, 245, 30, 48, 110, 250),
    "upper-scale": arc(260, 219, 16, 17, -65, 65),
    "middle-scale": arc(230, 250, 16, 17, -65, 65),
    "lower-scale": arc(270, 275, 16, 17, -65, 65),
    "near-bubble": ellipse(454, 193, 15, 15),
    "higher-bubble": ellipse(487, 146, 10, 10),
  }),
  ladybird: Object.freeze({
    "ladybird-body": ellipse(300, 275, 105, 125),
    "ladybird-head": arc(300, 165, 50, 55, 180, 360),
    "wing-division": line([300, 150], [300, 400]),
    "left-feeler": quad([270, 120], [240, 97], [252, 73]),
    "right-feeler": quad([330, 120], [361, 96], [348, 73]),
    "left-upper-spot": ellipse(257, 234, 17, 19, -15),
    "right-spot": ellipse(346, 265, 18, 20, 15),
    "left-lower-spot": ellipse(265, 327, 17, 18),
    "left-upper-leg": line([205, 220], [163, 200], [145, 208]),
    "left-middle-leg": line([195, 275], [151, 275], [136, 288]),
    "left-lower-leg": line([213, 345], [173, 366], [156, 386]),
    "right-upper-leg": line([395, 220], [437, 200], [455, 208]),
    "right-middle-leg": line([405, 275], [449, 275], [464, 288]),
    "right-lower-leg": line([387, 345], [427, 366], [444, 386]),
  }),
  "ice-cream": Object.freeze({
    "pointed-cone": line([210, 250], [300, 425], [390, 250]),
    "rounded-scoop": join(arc(300, 250, 90, 105, 180, 360), line([390, 250], [210, 250])),
    cherry: ellipse(300, 130, 18, 18),
    "cherry-stalk": quad([300, 112], [300, 89], [325, 85]),
    "left-sprinkle": line([251, 207], [262, 217]),
    "upper-sprinkle": line([299, 179], [292, 192]),
    "right-sprinkle": line([337, 218], [350, 210]),
    "upper-cone-diagonal": line([240, 300], [325, 365]),
    "lower-cone-diagonal": line([268, 350], [303, 401]),
    "crossing-cone-line": line([344, 325], [283, 381]),
  }),
  mushroom: Object.freeze({
    "mushroom-cap": arc(300, 225, 170, 125, 180, 360),
    "cap-lower-edge": quad([130, 225], [300, 285], [470, 225]),
    "stalk-left-side": cubic([250, 253], [247, 310], [250, 370], [240, 410]),
    "stalk-right-side": cubic([350, 253], [353, 310], [350, 370], [360, 410]),
    "stalk-base": quad([240, 410], [300, 432], [360, 410]),
    "cap-inner-edge": quad([145, 227], [300, 264], [455, 227]),
    "cap-left-spot": ellipse(211, 182, 17, 14, -20),
    "cap-high-spot": ellipse(282, 137, 18, 15),
    "cap-right-spot": ellipse(359, 169, 20, 16, 20),
    "cap-low-spot": ellipse(404, 213, 13, 11),
    "left-grass": quad([190, 421], [179, 403], [181, 385]),
    "right-grass": quad([417, 421], [429, 400], [439, 390]),
  }),
});

const g = BASIC_COMPLETE_GEOMETRY;
const flowerRegions = {
  top: petal([[285, 164], [260, 65], [300, 70]], [[300, 70], [340, 65], [315, 164]], -60, -120),
  left: petal([[273, 175], [174, 140], [180, 190]], [[180, 190], [174, 240], [273, 205]], 150, 210),
  bottom: petal([[285, 216], [260, 310], [300, 310]], [[300, 310], [340, 310], [315, 216]], 60, 120),
  right: petal([[327, 175], [426, 140], [420, 190]], [[420, 190], [426, 240], [327, 205]], 30, -30),
};
// Leave paper around the drawn shine curve, as promised by the colour lesson.
const appleBody = withHoles(closed(join(g.apple["apple-left-side"], g.apple["apple-right-side"])), [
  ellipse(219, 228, 20, 48),
]);
const leftWing = withHoles(closed(join(arc(300, 275, 105, 125, -90, -270), line([300, 400], [300, 150]))), [g.ladybird["left-upper-spot"], g.ladybird["left-lower-spot"]]);
const rightWing = withHoles(closed(join(arc(300, 275, 105, 125, -90, 90), line([300, 400], [300, 150]))), [g.ladybird["right-spot"]]);
const head = closed(join(g.ladybird["ladybird-head"], quad([350, 165], [300, 134], [250, 165])));
const cone = closed(g["ice-cream"]["pointed-cone"]);
const cap = withHoles(closed(join(g.mushroom["mushroom-cap"], [...g.mushroom["cap-lower-edge"]].reverse())), [g.mushroom["cap-left-spot"], g.mushroom["cap-high-spot"], g.mushroom["cap-right-spot"], g.mushroom["cap-low-spot"]]);
const stalk = closed(join(g.mushroom["stalk-left-side"], g.mushroom["stalk-base"], [...g.mushroom["stalk-right-side"]].reverse(), quad([350, 253], [300, 257], [250, 253])));

const palette = {
  pink: { sdkColor: "light-red", ink: "#dc8b9d", grain: "#bd6b82" },
  yellow: { sdkColor: "yellow", ink: "#e9bf4e", grain: "#c39a32" },
  green: { sdkColor: "green", ink: "#83a56a", grain: "#65884c" },
  red: { sdkColor: "red", ink: "#d96b61", grain: "#b44e48" },
  orange: { sdkColor: "orange", ink: "#e7a062", grain: "#c47d43" },
  charcoal: { sdkColor: "grey", ink: "#6f6d70", grain: "#555358" },
  gold: { sdkColor: "yellow", ink: "#d3b477", grain: "#b39055" },
  brown: { sdkColor: "orange", ink: "#b98e6a", grain: "#96704f" },
  cream: { sdkColor: "yellow", ink: "#decda6", grain: "#bfad87" },
};

// Every placement is a small, deliberately selected patch in a real closed
// part. Small sweeps and paper gaps model a child's crayon, without a flat fill.
const patch = (id, boundary, colour, cx, cy, rx, ry, options = {}) =>
  regionPatch({ id, boundary, colour, cx, cy, rx, ry, ...options });
function appearance(phases, outlineStyles = {}) {
  const colourPhases = {}, regions = {};
  for (const [id, duration, patches] of phases) {
    colourPhases[id] = crayonPhase(duration, patches.flatMap((entry) => entry.gestures));
    regions[id] = Object.freeze(patches.flatMap((entry) => entry.regions));
  }
  return Object.freeze({
    appearance: defineCrayonAppearance({
      palette: Object.fromEntries(Object.entries(palette).map(([id, entry]) => [id, { ...entry }])),
      outlineStyles: { default: { color: "black", ink: "#665b55", fill: "none", dash: "draw", size: "m" }, ...outlineStyles },
      colourPhases,
    }),
    regions: Object.freeze(regions),
  });
}

export const BASIC_COMPLETE_ART = Object.freeze({
  flower: appearance([
    ["colour-first-petals", 20000, [
      patch("flower-upper-petal", flowerRegions.top, "pink", 299, 117, 18, 31, { width: 10, passes: 5 }),
      patch("flower-upper-neck", flowerRegions.top, "pink", 300, 145, 8, 9, { width: 5 }),
      patch("flower-left-petal", flowerRegions.left, "pink", 220, 190, 31, 18, { width: 10, passes: 5 }),
      patch("flower-left-neck", flowerRegions.left, "pink", 252, 190, 10, 7, { width: 5 }),
    ]],
    ["colour-other-petals", 20000, [
      patch("flower-lower-petal", flowerRegions.bottom, "pink", 300, 270, 18, 28, { width: 10, passes: 5 }),
      patch("flower-lower-neck", flowerRegions.bottom, "pink", 300, 239, 8, 9, { width: 5 }),
      patch("flower-right-petal", flowerRegions.right, "pink", 377, 190, 31, 18, { width: 10, passes: 5 }),
      patch("flower-right-neck", flowerRegions.right, "pink", 348, 190, 10, 7, { width: 5 }),
    ]],
    ["colour-centre", 8000, [patch("flower-golden-centre", g.flower["flower-centre"], "yellow", 300, 190, 17, 13, { width: 7, passes: 4 })]],
    ["colour-leaves", 10000, [
      patch("flower-left-green", g.flower["left-leaf"], "green", 258, 350, 21, 4, { width: 5, angle: 22 }),
      patch("flower-right-green", g.flower["right-leaf"], "green", 349, 372, 22, 5, { width: 6, angle: -23 }),
    ]],
  ], { "flower-stem": { color: "green", ink: "#73935d", width: 4, size: "s" } }),
  apple: appearance([
    ["colour-apple-left", 31000, [
      patch("apple-upper-left", appleBody, "red", 260, 178, 42, 23, { width: 10, passes: 5, angle: -9 }),
      patch("apple-left-middle", appleBody, "red", 265, 235, 33, 37, { width: 12, passes: 5, angle: 7 }),
      patch("apple-left-low", appleBody, "red", 240, 292, 36, 36, { width: 12, passes: 5, angle: -9 }),
      patch("apple-left-base", appleBody, "red", 273, 340, 34, 15, { width: 10, passes: 5, angle: 7 }),
      patch("apple-left-edge", appleBody, "red", 212, 300, 10, 28, { width: 9, passes: 4, angle: -6 }),
      patch("apple-lower-join", appleBody, "red", 302, 314, 40, 18, { width: 12, passes: 5, angle: -7 }),
    ]],
    ["colour-apple-right", 31000, [
      patch("apple-upper-right", appleBody, "red", 344, 180, 42, 23, { width: 11, passes: 5, angle: 9 }),
      patch("apple-right-middle", appleBody, "red", 359, 238, 38, 33, { width: 12, passes: 5, angle: -8 }),
      patch("apple-right-low", appleBody, "red", 353, 300, 38, 31, { width: 12, passes: 5, angle: 10 }),
      patch("apple-right-base", appleBody, "red", 316, 340, 29, 14, { width: 10, passes: 5, angle: -7 }),
      patch("apple-centre-join", appleBody, "red", 307, 250, 26, 70, { width: 13, passes: 5, angle: 5 }),
      patch("apple-right-edge", appleBody, "red", 400, 255, 9, 45, { width: 10, passes: 4, angle: -5 }),
    ]],
    ["colour-apple-leaf", 8000, [patch("apple-green-leaf", g.apple["apple-leaf"], "green", 352, 105, 30, 7, { width: 6, angle: -9, passes: 4 })]],
  ], { "apple-stalk": { ink: "#92704e", width: 3.4, size: "s" }, "apple-shine": { ink: "#bc8c83", width: 1.6, size: "s" }, "leaf-vein": { ink: "#688052", width: 1.6, size: "s" }, "apple-ground": { ink: "#a49c8b", width: 1.6, size: "s" } }),
  fish: appearance([
    ["colour-fish-middle", 22000, [
      patch("fish-orange-back", g.fish["fish-body"], "orange", 245, 201, 43, 13, { width: 9, angle: -12 }),
      patch("fish-orange-left", g.fish["fish-body"], "orange", 203, 246, 24, 34, { width: 10, passes: 4, angle: 12 }),
      patch("fish-orange-centre", g.fish["fish-body"], "orange", 268, 240, 42, 37, { width: 11, passes: 5, angle: -12 }),
      patch("fish-orange-low", g.fish["fish-body"], "orange", 251, 281, 40, 16, { width: 11, passes: 4, angle: 11 }),
      patch("fish-orange-belly", g.fish["fish-body"], "orange", 300, 279, 27, 17, { width: 10, angle: -8 }),
    ]],
    ["colour-fish-face", 17000, [
      patch("fish-orange-high", g.fish["fish-body"], "orange", 337, 199, 27, 10, { width: 9, passes: 4, angle: 8 }),
      patch("fish-orange-cheek", g.fish["fish-body"], "orange", 356, 268, 25, 17, { width: 9, passes: 4, angle: -9 }),
      patch("fish-orange-face-join", g.fish["fish-body"], "orange", 321, 241, 15, 31, { width: 8, passes: 4, angle: 8 }),
      patch("fish-orange-front", g.fish["fish-body"], "orange", 389, 242, 4, 11, { width: 5 }),
    ]],
    ["colour-fish-tail", 10000, [patch("fish-golden-tail", g.fish["fish-tail"], "yellow", 104, 245, 18, 26, { width: 7, passes: 5 })]],
  ], { "fish-eye": { fill: "fill", ink: "#514e4b" }, "fish-mouth": { width: 1.8, size: "s" }, "upper-scale": { width: 1.6, size: "s" }, "middle-scale": { width: 1.6, size: "s" }, "lower-scale": { width: 1.6, size: "s" }, "near-bubble": { color: "light-blue", ink: "#8bb9c5", width: 2, size: "s" }, "higher-bubble": { color: "light-blue", ink: "#8bb9c5", width: 2, size: "s" } }),
  ladybird: appearance([
    ["colour-left-wing", 28000, [
      patch("ladybird-left-upper", leftWing, "red", 262, 191, 27, 17, { width: 9, passes: 5 }),
      patch("ladybird-left-connected", leftWing, "red", 254, 278, 33, 88, { width: 11, passes: 5, angle: -5 }),
      patch("ladybird-left-edge", leftWing, "red", 220, 282, 14, 55, { width: 10, passes: 5, angle: -6 }),
      patch("ladybird-left-middle-edge", leftWing, "red", 283, 287, 9, 84, { width: 8, passes: 4, angle: 5 }),
      patch("ladybird-left-lower", leftWing, "red", 272, 367, 16, 13, { width: 8, passes: 4 }),
    ]],
    ["colour-right-wing", 28000, [
      patch("ladybird-right-upper", rightWing, "red", 337, 192, 25, 17, { width: 9, passes: 5 }),
      patch("ladybird-right-connected", rightWing, "red", 350, 292, 34, 68, { width: 11, passes: 5, angle: 5 }),
      patch("ladybird-right-edge", rightWing, "red", 382, 282, 10, 40, { width: 9, passes: 4, angle: 6 }),
      patch("ladybird-right-middle", rightWing, "red", 316, 289, 5, 65, { width: 7, angle: -5 }),
      patch("ladybird-right-base", rightWing, "red", 325, 375, 9, 7, { width: 7 }),
    ]],
    ["colour-ladybird-head", 7000, [patch("ladybird-dark-head", head, "charcoal", 300, 130, 23, 6, { width: 6 })]],
    ["colour-ladybird-spots", 10000, [
      patch("ladybird-left-spot", g.ladybird["left-upper-spot"], "charcoal", 257, 234, 10, 9, { width: 4, strands: 2, passes: 4, angle: -12 }),
      patch("ladybird-right-spot", g.ladybird["right-spot"], "charcoal", 346, 265, 10, 10, { width: 4, strands: 2, passes: 4, angle: 12 }),
      patch("ladybird-low-spot", g.ladybird["left-lower-spot"], "charcoal", 265, 327, 10, 9, { width: 4, strands: 2, passes: 4, angle: -8 }),
    ]],
  ], { "wing-division": { width: 2.6, size: "s" }, "left-feeler": { width: 2, size: "s" }, "right-feeler": { width: 2, size: "s" } }),
  "ice-cream": appearance([
    ["colour-strawberry-scoop", 23000, [
      patch("ice-cream-top-pink", g["ice-cream"]["rounded-scoop"], "pink", 300, 177, 33, 8, { width: 8 }),
      patch("ice-cream-left-pink", g["ice-cream"]["rounded-scoop"], "pink", 256, 220, 20, 10, { width: 9 }),
      patch("ice-cream-right-pink", g["ice-cream"]["rounded-scoop"], "pink", 329, 221, 29, 10, { width: 9 }),
      patch("ice-cream-middle-pink", g["ice-cream"]["rounded-scoop"], "pink", 298, 210, 24, 16, { width: 10, passes: 4, angle: -8 }),
      patch("ice-cream-upper-middle-pink", g["ice-cream"]["rounded-scoop"], "pink", 300, 195, 44, 10, { width: 10, passes: 4, angle: 8 }),
      patch("ice-cream-scoop-base", g["ice-cream"]["rounded-scoop"], "pink", 300, 236, 45, 3, { width: 6 }),
    ]],
    ["colour-golden-cone", 24000, [
      patch("ice-cream-wide-cone", cone, "gold", 300, 279, 58, 15, { width: 10, passes: 5 }),
      patch("ice-cream-cone-join", cone, "gold", 298, 308, 42, 9, { width: 9, passes: 4, angle: -8 }),
      patch("ice-cream-middle-cone", cone, "gold", 300, 329, 32, 19, { width: 10, passes: 5, angle: 7 }),
      patch("ice-cream-low-cone", cone, "gold", 300, 349, 20, 7, { width: 7 }),
      patch("ice-cream-cone-tip", cone, "gold", 300, 370, 13, 14, { width: 7, passes: 4 }),
    ]],
    ["colour-cherry", 7000, [patch("ice-cream-red-cherry", g["ice-cream"].cherry, "red", 300, 130, 8, 7, { width: 4, strands: 2 })]],
  ], { "cherry-stalk": { color: "green", ink: "#78915e", width: 2.2, size: "s" }, "upper-cone-diagonal": { ink: "#a48557", width: 1.8, size: "s" }, "lower-cone-diagonal": { ink: "#a48557", width: 1.8, size: "s" }, "crossing-cone-line": { ink: "#a48557", width: 1.8, size: "s" }, "left-sprinkle": { color: "green", ink: "#83a56a", width: 3, size: "s" }, "upper-sprinkle": { color: "orange", ink: "#d7a14b", width: 3, size: "s" }, "right-sprinkle": { color: "red", ink: "#c7786b", width: 3, size: "s" } }),
  mushroom: appearance([
    ["colour-mushroom-cap", 32000, [
      patch("mushroom-upper-left", cap, "brown", 230, 154, 49, 27, { width: 11, passes: 5, angle: -8 }),
      patch("mushroom-upper-right", cap, "brown", 350, 153, 49, 27, { width: 11, passes: 5, angle: 7 }),
      patch("mushroom-middle-cap", cap, "brown", 292, 190, 54, 31, { width: 12, passes: 5, angle: -5 }),
      patch("mushroom-left-cap", cap, "brown", 181, 190, 19, 21, { width: 9, passes: 4, angle: -9 }),
      patch("mushroom-high-cap", cap, "brown", 300, 118, 38, 6, { width: 7, passes: 4 }),
    ]],
    ["colour-mushroom-edge", 20000, [
      patch("mushroom-cap-left", cap, "brown", 222, 221, 56, 9, { width: 10, passes: 5, angle: 6 }),
      patch("mushroom-cap-lower", cap, "brown", 326, 223, 52, 10, { width: 10, passes: 5, angle: -6 }),
      patch("mushroom-cap-right", cap, "brown", 427, 208, 24, 13, { width: 8, passes: 4, angle: 9 }),
    ]],
    ["colour-mushroom-stalk", 22000, [
      patch("mushroom-stalk-top", stalk, "cream", 298, 281, 35, 18, { width: 11, passes: 4, angle: 7 }),
      patch("mushroom-stalk-middle", stalk, "cream", 302, 320, 35, 18, { width: 11, passes: 4, angle: -8 }),
      patch("mushroom-stalk-low", stalk, "cream", 300, 356, 35, 18, { width: 11, passes: 4, angle: 7 }),
      patch("mushroom-stalk-base", stalk, "cream", 299, 395, 35, 17, { width: 11, passes: 4, angle: -7 }),
      patch("mushroom-stalk-join", stalk, "cream", 265, 352, 5, 45, { width: 6 }),
    ]],
  ], { "cap-inner-edge": { ink: "#9e846a", width: 1.7, size: "s" }, "left-grass": { color: "green", ink: "#82a66d", width: 3, size: "s" }, "right-grass": { color: "green", ink: "#82a66d", width: 3, size: "s" } }),
});
