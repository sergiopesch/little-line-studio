import { test } from "node:test";
import assert from "node:assert/strict";
import { getLesson } from "../src/lesson-catalogue.js";

const turtle = getLesson("turtle");
const strokes = new Map(turtle.strokes.map((stroke) => [stroke.id, stroke]));

function edges(points) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ))
    : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

function inside(point, polygon) {
  let result = false;
  for (const [start, end] of edges(polygon)) {
    if (
      (start.y > point.y) !== (end.y > point.y) &&
      point.x < (end.x - start.x) * (point.y - start.y) /
        (end.y - start.y) + start.x
    ) result = !result;
  }
  return result;
}

function crosses(a, b, c, d) {
  const side = (start, end, point) =>
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);
  return side(a, b, c) * side(a, b, d) < 0 &&
    side(c, d, a) * side(c, d, b) < 0;
}

test("both ends of each turtle foot meet the shell contour", () => {
  const shellEdges = edges(strokes.get("turtle-shell").points);
  for (const footId of ["turtle-front-foot", "turtle-back-foot"]) {
    const foot = strokes.get(footId);
    for (const point of [foot.points[0], foot.points.at(-1)]) {
      const distance = Math.min(...shellEdges.map(([start, end]) =>
        distanceToSegment(point, start, end),
      ));
      assert.ok(distance <= 2.1, `${footId} misses shell by ${distance.toFixed(2)}`);
    }
  }
});

test("turtle toe segments stay inside the corresponding foot contour", () => {
  for (const position of ["front", "back"]) {
    const foot = strokes.get(`turtle-${position}-foot`);
    const toe = strokes.get(`turtle-${position}-toe`);
    // Closing the U-shaped foot at its two shell contacts defines its interior.
    const footEdges = edges(foot.points);
    for (const point of toe.points)
      assert.ok(inside(point, foot.points), `${position} toe point leaves foot`);
    for (let index = 1; index < toe.points.length; index++) {
      assert.equal(footEdges.some(([start, end]) =>
        crosses(toe.points[index - 1], toe.points[index], start, end),
      ), false, `${position} toe segment crosses foot edge`);
    }
  }
});
