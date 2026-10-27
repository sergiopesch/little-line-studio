import { sampleEvenly } from "./lesson-geometry.js";
import { crayonCanvasPaint, crayonPaintIds } from "./crayon-grain.js";

/** @typedef {{x:number,y:number,z:number}} PressurePoint */
/** @typedef {import('@tldraw/tlschema').TLDefaultColorStyle} NativeColour */
/** @typedef {{sdkColor:NativeColour,ink:string,grain:string}} CrayonColour */
/** @typedef {{color?:NativeColour,fill?:'none'|'fill',dash?:'draw'|'solid',size?:'s'|'m'|'l'|'xl',ink?:string,width?:number}} OutlineStyle */
/** @typedef {{id:string,points:ReadonlyArray<PressurePoint>,colour:string,width:number,opacity:number,strands:number,seed:number}} CrayonPath */
/**
 * One physical movement of the crayon. Its native grain strands share a clock.
 * @typedef {CrayonPath & {drawMs:number,liftMs:number,startMs:number,endMs:number}} CrayonGesture
 */
/** @typedef {{durationMs:number,gestures:ReadonlyArray<CrayonGesture>}} CrayonPhase */
/**
 * Authored per lesson; no child input or model-generated drawing commands.
 * @typedef {{version:1,medium:'crayon',palette:Readonly<Record<string,CrayonColour>>,
 * outlineStyles:Readonly<Record<string,OutlineStyle>>,colourPhases:Readonly<Record<string,CrayonPhase>>}} CrayonAppearance
 */

