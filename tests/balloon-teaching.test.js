import test from "node:test";
import assert from "node:assert/strict";
import { b64Vecs, drawShapeProps } from "@tldraw/tlschema";
import { LESSONS } from "../src/lesson-catalogue.js";
import scripts from "../src/curriculum-scripts.json" with { type: "json" };
import { BALLOON_TEACHING_PACK } from "../src/balloon-teaching-pack.js";
import {
  BALLOON_APPEARANCE, BALLOON_BODY, BALLOON_COLOUR_REGIONS,
  BALLOON_LEFT_BOW, BALLOON_RIGHT_BOW,
} from "../src/balloon-appearance.js";
import { colouringState, getColourMarks, getOutlineStyle } from "../src/crayon-appearance.js";
import { getStepTiming, estimateLessonDurationMs } from "../src/scripted-session.js";

const balloon = LESSONS.find((lesson) => lesson.id === "balloon");
const close = (point, target) => Math.hypot(point.x - target.x, point.y - target.y) < 1e-8;

test("Balloon connects its rounded body, knot, string and independent optional bow loops", () => {
  assert.equal(balloon.appearance, BALLOON_APPEARANCE);
  assert.equal(balloon.strokes.length, 9);
  assert.ok(close(BALLOON_BODY[0], BALLOON_BODY.at(-1)));
  assert.ok(BALLOON_BODY.some((point) => close(point, { x: 300, y: 322 })));
  const knot = balloon.strokes.find((stroke) => stroke.id === "balloon-knot");
  const string = balloon.strokes.find((stroke) => stroke.id === "flowing-string");
  assert.ok(close(knot.points[0], { x: 300, y: 322 }));
  assert.ok(close(string.points[0], { x: 300, y: 337 }));
  for (const path of [BALLOON_LEFT_BOW, BALLOON_RIGHT_BOW]) {
    assert.ok(close(path[0], { x: 300, y: 333 }));
    assert.ok(close(path[0], path.at(-1)));
  }
  for (const stroke of balloon.strokes)
    assert.equal(getOutlineStyle(balloon, stroke).fill,
      stroke.id.endsWith("dot") ? "fill" : "none", stroke.id);
  assert.match(balloon.steps.find((step) => step.id === "right-bow-loop").hint,
    /either loop can stand alone/);
  assert.match(balloon.steps.find((step) => step.id === "middle-dot").spoken,
    /^Another dot can sit in the middle/);
  assert.doesNotMatch(balloon.steps.find((step) => step.id === "lower-dot").spoken,
    /between|next to the|first dot/);
});

test("Balloon has concise fixed teaching, complexity-based pacing and no spoken adult setup", () => {
  assert.equal(balloon.teachingPack.lessonId, "balloon");
  assert.equal(balloon.musicId, "balloon");
  assert.equal(balloon.concurrentTeaching, true);
  assert.equal(balloon.preparationCompletedBeforeStart, true);
  assert.equal(balloon.steps.length, 16);
  assert.equal(balloon.steps.some((step) => step.kind === "prepare"), false);
  assert.equal(balloon.steps.reduce((sum, step) => sum + (step.quietMs ?? 0), 0), 28000);
  assert.ok(balloon.steps.reduce((sum, step) => sum + step.spoken.length + step.hint.length, 0) <= 2600);
  assert.ok(estimateLessonDurationMs(balloon) <= 270000, "bounded text-only estimate before measured voice durations");
  for (const [index, stroke] of balloon.strokes.entries()) {
    const step = balloon.steps[stroke.step];
    assert.equal(step.instruction, scripts.balloon.actions[index].instruction);
    assert.equal(step.hint, scripts.balloon.actions[index].hint);
    assert.equal(step.spoken, BALLOON_TEACHING_PACK.draw[stroke.id].spoken);
    assert.equal(step.canSkip, index >= 3, stroke.id);
    assert.ok(step.quietMs >= 1000 && step.quietMs <= 4000, step.id);
  }
  assert.ok(balloon.strokes[0].durationMs > balloon.strokes[2].durationMs);
  assert.ok(balloon.strokes[2].durationMs > balloon.strokes.at(-1).durationMs);
  for (const step of balloon.steps) {
    assert.ok(step.instruction.split(/\s+/).length <= 15, step.id);
    assert.ok(step.spoken.split(/\s+/).length <= 25, step.id);
    assert.ok(step.hint.split(/\s+/).length <= 12, step.id);
    assert.doesNotMatch(`${step.spoken} ${step.hint}`, /grown[\s-]?up|parent|adult|supervis/i, step.id);
  }
  assert.equal(getStepTiming(balloon, balloon.steps.length - 1).holdOpen, true);
});

