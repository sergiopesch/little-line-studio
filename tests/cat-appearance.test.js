import test from "node:test";
import assert from "node:assert/strict";
import { b64Vecs, drawShapeProps } from "@tldraw/tlschema";
import { LESSONS } from "../src/lesson-catalogue.js";
import { CAT_APPEARANCE } from "../src/cat-appearance.js";
import { SUN_APPEARANCE } from "../src/sun-appearance.js";
import {
  colouringState, crayonGesture, crayonPhase, defineCrayonAppearance, getColourMarks, getOutlineStyle,
  nativeAppearanceDisplayValues, previewOutlineWidth,
} from "../src/crayon-appearance.js";
import { getDemonstrationForStep } from "../src/demonstration-state.js";

const cat = LESSONS.find((lesson) => lesson.id === "cat");
const sun = LESSONS.find((lesson) => lesson.id === "sun");

test("the preview honours authored outline widths in lesson coordinates", () => {
  const ray = sun.strokes.find((stroke) => stroke.id === "upward-ray");
  const style = getOutlineStyle(sun, ray);
  assert.equal(previewOutlineWidth(style, 0.75), 8);
  assert.equal(previewOutlineWidth(style, 1.5), 8);
  // Invalid or absent native overrides keep the existing size-based fallback.
  assert.equal(previewOutlineWidth({ ...style, width: 21, size: "s" }, 2), 1.6);
  assert.equal(previewOutlineWidth({ size: "m" }, 2), 3.25);
});

test("a tiny contained crayon movement keeps a deliberate minimum beside longer sweeps", () => {
  const long = crayonGesture("timing-long", [{ x: 0, y: 0 }, { x: 160, y: 0 }], "yellow");
  const tiny = crayonGesture("timing-tiny", [{ x: 0, y: 0 }, { x: 3, y: 0 }], "yellow");
  const phase = crayonPhase(3000, [long, tiny]);
  assert.ok(phase.gestures.every((gesture) => gesture.drawMs >= 300));
  assert.equal(phase.gestures.at(-1).endMs + phase.gestures.at(-1).liftMs, 3000);
  assert.ok(phase.gestures[0].drawMs > phase.gestures[1].drawMs);
});

test("rounding a tight crayon schedule preserves the final tiny movement", () => {
  const gestures = [100, 100, 100, 25].map((length, index) =>
    crayonGesture(`tight-rounding-${index}`, [{ x: 0, y: index * 20 }, { x: length, y: index * 20 }], "yellow"));
  const lifts = crayonPhase(10000, gestures).gestures.reduce((sum, gesture) => sum + gesture.liftMs, 0);
  const durationMs = gestures.length * 300 + lifts + 2;
  const phase = crayonPhase(durationMs, gestures);
  assert.ok(phase.gestures.every((gesture) => gesture.drawMs >= 300));
  assert.equal(phase.gestures.at(-1).endMs + phase.gestures.at(-1).liftMs, durationMs);
});

test("cat keeps matched feline ears and eyes, with a joined friendly smile", () => {
  const mark = (id) => cat.strokes.find((stroke) => stroke.id === id);
  for (const [left, right] of [["left-ear", "right-ear"], ["left-eye", "right-eye"]]) {
    const a = mark(left), b = mark(right);
    assert.equal(a.durationMs, b.durationMs);
    const bounds = (stroke) => ({
      minX: Math.min(...stroke.points.map((point) => point.x)),
      maxX: Math.max(...stroke.points.map((point) => point.x)),
      minY: Math.min(...stroke.points.map((point) => point.y)),
      maxY: Math.max(...stroke.points.map((point) => point.y)),
    });
    const aa = bounds(a), bb = bounds(b);
    assert.ok(Math.abs(aa.minX + bb.maxX - 600) < 0.1, left);
    assert.ok(Math.abs(aa.maxX + bb.minX - 600) < 0.1, left);
    assert.ok(Math.abs(aa.minY - bb.minY) < 0.1, left);
    assert.ok(Math.abs(aa.maxY - bb.maxY) < 0.1, left);
  }
  assert.equal(getOutlineStyle(cat, mark("left-eye")).fill, "fill");
  assert.equal(getOutlineStyle(cat, mark("right-eye")).fill, "fill");
  assert.equal(getOutlineStyle(cat, mark("round-head")).fill, "none");
  assert.ok(mark("curved-mouth").points.some((point) => Math.abs(point.x - 300) < 1 && Math.abs(point.y - 282) < 1));
});

