import test from "node:test";
import assert from "node:assert/strict";
import { b64Vecs, drawShapeProps } from "@tldraw/tlschema";
import { LESSONS } from "../src/lesson-catalogue.js";
import { RAINBOW_TEACHING_PACK } from "../src/rainbow-teaching-pack.js";
import {
  RAINBOW_APPEARANCE, RAINBOW_BOUNDARIES, RAINBOW_COLOURS,
  RAINBOW_LEFT_CLOUD, RAINBOW_RIGHT_CLOUD,
} from "../src/rainbow-appearance.js";
import { colouringState, getColourMarks, getOutlineStyle } from "../src/crayon-appearance.js";
import { getStepTiming } from "../src/scripted-session.js";

const rainbow = LESSONS.find((lesson) => lesson.id === "rainbow");
const distanceToPath = (point, path) => Math.min(...path.slice(1).map((to, index) => {
  const from = path[index], dx = to.x - from.x, dy = to.y - from.y;
  const t = Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}));

test("Rainbow has eight nested boundaries for seven named colour strips and two joined clouds", () => {
  assert.equal(rainbow.appearance, RAINBOW_APPEARANCE);
  assert.equal(rainbow.strokes.length, 10);
  assert.equal(RAINBOW_BOUNDARIES.length, RAINBOW_COLOURS.length + 1);
  assert.deepEqual(RAINBOW_COLOURS, ["red", "orange", "yellow", "green", "blue", "indigo", "violet"]);
  const arches = rainbow.strokes.slice(0, 8);
  for (const [index, stroke] of arches.entries()) {
    assert.equal(stroke.id, RAINBOW_BOUNDARIES[index].id);
    assert.ok(distanceToPath(stroke.points[0], RAINBOW_LEFT_CLOUD) < 0.001, `${stroke.id}: left cloud join`);
    assert.ok(distanceToPath(stroke.points.at(-1), RAINBOW_RIGHT_CLOUD) < 0.001, `${stroke.id}: right cloud join`);
    assert.ok(Math.abs(stroke.points[0].x + stroke.points.at(-1).x - 600) < 1e-8);
    assert.ok(Math.abs(stroke.points[0].y - stroke.points.at(-1).y) < 1e-8);
    if (index) assert.ok(Math.min(...stroke.points.map((point) => point.y)) >
      Math.min(...arches[index - 1].points.map((point) => point.y)) + 20);
    assert.equal(getOutlineStyle(rainbow, stroke).fill, "none");
  }
  assert.equal(rainbow.strokes[8].closed, true);
  assert.equal(rainbow.strokes[9].closed, true);
  assert.equal(getOutlineStyle(rainbow, rainbow.strokes[8]).fill, "none");
  assert.ok(RAINBOW_LEFT_CLOUD.every((point, index) =>
    Math.abs(point.x + RAINBOW_RIGHT_CLOUD[index].x - 600) < 1e-8 &&
    point.y === RAINBOW_RIGHT_CLOUD[index].y));
});

test("Rainbow teaches the exact marks with concise speech, short practice windows and open exploration", () => {
  assert.equal(rainbow.teachingPack.lessonId, "rainbow");
  assert.equal(rainbow.musicId, "rainbow");
  assert.equal(rainbow.concurrentTeaching, true);
  assert.equal(rainbow.preparationCompletedBeforeStart, true);
  assert.equal(rainbow.steps.length, 21);
  assert.equal(rainbow.steps.some((step) => step.kind === "prepare"), false);
  assert.deepEqual(rainbow.steps.filter((step) => step.kind === "colour").map((step) => step.id),
    ["colour-choice", ...RAINBOW_COLOURS.map((colour) => `colour-${colour}`), "colour-reflection"]);
  assert.match(rainbow.steps[0].spoken, /Sunlight.*tiny water drops.*many colours/);
  assert.match(rainbow.steps.find((step) => step.id === "colour-choice").spoken,
    /Our picture uses seven named colours.*Real rainbows have colours blending together/);
  assert.match(rainbow.steps.find((step) => step.id === "inner-arch").spoken, /eight lines.*seven spaces/);
  assert.match(rainbow.steps.find((step) => step.id === "colour-red").spoken, /red on the outside/);
  assert.match(rainbow.steps.find((step) => step.id === "colour-violet").spoken, /innermost strip.*clouds white/);
  for (const stroke of rainbow.strokes)
    assert.equal(rainbow.steps[stroke.step].spoken, RAINBOW_TEACHING_PACK.draw[stroke.id].spoken);
  for (const step of rainbow.steps) {
    assert.ok(step.instruction.split(/\s+/).length <= 15, step.id);
    assert.ok(step.spoken.split(/\s+/).length <= 25, step.id);
    assert.ok(step.hint.split(/\s+/).length >= 8, step.id);
    assert.ok(step.hint.split(/\s+/).length <= 12, step.id);
    assert.doesNotMatch(`${step.spoken} ${step.hint}`, /grown[\s-]?up|parent|adult|supervis/i, step.id);
    if (step.kind === "draw") assert.ok(step.quietMs >= 2000 && step.quietMs <= 5000, step.id);
    if (step.kind === "colour") assert.ok(step.quietMs <= 6000, step.id);
  }
  assert.ok(rainbow.steps.reduce((sum, step) => sum + step.spoken.length + step.hint.length, 0) <= 3600);
  assert.equal(rainbow.steps.reduce((sum, step) => sum + (step.quietMs ?? 0), 0), 38000);
  assert.equal(getStepTiming(rainbow, rainbow.steps.length - 1).holdOpen, true);
  assert.equal(rainbow.steps.at(-1).canSkip, true);
});

