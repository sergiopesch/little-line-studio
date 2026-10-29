import type { ColourMark } from "./drawing/contracts.ts";

export const CRAYON_GRAIN_SIZE = 14;
const HEX = /^#[a-f0-9]{6}$/i;
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

// Vector paper flecks are shared by the native SVG ink and catalogue paint.
// Nothing is sampled from a changing path bound, camera or animation frame.
export function crayonGrainHoles(variant = 0) {
  let state = (0x6d2b79f5 + variant * 0x9e3779b9) >>> 0;
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 30 }, () => ({
    x: 0.8 + next() * (CRAYON_GRAIN_SIZE - 1.6),
    y: 0.8 + next() * (CRAYON_GRAIN_SIZE - 1.6),
    rx: 0.3 + next() * 0.85,
    ry: 0.25 + next() * 0.5,
    angle: next() * Math.PI,
  }));
}

export function crayonPaintIds(ink: unknown, variant: unknown, namespace = "studio") {
  if (typeof ink !== "string" || !HEX.test(ink) || typeof variant !== "number" || !Number.isInteger(variant) || variant < 0 || variant > 2) return null;
  const scope = String(namespace).replace(/[^a-z0-9_-]/gi, "");
  return {
    pattern: `little-line-${scope}-crayon-${ink.slice(1)}-${variant}`,
    mask: `little-line-${scope}-paper-${variant}`,
  };
}

export function crayonCanvasPaint(context: CanvasRenderingContext2D, mark: Pick<ColourMark, "ink" | "grainVariant" | "points">): CanvasPattern | string {
  let paints = patternCache.get(context);
  if (!paints) { paints = new Map(); patternCache.set(context, paints); }
  const key = `${mark.ink}:${mark.grainVariant}`;
  let pattern = paints.get(key);
  if (!pattern) {
    // This small CanvasPattern mirrors the SVG vector paint in the preview;
    // the teaching board itself renders native vector ink, never a bitmap.
    const tile = context.canvas.ownerDocument.createElement("canvas");
    const scale = 3;
    tile.width = tile.height = CRAYON_GRAIN_SIZE * scale;
    const ink = tile.getContext("2d");
    if (!ink) return mark.ink;
    ink.scale(scale, scale);
    ink.fillStyle = mark.ink;
    ink.fillRect(0, 0, CRAYON_GRAIN_SIZE, CRAYON_GRAIN_SIZE);
    ink.globalCompositeOperation = "destination-out";
    for (const hole of crayonGrainHoles(mark.grainVariant)) {
      ink.beginPath();
      ink.ellipse(hole.x, hole.y, hole.rx, hole.ry, hole.angle, 0, Math.PI * 2);
      ink.fill();
    }
    pattern = context.createPattern(tile, "repeat") ?? undefined;
    if (!pattern) return mark.ink;
    paints.set(key, pattern);
  }
  const origin = mark.points[0];
  if (!origin) throw new TypeError("A crayon paint needs an authored origin.");
  pattern.setTransform({ a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: origin.x, f: origin.y });
  return pattern;
}
