// Functional teaching geometry: authored marks, never captured child artwork.
export const DEFAULT_FRAME = Object.freeze({ x: 0, y: 0, w: 600, h: 480 });
export const line = (...points) => points.map(([x, y]) => ({ x, y, z: 0.5 }));
export function arc(cx, cy, rx, ry, start = -90, end = 270, rotation = 0) {
  const count = Math.max(12, Math.ceil(Math.abs(end - start) / 3));
  const tilt = (rotation * Math.PI) / 180;
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = ((start + ((end - start) * i) / count) * Math.PI) / 180;
    const x = rx * Math.cos(angle),
      y = ry * Math.sin(angle);
    return {
      x: cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      y: cy + x * Math.sin(tilt) + y * Math.cos(tilt),
      z: 0.5,
    };
  });
}
export const ellipse = (cx, cy, rx, ry, rotation = 0) =>
  arc(cx, cy, rx, ry, -90, 270, rotation);
export function quad(start, control, end) {
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40,
      u = 1 - t;
    return {
      x: u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
      y: u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
      z: 0.5,
    };
  });
}
export function cubic(start, first, second, end) {
  return Array.from({ length: 61 }, (_, i) => {
    const t = i / 60,
      u = 1 - t;
    return {
      x:
        u * u * u * start[0] +
        3 * u * u * t * first[0] +
        3 * u * t * t * second[0] +
        t * t * t * end[0],
      y:
        u * u * u * start[1] +
        3 * u * u * t * first[1] +
        3 * u * t * t * second[1] +
        t * t * t * end[1],
      z: 0.5,
    };
  });
}
export const join = (...paths) =>
  paths.flatMap((path, index) => (index ? path.slice(1) : path));
export const rect = (x, y, w, h) =>
  line([x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]);
export const dot = (x, y, r = 3) => ellipse(x, y, r, r);
export function mark(id, points, durationMs = 7000, closed = false) {
  return { id, points, durationMs, closed };
}

// One teaching action may need a pencil lift where a foreground shape hides
// its contour. Each part becomes its own genuine native draw record.
export function multiMark(id, parts, durationMs = 7000) {
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 8 ||
      parts.some((part) => !Array.isArray(part) || part.length < 2 || part.some((point) =>
        !Number.isFinite(point.x) || !Number.isFinite(point.y))))
    throw new TypeError("A multipart mark needs two to eight authored contours.");
  return { id, points: parts.flat(), parts, durationMs, closed: false };
}

// Resample by distance so animation does not accelerate through sparse sections.
export function sampleEvenly(points, spacing = 2) {
  const result = [{ ...points[0] }];
  let remaining = spacing,
    previous = points[0];
  for (const target of points.slice(1)) {
    let distance = Math.hypot(target.x - previous.x, target.y - previous.y);
    while (distance >= remaining && distance > 0) {
      const ratio = remaining / distance;
      previous = {
        x: previous.x + (target.x - previous.x) * ratio,
        y: previous.y + (target.y - previous.y) * ratio,
        z: (previous.z ?? 0.5) + ((target.z ?? 0.5) - (previous.z ?? 0.5)) * ratio,
      };
      result.push(previous);
      distance = Math.hypot(target.x - previous.x, target.y - previous.y);
      remaining = spacing;
    }
    remaining -= distance;
    previous = target;
  }
  result.push({ ...points.at(-1) });
  return result;
}
export function pointsAtProgress(stroke, progress) {
  if (stroke.parts) throw new TypeError("Sample individual native contours, never join a multipart pencil lift.");
  const bounded = Math.max(0, Math.min(1, progress));
  const position = bounded * (stroke.points.length - 1),
    index = Math.floor(position);
  const result = stroke.points.slice(0, index + 1),
    start = stroke.points[index],
    end = stroke.points[index + 1];
  if (end) {
    const t = position - index;
    result.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: (start.z ?? 0.5) + ((end.z ?? 0.5) - (start.z ?? 0.5)) * t,
    });
  }
  return result;
}
