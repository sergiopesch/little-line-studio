import { cubic, sampleEvenly } from "./lesson-geometry.js";
import { crayonGesture } from "./crayon-appearance.js";

// Closed teacher contours, independent of the inset colouring movements.
export function regionContains(point, boundary) {
  let winding = 0;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    const crossesUp = a.y <= point.y && b.y > point.y;
    const crossesDown = a.y > point.y && b.y <= point.y;
    if (!crossesUp && !crossesDown) continue;
    const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
    if (crossesUp && side > 0) winding++;
    else if (crossesDown && side < 0) winding--;
  }
  return winding !== 0;
}

function hasEdgeClearance(point, boundary, margin) {
  const minimumSquared = margin * margin;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    // A segment whose bounding box is already outside the clearance circle
    // cannot be the nearest unsafe edge. Most contour segments end here.
    const xGap = Math.max(0, Math.min(a.x, b.x) - point.x, point.x - Math.max(a.x, b.x));
    const yGap = Math.max(0, Math.min(a.y, b.y) - point.y, point.y - Math.max(a.y, b.y));
    if (xGap * xGap + yGap * yGap >= minimumSquared) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const x = point.x - a.x - dx * t, y = point.y - a.y - dy * t;
    if (x * x + y * y < minimumSquared) return false;
  }
  return true;
}

/**
 * An authored small crayon patch, rather than a region fill or a hatch scan.
 * Each curved sweep lifts before returning. Trim the centre path conservatively
 * before creating grain; actual native ink is checked separately in tests.
 */
export function regionPatch({ id, boundary, colour, cx, cy, rx, ry, angle = 0, width = 8, strands = 3, passes = 3 }) {
  if (!id || !Array.isArray(boundary) || boundary.length < 3 ||
      ![cx, cy, rx, ry, angle, width].every(Number.isFinite) || rx <= 0 || ry <= 0 ||
      !Number.isInteger(passes) || passes < 1 || passes > 5)
    throw new TypeError("A crayon patch needs an authored contour and finite placement.");
  // Work along the patch's longer axis: a narrow upright patch needs upright
  // movements, rather than three tiny horizontal dashes spread far apart.
  const upright = ry > rx;
  const reach = upright ? ry : rx, spread = upright ? rx : ry;
  const broad = spread >= 8 && reach >= 20;
  // A broader held crayon deposits a more coherent layer of pigment while
  // pressure, gaps and paper grain keep each movement visibly hand made.
  if (broad) width = Math.min(20, width * 1.15);
  const radians = (angle + (upright ? 90 : 0)) * Math.PI / 180;
  const transform = (x, y) => [cx + x * Math.cos(radians) - y * Math.sin(radians), cy + x * Math.sin(radians) + y * Math.cos(radians)];
  const gestures = [], regions = [];
  const margin = width * 0.9 + 2.5;
  // Broader sweeps suit larger areas; keep the tighter original movement for
  // tiny features where even a small shift could miss the inset entirely.
  const spreadFactor = broad ? 0.68 : 0.58;
  const spacingVariation = broad ? 0.07 : 0.09;
  const reachFactor = broad ? 0.94 : 0.82;
  const reachVariation = broad ? 0.1 : 0.14;
  const taper = broad ? 0.35 : 0.45;
  let seed = 0;
  for (const character of id) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
  for (let pass = 0; pass < passes; pass++) {
    // Keep the same small gesture and lift count, but avoid identical rows.
    // A little irregularity in spacing and where each sweep starts makes a
    // patch read as repeated hand movements rather than a rectangular stamp.
    const variation = Math.sin((seed % 97) + pass * 2.3);
    const y = passes === 1 ? 0 : spread * (
      -spreadFactor + 2 * spreadFactor * pass / (passes - 1) + variation * spacingVariation
    );
    const direction = pass % 2 ? -1 : 1;
    const length = reach * (reachFactor + variation * reachVariation) * Math.sqrt(1 - (y / spread) ** 2 * taper);
    const shift = reach * Math.sin((seed % 53) * 0.7 + pass * 1.9) * 0.11;
    const bend = Math.min(spread * 0.62, reach * 0.2);
    const curve = cubic(
      transform(shift - length * direction, y - bend * 0.18),
      transform(shift - length * direction * 0.28, y + bend * (0.7 + variation * 0.3)),
      transform(shift + length * direction * 0.36, y - bend * (0.48 - variation * 0.2)),
      transform(shift + length * direction * (0.9 + variation * 0.05), y + bend * variation * 0.25),
    );
    let segment = [];
    const finish = () => {
      if (segment.length > 3 && Math.hypot(segment.at(-1).x - segment[0].x, segment.at(-1).y - segment[0].y) >= 3) {
        const gestureId = `${id}-sweep-${pass}-${gestures.length}`;
        gestures.push(crayonGesture(gestureId, segment, colour, { width, strands, opacity: 0.76 }));
        regions.push(Object.freeze({ gestureId, boundary }));
      }
      segment = [];
    };
    for (const point of sampleEvenly(curve, 0.75)) {
      if (regionContains(point, boundary) && hasEdgeClearance(point, boundary, margin)) segment.push(point);
      else finish();
    }
    finish();
  }
  if (!gestures.length) throw new TypeError(`Crayon patch ${id} has no safely inset movements.`);
  return Object.freeze({ gestures: Object.freeze(gestures), regions: Object.freeze(regions) });
}