const EMPTY = Object.freeze([]);
const COLOURS = new Set(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"]);
const HEX = /^#[a-f0-9]{6}$/i;
const nativeMarks = new WeakMap();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function seedFor(text) {
  let seed = 2166136261;
  for (const character of text) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function pathLength(points) {
  return points.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

// Pressure is authored after distance resampling, and changes along a stroke
// rather than fading a whole region onto the paper.
/**
 * @param {string} id
 * @param {PressurePoint[]} points
 * @param {string} colour
 * @param {Partial<Pick<CrayonPath,'width'|'opacity'|'strands'>>} options
 * @returns {CrayonPath}
 */
export function crayonGesture(id, points, colour, options = {}) {
  const seed = seedFor(id);
  const sampled = sampleEvenly(points, 2);
  const pressurePoints = sampled.map((point, index) => {
    const t = index / (sampled.length - 1);
    const pressure = 0.17 + Math.pow(Math.sin(Math.PI * t), 0.65) * 0.43 +
      Math.sin(t * Math.PI * 5 + (seed % 17)) * 0.055;
    return Object.freeze({ ...point, z: clamp(pressure, 0.12, 0.72) });
  });
  return Object.freeze({
    id, points: Object.freeze(pressurePoints), colour,
    width: options.width ?? 13, opacity: options.opacity ?? 0.7,
    strands: options.strands ?? 4, seed,
  });
}

// The existing lesson budget is divided into deliberate ink movements and real
// pen-up gaps. This is a local authored schedule, not a new progression clock.
/** @param {number} durationMs @param {ReadonlyArray<CrayonPath>} gestures @returns {CrayonPhase} */
export function crayonPhase(durationMs, gestures) {
  if (!Number.isInteger(durationMs) || durationMs < 1000 || !gestures.length)
    throw new TypeError("A crayon phase needs a bounded duration and gestures.");
  const lifts = gestures.map((gesture, index) => index === gestures.length - 1
    ? 160 : 140 + (gesture.seed % 4) * 20);
  const inkBudget = durationMs - lifts.reduce((sum, value) => sum + value, 0);
  const weights = gestures.map((gesture) => clamp(pathLength(gesture.points), 25, 100));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (inkBudget < gestures.length * 300)
    throw new TypeError("Too many crayon gestures for a patient demonstration.");
  let elapsed = 0;
  let cumulativeWeight = 0, allocatedExtra = 0;
  const scheduled = gestures.map((gesture, index) => {
    cumulativeWeight += weights[index];
    const nextExtra = Math.round((inkBudget - gestures.length * 300) * cumulativeWeight / totalWeight);
    const drawMs = 300 + nextExtra - allocatedExtra;
    allocatedExtra = nextExtra;
    const startMs = elapsed;
    const endMs = startMs + drawMs;
    elapsed = endMs + lifts[index];
    return Object.freeze({ ...gesture, drawMs, liftMs: lifts[index], startMs, endMs });
  });
  return Object.freeze({ durationMs, gestures: Object.freeze(scheduled) });
}

/**
 * @param {{palette:Record<string,CrayonColour>,outlineStyles:Record<string,OutlineStyle>,colourPhases:Record<string,CrayonPhase>}} definition
 * @returns {CrayonAppearance}
 */
export function defineCrayonAppearance({ palette, outlineStyles, colourPhases }) {
  const ids = new Set();
  let records = 0;
  for (const colour of Object.values(palette)) {
    if (!COLOURS.has(colour.sdkColor) || !HEX.test(colour.ink) || !HEX.test(colour.grain))
      throw new TypeError("A crayon palette must use native colours and fixed ink values.");
    Object.freeze(colour);
  }
  for (const phase of Object.values(colourPhases)) {
    if (!Number.isSafeInteger(phase.durationMs) || phase.durationMs < 1000 ||
        phase.durationMs > 120000 || !Array.isArray(phase.gestures) || !phase.gestures.length)
      throw new TypeError("A crayon phase needs a bounded authored schedule.");
    let nextStart = 0;
    for (const gesture of phase.gestures) {
      if (ids.has(gesture.id) || !palette[gesture.colour] ||
          !Number.isFinite(gesture.width) || gesture.width < 2 || gesture.width > 20 ||
          !Number.isFinite(gesture.opacity) || gesture.opacity <= 0 || gesture.opacity > 1 ||
          !Number.isInteger(gesture.strands) || gesture.strands < 2 || gesture.strands > 6 ||
          !Number.isSafeInteger(gesture.drawMs) || gesture.drawMs < 300 ||
          !Number.isSafeInteger(gesture.liftMs) || gesture.liftMs < 120 || gesture.liftMs > 220 ||
          gesture.startMs !== nextStart || gesture.endMs !== gesture.startMs + gesture.drawMs ||
          gesture.points.length < 2 || gesture.points.some((point) =>
            !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
            !Number.isFinite(point.z) || point.z < 0 || point.z > 1))
        throw new TypeError("Crayon gestures must have unique identity, pressure, ink and lift time.");
      ids.add(gesture.id);
      records += gesture.strands;
      nextStart = gesture.endMs + gesture.liftMs;
    }
    if (nextStart !== phase.durationMs)
      throw new TypeError("A crayon schedule must finish exactly at its authored duration.");
  }
  if (records >= 280) throw new TypeError("A lesson's native crayon records exceed the render budget.");
  for (const style of Object.values(outlineStyles)) Object.freeze(style);
  return Object.freeze({
    version: 1, medium: "crayon", palette: Object.freeze(palette),
    outlineStyles: Object.freeze(outlineStyles), colourPhases: Object.freeze(colourPhases),
  });
}

export function getOutlineStyle(lesson, stroke) {
  return {
    color: "black", fill: "none", dash: "solid", size: "m",
    ...lesson.appearance?.outlineStyles.default,
    ...lesson.appearance?.outlineStyles[stroke.id],
  };
}

// Narrow, slightly irregular lines travel together as one physical crayon
// stroke. Paper remains visible between them; there is no flat underpainting.
function grainPoints(gesture, strand) {
  return gesture.points.map((point, index, points) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const uneven = Math.sin(strand * 2.7 + gesture.seed % 11) * 0.055;
    const spread = ((strand + 0.5) / gesture.strands - 0.5 + uneven) * gesture.width;
    const roughness = (Math.sin(index * 0.53 + strand * 2.3 + gesture.seed % 23) * 0.9 +
      Math.sin(index * 1.7 + strand) * 0.35) * Math.min(1, gesture.width / 8);
    const displacement = spread + roughness;
    return Object.freeze({
      x: point.x - (dy / length) * displacement,
      y: point.y + (dx / length) * displacement,
      z: clamp(point.z + Math.sin(index * 0.8 + strand) * 0.05, 0.1, 0.76),
    });
  });
}

export function getColourMarks(lesson) {
  const appearance = lesson.appearance;
  if (!appearance || appearance.medium !== "crayon") return EMPTY;
  if (nativeMarks.has(appearance)) return nativeMarks.get(appearance);
  const marks = [];
  for (const [phaseId, phase] of Object.entries(appearance.colourPhases)) {
    for (const gesture of phase.gestures) {
      const colour = appearance.palette[gesture.colour];
      for (let strand = 0; strand < gesture.strands; strand++) {
        marks.push(Object.freeze({
          id: `${gesture.id}-grain-${strand}`, phaseId, gestureId: gesture.id,
          points: Object.freeze(grainPoints(gesture, strand)),
          color: colour.sdkColor, ink: colour.ink,
          grainVariant: (gesture.seed + strand) % 3,
          width: gesture.width / gesture.strands * (0.93 + (gesture.seed + strand * 7) % 5 * 0.065),
          fill: "none", closed: false, dash: "draw", size: "s", isPen: true,
          opacity: gesture.opacity * (strand % 3 === 1 ? 0.85 : 1),
          startMs: gesture.startMs, endMs: gesture.endMs, phaseDurationMs: phase.durationMs,
        }));
      }
    }
  }
  const frozen = Object.freeze(marks);
  nativeMarks.set(appearance, frozen);
  return frozen;
}

const easeHand = (t) => (1 - Math.cos(Math.PI * t)) / 2;

export function colouringState(lesson, stepIndex, progress = 0) {
  const marks = getColourMarks(lesson);
  if (!marks.length) return EMPTY;
  const step = lesson.steps[stepIndex];
  const fullReference = ["observe", "explore"].includes(step.kind);
  const phaseIndex = new Map(lesson.steps.map((entry, index) => [entry.id, index]));
  const bounded = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  return marks.map((mark) => {
    const owner = phaseIndex.get(mark.phaseId);
    const elapsed = (fullReference || owner < stepIndex ? 1 : owner === stepIndex ? bounded : 0) * mark.phaseDurationMs;
    const inkProgress = clamp((elapsed - mark.startMs) / (mark.endMs - mark.startMs), 0, 1);
    return {
      visible: inkProgress > 0,
      progress: easeHand(inkProgress),
      opacity: mark.opacity,
      current: owner === stepIndex && inkProgress > 0 && inkProgress < 1,
    };
  });
}

// Supported SDK display values only: native draw shapes still own their paths,
// pressure-sensitive ink, rendering, selection geometry and licensing.
export function nativeAppearanceDisplayValues(shape, namespace = "studio") {
  const style = shape.meta?.littleLineAppearance;
  if (!style || !HEX.test(style.ink)) return {};
  return {
    strokeColor: crayonPaintIds(style.ink, style.grainVariant, namespace)
      ? `url(#${crayonPaintIds(style.ink, style.grainVariant, namespace).pattern})`
      : style.ink,
    ...(Number.isFinite(style.width) && style.width >= 0.5 && style.width <= 20
      ? { strokeWidth: style.width } : {}),
  };
}

// The SDK's draw renderer adds one unit to an authored display width before
// drawing it. Canvas is already transformed into lesson coordinates here.
export function previewOutlineWidth(style, scale) {
  const { strokeWidth } = nativeAppearanceDisplayValues({
    meta: { littleLineAppearance: style },
  });
  return strokeWidth === undefined
    ? (style.size === "s" ? 3.2 : 6.5) / scale
    : strokeWidth + 1;
}

export function previewCrayonMark(context, mark) {
  context.globalAlpha = mark.opacity;
  context.fillStyle = crayonCanvasPaint(context, mark);
  // One continuous envelope avoids dark beads where translucent line segments
  // would overlap. The actual teaching board uses the SDK's pressure renderer.
  const left = [], right = [];
  mark.points.forEach((point, index, points) => {
    const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const pressure = 0.5 - 0.62 * (0.5 - point.z);
    const penEase = pressure * 0.65 + Math.sin(pressure * Math.PI / 2) * 0.35;
    const radius = (1 + (mark.width + 1) * 1.2) * penEase;
    left.push({ x: point.x - dy / length * radius, y: point.y + dx / length * radius });
    right.push({ x: point.x + dy / length * radius, y: point.y - dx / length * radius });
  });
  context.beginPath();
  context.moveTo(left[0].x, left[0].y);
  for (const point of [...left.slice(1), ...right.reverse()]) context.lineTo(point.x, point.y);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;
}