test("Rainbow colour paths stay in the correct curved strip with native grain and pressure", () => {
  const marks = getColourMarks(rainbow);
  assert.equal(marks.length, 210);
  assert.ok(marks.length + rainbow.strokes.length < 300);
  for (const [band, colour] of RAINBOW_COLOURS.entries()) {
    const phaseId = `colour-${colour}`, phase = rainbow.appearance.colourPhases[phaseId];
    const outer = RAINBOW_BOUNDARIES[band], inner = RAINBOW_BOUNDARIES[band + 1];
    const radiusAt = (point, boundary) =>
      ((point.x - 300) / boundary.rx) ** 2 + ((point.y - 340) / boundary.ry) ** 2;
    assert.equal(phase.gestures.length, 6);
    for (const gesture of phase.gestures) {
      assert.equal(gesture.colour, colour);
      assert.ok(gesture.points.every((point) => radiusAt(point, outer) < 1 && radiusAt(point, inner) > 1), gesture.id);
    }
    const directions = phase.gestures.map((gesture) => Math.sign(gesture.points.at(-1).x - gesture.points[0].x));
    assert.ok(directions.includes(-1) && directions.includes(1), phaseId);
  }
  for (const mark of marks) {
    assert.equal(mark.fill, "none");
    assert.equal(mark.closed, false);
    assert.equal(mark.isPen, true);
    assert.ok(mark.points.some((point) => point.z < 0.3));
    assert.ok(mark.points.some((point) => point.z > 0.5));
    for (const property of ["color", "fill", "dash", "size", "isPen"])
      assert.doesNotThrow(() => drawShapeProps[property].validate(mark[property]));
    const decoded = b64Vecs.decodePoints(b64Vecs.encodePoints(mark.points));
    assert.equal(decoded.length, mark.points.length);
    assert.ok(decoded.every((point) => point.x >= rainbow.viewFrame.x &&
      point.x <= rainbow.viewFrame.x + rainbow.viewFrame.w &&
      point.y >= rainbow.viewFrame.y && point.y <= rainbow.viewFrame.y + rainbow.viewFrame.h));
  }
});

test("Rainbow paints one physical movement at a time, lifts between patches and resets replay", () => {
  const marks = getColourMarks(rainbow);
  for (const [phaseId, phase] of Object.entries(rainbow.appearance.colourPhases)) {
    const stepIndex = rainbow.steps.findIndex((step) => step.id === phaseId);
    for (let elapsed = 0; elapsed <= phase.durationMs; elapsed += 59) {
      const states = colouringState(rainbow, stepIndex, elapsed / phase.durationMs);
      const active = new Set(states.flatMap((state, index) => state.current ? [marks[index].gestureId] : []));
      assert.ok(active.size <= 1, phaseId);
    }
    for (const gesture of phase.gestures) {
      const states = colouringState(rainbow, stepIndex,
        (gesture.endMs + gesture.liftMs / 2) / phase.durationMs);
      assert.equal(states.some((state) => state.current), false, `${gesture.id}: lifted`);
    }
    const replay = colouringState(rainbow, stepIndex, 0);
    const completed = colouringState(rainbow, stepIndex, 1);
    for (const [index, mark] of marks.entries()) {
      const owner = rainbow.steps.findIndex((step) => step.id === mark.phaseId);
      if (owner < stepIndex) assert.equal(replay[index].progress, 1);
      else assert.equal(replay[index].visible, false);
      if (owner <= stepIndex) assert.equal(completed[index].progress, 1);
      else assert.equal(completed[index].visible, false);
    }
  }
});