test("Cat and Sun packs compile into bounded native pressure-sensitive crayon strokes with no polygon fills", () => {
  assert.equal(cat.appearance, CAT_APPEARANCE);
  assert.equal(sun.appearance, SUN_APPEARANCE);
  for (const lesson of [cat, sun]) {
    const marks = getColourMarks(lesson);
    assert.equal(getColourMarks(lesson), marks, "Native geometry is cached for stable SDK identities.");
    assert.ok(marks.length > 100);
    assert.ok(marks.length + lesson.strokes.length < 300);
    assert.equal(new Set(marks.map((mark) => mark.id)).size, marks.length);
    for (const mark of marks) {
      assert.ok(lesson.steps.some((step) => step.id === mark.phaseId), mark.id);
      assert.equal(mark.fill, "none", mark.id);
      assert.equal(mark.closed, false, mark.id);
      assert.equal(mark.isPen, true, mark.id);
      assert.ok(mark.points.some((point) => point.z > 0.5), mark.id);
      assert.ok(mark.points.some((point) => point.z < 0.3), mark.id);
      for (const property of ["color", "fill", "dash", "size", "isPen"])
        assert.doesNotThrow(() => drawShapeProps[property].validate(mark[property]), `${mark.id}/${property}`);
      const decoded = b64Vecs.decodePoints(b64Vecs.encodePoints(mark.points));
      assert.equal(decoded.length, mark.points.length);
      for (const [index, point] of decoded.entries()) {
        assert.ok(Math.abs(point.z - mark.points[index].z) < 0.005, `${mark.id}: native pressure`);
        assert.ok(point.x >= lesson.viewFrame.x && point.x <= lesson.viewFrame.x + lesson.viewFrame.w, mark.id);
        assert.ok(point.y >= lesson.viewFrame.y && point.y <= lesson.viewFrame.y + lesson.viewFrame.h, mark.id);
      }
    }
  }
});

test("every crayon phase moves one physical gesture at a time, with visible pen-up gaps and eased motion", () => {
  for (const lesson of [cat, sun]) {
    const marks = getColourMarks(lesson);
    for (const [phaseId, phase] of Object.entries(lesson.appearance.colourPhases)) {
      const stepIndex = lesson.steps.findIndex((step) => step.id === phaseId);
      const activeIdsAt = (elapsedMs) => new Set(colouringState(lesson, stepIndex, elapsedMs / phase.durationMs)
        .flatMap((state, index) => state.current ? [marks[index].gestureId] : []));
      for (let elapsed = 0; elapsed <= phase.durationMs; elapsed += 61)
        assert.ok(activeIdsAt(elapsed).size <= 1, `${lesson.id}/${phaseId}: overlapping hand movements`);
      for (const gesture of phase.gestures) {
        assert.ok(gesture.liftMs >= 120 && gesture.liftMs <= 220);
        assert.equal(activeIdsAt(gesture.startMs + gesture.drawMs / 2).size, 1, gesture.id);
        assert.equal(activeIdsAt(gesture.endMs + gesture.liftMs / 2).size, 0, `${gesture.id}: visible lift`);
        const stateAt = (fraction) => colouringState(lesson, stepIndex,
          (gesture.startMs + gesture.drawMs * fraction) / phase.durationMs)
          [marks.findIndex((mark) => mark.gestureId === gesture.id)];
        assert.ok(stateAt(0.1).progress < 0.1, `${gesture.id}: gentle starting speed`);
        assert.ok(stateAt(0.9).progress > 0.9, `${gesture.id}: gentle stopping speed`);
        assert.equal(stateAt(0.1).opacity, stateAt(0.9).opacity, "Ink is drawn; an entire patch does not fade in.");
      }
      const directions = phase.gestures.map((gesture) => Math.sign(gesture.points.at(-1).x - gesture.points[0].x));
      assert.ok(directions.includes(-1) && directions.includes(1), `${phaseId}: real changes of hand direction`);
    }
  }
});

