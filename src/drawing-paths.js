// Authored lesson geometry. These coordinates are demonstrations, never a child's artwork.
export const DRAWING_FRAME = { x: 80, y: 70, w: 440, h: 380 };

function line(...coordinates) {
  return coordinates.map(([x, y]) => ({ x, y, z: 0.5 }));
}

function ellipse(cx, cy, rx, ry) {
  return Array.from({ length: 161 }, (_, index) => {
    const angle = -Math.PI / 2 + (index / 160) * Math.PI * 2;
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      z: 0.5,
    };
  });
}

function quadratic(start, control, end) {
  return Array.from({ length: 31 }, (_, index) => {
    const t = index / 30;
    const u = 1 - t;
    return {
      x: u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
      y: u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
      z: 0.5,
    };
  });
}

// Equal-distance samples keep the virtual pencil's movement steady through corners.
function sampleEvenly(points, spacing = 2) {
  const result = [points[0]];
  let remaining = spacing;
  let previous = points[0];
  for (const target of points.slice(1)) {
    let distance = Math.hypot(target.x - previous.x, target.y - previous.y);
    while (distance >= remaining && distance > 0) {
      const ratio = remaining / distance;
      previous = {
        x: previous.x + (target.x - previous.x) * ratio,
        y: previous.y + (target.y - previous.y) * ratio,
        z: 0.5,
      };
      result.push(previous);
      distance = Math.hypot(target.x - previous.x, target.y - previous.y);
      remaining = spacing;
    }
    remaining -= distance;
    previous = target;
  }
  result.push(points.at(-1));
  return result;
}

function stroke(id, step, points, durationMs, closed = false) {
  return { id, step, points: sampleEvenly(points), durationMs, closed };
}

export const CAT_STROKES = [
  stroke("head", 1, ellipse(300, 277, 131, 108), 12000, true),
  stroke("left-ear", 2, line([199, 209], [188, 104], [259, 175]), 8000),
  stroke("right-ear", 3, line([341, 175], [412, 104], [401, 209]), 8000),
  stroke("left-eye", 4, ellipse(255, 259, 5, 8), 5000, true),
  stroke("right-eye", 5, ellipse(345, 259, 5, 8), 5000, true),
  stroke(
    "nose",
    6,
    line([290, 284], [310, 284], [300, 295], [290, 284]),
    6000,
    true,
  ),
  stroke(
    "smile",
    7,
    [
      ...quadratic([278, 306], [289, 322], [300, 306]),
      ...quadratic([300, 306], [311, 322], [322, 306]).slice(1),
    ],
    7000,
  ),
  stroke("left-whisker-top", 8, line([246, 288], [126, 264]), 5000),
  stroke("left-whisker-middle", 9, line([244, 305], [119, 305]), 5000),
  stroke("left-whisker-bottom", 10, line([249, 322], [133, 347]), 5000),
  stroke("right-whisker-top", 11, line([354, 288], [474, 264]), 5000),
  stroke("right-whisker-middle", 12, line([356, 305], [481, 305]), 5000),
  stroke("right-whisker-bottom", 13, line([351, 322], [467, 347]), 5000),
];

export function pointsAtProgress(stroke, progress) {
  const bounded = Math.max(0, Math.min(1, progress));
  const position = bounded * (stroke.points.length - 1);
  const index = Math.floor(position);
  const points = stroke.points.slice(0, index + 1);
  const start = stroke.points[index];
  const end = stroke.points[index + 1];
  if (end) {
    const fraction = position - index;
    points.push({
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
      z: 0.5,
    });
  }
  return points;
}
