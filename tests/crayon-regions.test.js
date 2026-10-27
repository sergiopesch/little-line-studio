import assert from "node:assert/strict";
import test from "node:test";
import { regionContains, regionPatch } from "../src/crayon-regions.js";

const contour = [
  { x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 60 },
  { x: 60, y: 60 }, { x: 60, y: 150 }, { x: 0, y: 150 },
];

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}

test("crayon movements stay inside a concave contour with safe clearance in either winding", () => {
  const makePatch = (boundary) => regionPatch({
    id: "concave-fixture", boundary, colour: "yellow",
    cx: 35, cy: 35, rx: 27, ry: 25, width: 6, strands: 3, passes: 4,
  });
  const forward = makePatch(contour);
  const reverse = makePatch([...contour].reverse());
  assert.deepEqual(reverse.gestures, forward.gestures);

  for (const gesture of forward.gestures) {
    const clearance = gesture.width * 0.9 + 2.5;
    for (const point of gesture.points) {
      assert.ok(regionContains(point, contour), "a crayon point stays within the subject");
      const distance = Math.min(...contour.map((edge, i) =>
        distanceToSegment(point, edge, contour[(i + 1) % contour.length])));
      assert.ok(distance + 1e-9 >= clearance, "the stroke stays clear of the outline");
    }
  }
});
