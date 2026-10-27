import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LESSONS } from "../src/lesson-catalogue.js";
import { getColourMarks } from "../src/crayon-appearance.js";
import { RAINBOW_BOUNDARIES, RAINBOW_COLOURS, RAINBOW_LEFT_CLOUD, RAINBOW_RIGHT_CLOUD } from "../src/rainbow-appearance.js";
import { BALLOON_BODY, BALLOON_COLOUR_REGIONS } from "../src/balloon-appearance.js";

const ellipseContains = (point, cx, cy, rx, ry) =>
  ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2 < 1;
const polygonBounds = new WeakMap();
const polygonContains = (point, polygon) => {
  if (!polygonBounds.has(polygon)) polygonBounds.set(polygon, {
    left: Math.min(...polygon.map((p) => p.x)), right: Math.max(...polygon.map((p) => p.x)),
    top: Math.min(...polygon.map((p) => p.y)), bottom: Math.max(...polygon.map((p) => p.y)),
  });
  const bounds = polygonBounds.get(polygon);
  if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return false;
  let winding = 0;
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index], to = polygon[(index + 1) % polygon.length];
    const side = (to.x - from.x) * (point.y - from.y) - (point.x - from.x) * (to.y - from.y);
    if (from.y <= point.y && to.y > point.y && side > 0) winding++;
    else if (from.y > point.y && to.y <= point.y && side < 0) winding--;
  }
  return winding !== 0;
};
const polygon = (coordinates) => coordinates.map(([x, y]) => ({ x, y }));
const catLeftEar = polygon([[194, 175], [190, 86], [265, 139]]);
const catRightEar = polygon([[406, 175], [410, 86], [335, 139]]);
const catNose = polygon([[286, 259], [314, 259], [300, 273]]);
const insideCat = (point, mark) => {
  if (mark.id.includes("nose")) return polygonContains(point, catNose);
  if (mark.id.includes("ear")) return polygonContains(point, mark.id.includes("left") ? catLeftEar : catRightEar);
  return ellipseContains(point, 300, 250, 140, 115) ||
    polygonContains(point, catLeftEar) || polygonContains(point, catRightEar);
};

// The worker uses the public SDK API and the board's origin-relative b64Vecs
// encoding. Keep the parent runner free of the SDK editor's background timers.
const native = JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(new URL("./helpers/native-ink-envelope.mjs", import.meta.url))],
  { encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024 }));

// The SVG uses quadratic curves through track midpoints and round caps. Checking
// the SDK track/control envelope, intermediate edge points, and a 0.5-unit halo
// is conservative at both normal and low-zoom solid rendering sizes. Paper-grain
// holes can only remove ink from this envelope; they cannot enlarge it.
const halo = Array.from({ length: 8 }, (_, index) => ({
  x: Math.cos(index * Math.PI / 4) * 0.5, y: Math.sin(index * Math.PI / 4) * 0.5,
}));
function assertEnvelopeInside(mark, contains) {
  for (const { progress, solid, points: envelope } of native.marks[mark.id]) {
    assert.ok(envelope.length, `${mark.id}: actual SDK ink must exist`);
    for (const [index, from] of envelope.entries()) {
      const to = envelope[(index + 1) % envelope.length];
      const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
      for (let part = 0; part <= count; part++) {
        const point = { x: from.x + (to.x - from.x) * part / count, y: from.y + (to.y - from.y) * part / count };
        assert.ok(halo.every((offset) => contains({ x: point.x + offset.x, y: point.y + offset.y })),
          `${mark.id}: ${solid ? "solid zoom" : "pressure ink"} at ${progress} leaves its region near (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
      }
    }
  }
}

const byId = (id) => LESSONS.find((lesson) => lesson.id === id);

test("every coloured pack has an independent containment contract and a supported native width", () => {
  assert.equal(LESSONS.filter((lesson) => lesson.appearance).length, 30);
  for (const lesson of LESSONS.filter((entry) => ["cat", "sun", "rainbow", "balloon"].includes(entry.id))) {
    for (const mark of getColourMarks(lesson)) {
      // Otherwise nativeAppearanceDisplayValues would decline the override and
      // the SDK would render its default width instead of the tested envelope.
      assert.ok(mark.width >= 0.5 && mark.width <= 20, `${mark.id}: supported display width`);
      assert.equal(native.marks[mark.id].length, 12, `${mark.id}: all prefixes and zoom modes tested`);
    }
  }
});

test("Cat's full grain, pressure width and partial round caps stay inside the head, ears and tiny nose", () => {
  for (const mark of getColourMarks(byId("cat"))) assertEnvelopeInside(mark, (point) => insideCat(point, mark));
});

test("Sun centre and warmth remain inside the circle, while ray colouring stays inside its native outline", () => {
  const sun = byId("sun");
  const rayEnvelopes = native.rays;
  for (const mark of getColourMarks(sun)) {
    if (mark.phaseId !== "colour-rays") assertEnvelopeInside(mark, (point) => ellipseContains(point, 300, 240, 95, 95));
    else {
      const index = Number(mark.gestureId.split("-").at(-1));
      assertEnvelopeInside(mark, (point) => rayEnvelopes[index].every((outline) => polygonContains(point, outline)));
    }
  }
});

test("Every Rainbow colour's rendered grain stays within its own band and clear of both white clouds", () => {
  const rainbow = byId("rainbow");
  for (const mark of getColourMarks(rainbow)) {
    const index = RAINBOW_COLOURS.indexOf(mark.phaseId.replace("colour-", ""));
    const outer = RAINBOW_BOUNDARIES[index], inner = RAINBOW_BOUNDARIES[index + 1];
    assertEnvelopeInside(mark, (point) =>
      ellipseContains(point, 300, 340, outer.rx, outer.ry) &&
      !ellipseContains(point, 300, 340, inner.rx, inner.ry) &&
      !polygonContains(point, RAINBOW_LEFT_CLOUD) && !polygonContains(point, RAINBOW_RIGHT_CLOUD));
  }
});

test("Balloon's full crayon envelope stays in the authored body or individual bow loop", () => {
  const balloon = byId("balloon");
  const regions = new Map(Object.values(BALLOON_COLOUR_REGIONS).flat().map((entry) => [entry.gestureId, entry.boundary]));
  for (const mark of getColourMarks(balloon)) {
    const boundary = regions.get(mark.gestureId);
    assert.ok(boundary, `${mark.gestureId}: every native strand needs an intended region`);
    assertEnvelopeInside(mark, (point) => boundary === BALLOON_BODY
      ? ellipseContains(point, 300, 190, 105, 132) : polygonContains(point, boundary));
  }
});
