// Test-only isolation: importing tldraw starts editor background timers. Use its
// public ink API in one bounded child, then exit without affecting node:test.
import { writeFileSync } from "node:fs";
import { b64Vecs } from "@tldraw/tlschema";
import { getStroke } from "tldraw";
import { LESSONS } from "../../src/lesson-catalogue.js";
import { pointsAtProgress } from "../../src/lesson-geometry.js";
import { getColourMarks, getOutlineStyle } from "../../src/crayon-appearance.js";

function encodedPrefix(mark, progress) {
  const origin = mark.points[0];
  return b64Vecs.decodePoints(b64Vecs.encodePoints(pointsAtProgress(mark, progress).map((point) => ({
    x: point.x - origin.x, y: point.y - origin.y, z: point.z,
  })))).map((point) => ({ x: point.x + origin.x, y: point.y + origin.y, z: point.z }));
}
const coordinates = (points) => points.map(({ x, y }) => ({ x, y }));
const marks = {};
for (const lesson of LESSONS.filter((entry) => ["cat", "sun", "rainbow", "balloon"].includes(entry.id))) {
  for (const mark of getColourMarks(lesson)) {
    marks[mark.id] = [0.01, 0.1, 0.25, 0.5, 0.75, 1].flatMap((progress) =>
      [false, true].map((solid) => {
        const width = mark.width + 1; // DrawShapeSvg adds one to display width.
        return { progress, solid, points: coordinates(getStroke(encodedPrefix(mark, progress), {
          size: solid ? width : 1 + width * 1.2,
          thinning: solid ? 0 : 0.62, streamline: 0.62, smoothing: 0.62,
          simulatePressure: false, last: true,
          easing: (t) => t * 0.65 + Math.sin(t * Math.PI / 2) * 0.35,
        })) };
      }));
  }
}
const sun = LESSONS.find((entry) => entry.id === "sun");
const rayIds = ["upward-ray", "downward-ray", "left-ray", "right-ray", "upper-left-ray", "upper-right-ray", "lower-left-ray", "lower-right-ray"];
const rays = rayIds.map((id) => {
  const stroke = sun.strokes.find((entry) => entry.id === id);
  const width = getOutlineStyle(sun, stroke).width + 1;
  return [false, true].map((solid) => coordinates(getStroke(encodedPrefix(stroke, 1), {
    size: width, thinning: solid ? 0 : 0.5, streamline: 0.64, smoothing: 0.62,
    simulatePressure: !solid, last: true,
    easing: solid ? (t) => t : (t) => Math.sin(t * Math.PI / 2),
  })));
});
writeFileSync(1, JSON.stringify({ marks, rays }));
process.exit(0);
