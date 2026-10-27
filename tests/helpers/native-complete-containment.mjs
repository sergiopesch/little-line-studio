// Bounded SDK process: validate ink here, return compact evidence rather than
// transferring tens of megabytes of paths to the parent test runner.
import { writeFileSync } from "node:fs";
import { b64Vecs } from "@tldraw/tlschema";
import { getStroke } from "tldraw";
import { LESSONS } from "../../src/lesson-catalogue.js";
import { COMPLETE_REGISTRATIONS } from "../../src/lesson-packs.js";
import { getColourMarks } from "../../src/crayon-appearance.js";
import { pointsAtProgress } from "../../src/lesson-geometry.js";

function contourTest(boundary) {
  const bins = new Map();
  const left = Math.min(...boundary.map((p) => p.x)), right = Math.max(...boundary.map((p) => p.x));
  const top = Math.min(...boundary.map((p) => p.y)), bottom = Math.max(...boundary.map((p) => p.y));
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    for (let row = Math.floor(Math.min(a.y, b.y) / 4); row <= Math.floor(Math.max(a.y, b.y) / 4); row++) {
      if (!bins.has(row)) bins.set(row, []);
      bins.get(row).push([a, b]);
    }
  }
  return ({ x, y }) => {
    if (x <= left || x >= right || y <= top || y >= bottom) return false;
    let winding = 0;
    for (const [a, b] of bins.get(Math.floor(y / 4)) ?? []) {
      const side = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
      if (a.y <= y && b.y > y && side > 0) winding++;
      else if (a.y > y && b.y <= y && side < 0) winding--;
    }
    return winding !== 0;
  };
}
const tests = new WeakMap();
const halo = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * 0.5, Math.sin(i * Math.PI / 4) * 0.5]);
const results = [], failures = [];
for (const registration of COMPLETE_REGISTRATIONS) {
  const lesson = LESSONS.find((entry) => entry.id === registration.id);
  const regions = new Map(Object.values(registration.regions).flat().map((entry) => [entry.gestureId, entry.boundary]));
  let prefixes = 0, inkPoints = 0;
  const marks = getColourMarks(lesson);
  for (const mark of marks) {
    const boundary = regions.get(mark.gestureId);
    if (!boundary) { failures.push(`${mark.id}: missing independent region`); continue; }
    if (!tests.has(boundary)) tests.set(boundary, contourTest(boundary));
    const contains = tests.get(boundary);
    for (const progress of [0.01, 0.1, 0.25, 0.5, 0.75, 1]) {
      const origin = mark.points[0];
      const points = b64Vecs.decodePoints(b64Vecs.encodePoints(pointsAtProgress(mark, progress).map((point) => ({
        x: point.x - origin.x, y: point.y - origin.y, z: point.z,
      })))).map((point) => ({ x: point.x + origin.x, y: point.y + origin.y, z: point.z }));
      for (const solid of [false, true]) {
        const width = mark.width + 1;
        const envelope = getStroke(points, {
          size: solid ? width : 1 + width * 1.2,
          thinning: solid ? 0 : 0.62, streamline: 0.62, smoothing: 0.62,
          simulatePressure: false, last: true,
          easing: (t) => t * 0.65 + Math.sin(t * Math.PI / 2) * 0.35,
        });
        prefixes++;
        for (let i = 0; i < envelope.length; i++) {
          const from = envelope[i], to = envelope[(i + 1) % envelope.length];
          const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
          for (let part = 0; part <= count; part++) {
            const x = from.x + (to.x - from.x) * part / count;
            const y = from.y + (to.y - from.y) * part / count;
            inkPoints++;
            if (!halo.every(([dx, dy]) => contains({ x: x + dx, y: y + dy }))) {
              if (failures.length < 20) failures.push(`${mark.id}: ${progress}/${solid} ink leaves contour at ${x.toFixed(2)},${y.toFixed(2)}`);
            }
          }
        }
      }
    }
  }
  results.push({ id: lesson.id, nativeRecords: marks.length, prefixes, inkPoints });
}
writeFileSync(1, JSON.stringify({ results, failures }));
process.exit(0);
