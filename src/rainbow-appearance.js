import { arc, cubic, join } from "./lesson-geometry.js";
import { crayonGesture, crayonPhase, defineCrayonAppearance } from "./crayon-appearance.js";

const cloudTop = join(
  cubic([60, 340], [62, 315], [76, 304], [95, 316]),
  cubic([95, 316], [108, 277], [158, 277], [171, 311]),
  cubic([171, 311], [199, 288], [244, 310], [254, 340]),
);
export const RAINBOW_LEFT_CLOUD = Object.freeze(join(
  cloudTop,
  cubic([254, 340], [263, 380], [48, 380], [60, 340]),
).map(Object.freeze));
export const RAINBOW_RIGHT_CLOUD = Object.freeze(
  RAINBOW_LEFT_CLOUD.map((point) => Object.freeze({ ...point, x: 600 - point.x })),
);

function cloudHeight(x) {
  const localX = x > 300 ? 600 - x : x;
  if (localX < cloudTop[0].x || localX > cloudTop.at(-1).x) return Infinity;
  const index = cloudTop.findIndex((point) => point.x >= localX);
  if (index < 1) return cloudTop[0].y;
  const before = cloudTop[index - 1], after = cloudTop[index];
  return before.y + (after.y - before.y) * (localX - before.x) / (after.x - before.x);
}

const ellipsePoint = (rx, ry, degrees) => ({
  x: 300 + rx * Math.cos(degrees * Math.PI / 180),
  y: 340 + ry * Math.sin(degrees * Math.PI / 180),
});

// Every visible arch ends on a cloud puff. No white fill or masking rectangle
// hides stray construction lines inside the clouds.
export function rainbowArchStart(rx, ry, inset = 0) {
  let lower = 180, upper = 270;
  for (let iteration = 0; iteration < 40; iteration++) {
    const angle = (lower + upper) / 2;
    const point = ellipsePoint(rx, ry, angle);
    if (point.y <= cloudHeight(point.x) - inset) upper = angle;
    else lower = angle;
  }
  return upper;
}

export function rainbowArch(rx, ry) {
  const start = rainbowArchStart(rx, ry);
  return arc(300, 340, rx, ry, start, 540 - start);
}

export const RAINBOW_BOUNDARIES = Object.freeze([
  ["outer-arch", 210, 220, 10000],
  ["second-arch", 188, 198, 9000],
  ["third-arch", 166, 176, 8000],
  ["fourth-arch", 144, 154, 7000],
  ["fifth-arch", 122, 132, 6000],
  ["sixth-arch", 100, 110, 6000],
  ["seventh-arch", 78, 88, 5000],
  ["inner-arch", 56, 66, 5000],
].map(([id, rx, ry, durationMs]) => Object.freeze({ id, rx, ry, durationMs })));

export const RAINBOW_COLOURS = Object.freeze([
  "red", "orange", "yellow", "green", "blue", "indigo", "violet",
]);

const paintingDurations = [12000, 12000, 12000, 10000, 10000, 10000, 8000];
const colourPhases = Object.fromEntries(RAINBOW_COLOURS.map((colour, band) => {
  const outer = RAINBOW_BOUNDARIES[band], inner = RAINBOW_BOUNDARIES[band + 1];
  const rx = (outer.rx + inner.rx) / 2, ry = (outer.ry + inner.ry) / 2;
  // The crayon edge also stops clear of the cloud. Small sections and lifts
  // model a hand following a bend rather than a whole stripe being filled.
  const start = rainbowArchStart(rx, ry, 12);
  const span = 540 - 2 * start;
  const gestures = Array.from({ length: 6 }, (_, section) => {
    const from = start + span * section / 6;
    const to = start + span * (section + 1) / 6;
    let points = arc(300, 340, rx, ry, from, to).map((point, index, path) => {
      const wobble = Math.sin(index / (path.length - 1) * Math.PI * 2 + section) * 0.65;
      const dx = point.x - 300, dy = point.y - 340;
      const length = Math.hypot(dx, dy);
      return { ...point, x: point.x + wobble * dx / length, y: point.y + wobble * dy / length };
    });
    if (section % 2) points = points.reverse();
    return crayonGesture(`rainbow-${colour}-patch-${section}`, points, colour,
      { width: 11, opacity: 0.85, strands: 5 });
  });
  return [`colour-${colour}`, crayonPhase(paintingDurations[band], gestures)];
}));

export const RAINBOW_APPEARANCE = defineCrayonAppearance({
  palette: {
    red: { sdkColor: "red", ink: "#e76469", grain: "#cf505a" },
    orange: { sdkColor: "orange", ink: "#efa247", grain: "#dc8734" },
    yellow: { sdkColor: "yellow", ink: "#efd148", grain: "#d7b532" },
    green: { sdkColor: "green", ink: "#70b477", grain: "#569960" },
    blue: { sdkColor: "blue", ink: "#63a8d0", grain: "#488db7" },
    indigo: { sdkColor: "blue", ink: "#6676b5", grain: "#515f9e" },
    violet: { sdkColor: "violet", ink: "#a57cba", grain: "#8d63a5" },
  },
  outlineStyles: {
    default: { color: "grey", ink: "#7d8590", width: 1.1, fill: "none", dash: "draw", size: "s" },
    "left-cloud": { ink: "#8b9aa9", width: 1.6 },
    "right-cloud": { ink: "#8b9aa9", width: 1.6 },
  },
  colourPhases,
});