test("Balloon has required red-body colouring and genuinely optional yellow bow colouring", () => {
  assert.deepEqual(balloon.steps.filter((step) => step.kind === "colour").map((step) => step.id),
    ["colour-choice", "colour-body-left", "colour-body-right", "colour-bow", "colour-reflection"]);
  for (const phaseId of ["colour-body-left", "colour-body-right"]) {
    const stepIndex = balloon.steps.findIndex((step) => step.id === phaseId);
    assert.equal(balloon.steps[stepIndex].canSkip, false);
    assert.equal(getStepTiming(balloon, stepIndex).parallelTeaching, true);
    assert.equal(getStepTiming(balloon, stepIndex).demoMs, 16000);
  }
  const bow = balloon.steps.find((step) => step.id === "colour-bow");
  assert.equal(bow.canSkip, true);
  assert.match(bow.spoken, /^If you added a bow/);
  assert.match(bow.spoken, /knot can stay white/);
  assert.match(balloon.steps.find((step) => step.id === "colour-body-left").spoken,
    /leave the little shine white/);
  assert.match(balloon.steps.find((step) => step.id === "colour-body-right").spoken,
    /slow near the edge.*lift before going outside/);
  assert.notEqual(BALLOON_APPEARANCE.palette.red.ink, BALLOON_APPEARANCE.palette.yellow.ink);
  const marks = getColourMarks(balloon);
  assert.equal(marks.length, 128);
  assert.ok(marks.length + balloon.strokes.length < 300);
  for (const mark of marks) {
    const region = BALLOON_COLOUR_REGIONS[mark.phaseId].find((entry) => entry.gestureId === mark.gestureId);
    assert.ok(region?.boundary.length > 2, mark.id);
    assert.equal(mark.fill, "none");
    assert.equal(mark.closed, false);
    assert.equal(mark.isPen, true);
    for (const property of ["color", "fill", "dash", "size", "isPen"])
      assert.doesNotThrow(() => drawShapeProps[property].validate(mark[property]));
    const decoded = b64Vecs.decodePoints(b64Vecs.encodePoints(mark.points));
    assert.equal(decoded.length, mark.points.length);
    assert.ok(decoded.every((point) => point.x >= balloon.viewFrame.x &&
      point.x <= balloon.viewFrame.x + balloon.viewFrame.w &&
      point.y >= balloon.viewFrame.y && point.y <= balloon.viewFrame.y + balloon.viewFrame.h));
  }
});

test("Balloon colouring advances one hand gesture at a time, lifts and restarts replay", () => {
  const marks = getColourMarks(balloon);
  for (const [phaseId, phase] of Object.entries(balloon.appearance.colourPhases)) {
    const stepIndex = balloon.steps.findIndex((step) => step.id === phaseId);
    for (let elapsed = 0; elapsed <= phase.durationMs; elapsed += 53) {
      const states = colouringState(balloon, stepIndex, elapsed / phase.durationMs);
      const active = new Set(states.flatMap((state, index) => state.current ? [marks[index].gestureId] : []));
      assert.ok(active.size <= 1, phaseId);
    }
    for (const gesture of phase.gestures) {
      assert.ok(gesture.drawMs >= 400, gesture.id);
      const states = colouringState(balloon, stepIndex,
        (gesture.endMs + gesture.liftMs / 2) / phase.durationMs);
      assert.equal(states.some((state) => state.current), false, `${gesture.id}: lift`);
    }
    const replay = colouringState(balloon, stepIndex, 0);
    const completed = colouringState(balloon, stepIndex, 1);
    for (const [index, mark] of marks.entries()) {
      const owner = balloon.steps.findIndex((step) => step.id === mark.phaseId);
      if (owner < stepIndex) assert.equal(replay[index].progress, 1);
      else assert.equal(replay[index].visible, false);
      if (owner <= stepIndex) assert.equal(completed[index].progress, 1);
      else assert.equal(completed[index].visible, false);
    }
  }
});