test("replay resets the current colouring while preserving earlier crayon strokes and hiding future ones", () => {
  for (const lesson of [cat, sun]) {
    const marks = getColourMarks(lesson);
    const index = (id) => lesson.steps.findIndex((step) => step.id === id);
    const phases = Object.keys(lesson.appearance.colourPhases);
    assert.ok(colouringState(lesson, index(lesson.strokes[0].id), 0).every((entry) => !entry.visible));
    assert.ok(colouringState(lesson, 0, 0).every((entry) => entry.visible && entry.progress === 1));
    assert.ok(colouringState(lesson, index("colour-choice"), 1).every((entry) => !entry.visible));
    const stepIndex = index(phases[1]);
    const partial = colouringState(lesson, stepIndex, 0.4);
    const end = colouringState(lesson, stepIndex, 1);
    const replay = colouringState(lesson, stepIndex, 0);
    for (const [position, mark] of marks.entries()) {
      const owner = index(mark.phaseId);
      if (owner < stepIndex) {
        assert.equal(partial[position].progress, 1);
        assert.deepEqual(replay[position], partial[position]);
      } else if (owner > stepIndex) {
        assert.equal(partial[position].visible, false);
        assert.deepEqual(end[position], partial[position]);
      } else {
        assert.equal(replay[position].visible, false);
        assert.equal(end[position].visible, true);
        assert.equal(end[position].progress, 1);
      }
    }
    assert.ok(partial.some((entry, i) => marks[i].phaseId === phases[1] && entry.visible));
    assert.ok(partial.some((entry, i) => marks[i].phaseId === phases[1] && !entry.visible));
    for (const id of ["colour-reflection", lesson.steps.at(-1).id])
      assert.ok(colouringState(lesson, index(id), 0).every((entry) => entry.visible && entry.progress === 1), id);
  }
});

test("demo timing follows appearance data for any lesson identity, while the other twenty-eight lessons keep their default rendering", () => {
  for (const lesson of [cat, sun]) {
    for (const [index, step] of lesson.steps.entries()) {
      const demo = getDemonstrationForStep(lesson, index);
      if (step.kind === "draw") assert.deepEqual(demo, { kind: "draw", durationMs: step.stroke.durationMs });
      else {
        const phase = lesson.appearance.colourPhases[step.id];
        assert.deepEqual(demo, phase ? { kind: "colour", durationMs: phase.durationMs } : undefined);
      }
    }
  }
  const fixture = { ...cat, id: "another-reviewed-lesson" };
  assert.equal(getColourMarks(fixture), getColourMarks(cat));
  assert.deepEqual(getDemonstrationForStep(fixture, cat.steps.findIndex((step) => step.id === "colour-fur")), { kind: "colour", durationMs: 20000 });
  for (const lesson of LESSONS.filter((entry) => !entry.appearance)) {
    assert.deepEqual(getColourMarks(lesson), []);
    assert.deepEqual(colouringState(lesson, 0, 1), []);
    for (const stroke of lesson.strokes)
      assert.deepEqual(getOutlineStyle(lesson, stroke), { color: "black", fill: "none", dash: "solid", size: "m" });
  }
});

test("native style overrides accept only bounded authored ink and cannot alter SDK shape geometry", () => {
  assert.deepEqual(nativeAppearanceDisplayValues({ meta: {} }), {});
  assert.deepEqual(nativeAppearanceDisplayValues({ meta: { littleLineAppearance: { ink: "url(https://outside.invalid)" } } }), {});
  assert.deepEqual(nativeAppearanceDisplayValues({ meta: { littleLineAppearance: { ink: "#efaa32", width: 500 } } }), { strokeColor: "#efaa32" });
  assert.deepEqual(nativeAppearanceDisplayValues({ meta: { littleLineAppearance: { ink: "#efaa32", width: 3 } } }), { strokeColor: "#efaa32", strokeWidth: 3 });
});

test("malformed crayon schedules, pressure and render budgets are rejected before mounting a board", () => {
  const broken = () => structuredClone(CAT_APPEARANCE);
  for (const mutate of [
    (pack) => { pack.colourPhases["colour-fur"].gestures[0].points[0].z = NaN; },
    (pack) => { pack.colourPhases["colour-fur"].gestures[1].startMs = 0; },
    (pack) => { pack.colourPhases["colour-fur"].gestures[0].liftMs = 0; },
    (pack) => { pack.colourPhases["colour-fur"].durationMs += 1; },
    (pack) => { pack.palette.ginger.ink = "red"; },
    (pack) => { for (const phase of Object.values(pack.colourPhases)) for (const gesture of phase.gestures) gesture.strands = 6; },
  ]) {
    const pack = broken(); mutate(pack);
    assert.throws(() => defineCrayonAppearance(pack), TypeError);
  }
});
