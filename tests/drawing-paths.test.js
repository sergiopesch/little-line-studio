import { test } from "node:test";
import assert from "node:assert/strict";
import { b64Vecs } from "@tldraw/tlschema";
import { LESSONS } from "../src/lesson-catalogue.js";
import scripts from "../src/curriculum-scripts.json" with { type: "json" };
import { getOutlineMarks } from "../src/outline-marks.js";
import { TEACHING_PACKS } from "../src/lesson-packs.js";
import { pointsAtProgress, sampleEvenly } from "../src/lesson-geometry.js";
import {
  advanceProgress,
  clampStageIndex,
  demonstrationState,
} from "../src/demonstration-state.js";

test("all 30 lessons match their authored actions, frame and stage boundaries", () => {
  assert.equal(LESSONS.length, 30);
  assert.equal(new Set(LESSONS.map((lesson) => lesson.id)).size, 30);
  for (const lesson of LESSONS) {
    const { strokes, steps, frame } = lesson;
    const context = lesson.id;
    const drawingOffset = lesson.teachingPack ? 1 : 2;
    assert.equal(strokes.length, scripts[lesson.id].actions.length, context);
    if (lesson.teachingPack) {
      const pack = TEACHING_PACKS.find((entry) => entry.lessonId === lesson.id);
      assert.ok(pack, context);
      assert.equal(steps.length, strokes.length + pack.colourSteps.length + 2, context);
      assert.equal(steps[0].kind, "observe", context);
      assert.equal(steps.filter((step) => step.kind === "colour").length, pack.colourSteps.length);
    } else {
      assert.equal(steps.length, strokes.length + 3, context);
      assert.equal(steps[0].kind, "prepare", context);
      assert.equal(steps[1].kind, "observe", context);
    }
    assert.equal(steps.at(-1).kind, "explore", context);
    assert.deepEqual(
      strokes.map((stroke) => stroke.step),
      strokes.map((_, index) => index + drawingOffset),
      context,
    );
    assert.equal(
      new Set(strokes.map((stroke) => stroke.id)).size,
      strokes.length,
      context,
    );
    for (const [index, stroke] of strokes.entries()) {
      assert.equal(steps[index + drawingOffset].kind, "draw", context);
      if (lesson.teachingPack) {
        assert.equal(steps[index + drawingOffset].id, stroke.id);
        assert.equal(steps[index + drawingOffset].stroke, stroke);
        assert.ok(steps[index + drawingOffset].instruction.trim());
      } else {
        assert.equal(
          steps[index + drawingOffset].instruction,
          scripts[lesson.id].actions[index].instruction,
          context,
        );
      }
      assert.ok(
        stroke.durationMs >= 2200 && stroke.durationMs <= 12000,
        `${context}/${stroke.id}: duration`,
      );
      assert.ok(stroke.points.length >= 2, `${context}/${stroke.id}: points`);
      for (const point of stroke.points) {
        assert.ok(
          Number.isFinite(point.x) && Number.isFinite(point.y),
          context,
        );
        assert.ok(
          point.x >= frame.x && point.x <= frame.x + frame.w,
          `${context}/${stroke.id}: x bounds`,
        );
        assert.ok(
          point.y >= frame.y && point.y <= frame.y + frame.h,
          `${context}/${stroke.id}: y bounds`,
        );
      }
    }
  }
});

test("partial playback clamps endpoints without revealing future points or mutating replay geometry", () => {
  for (const lesson of LESSONS)
    for (const stroke of getOutlineMarks(lesson)) {
      const original = JSON.stringify(stroke.points);
      assert.deepEqual(pointsAtProgress(stroke, -1).at(-1), stroke.points[0]);
      assert.deepEqual(pointsAtProgress(stroke, 2), stroke.points);
      for (const progress of [0, 0.01, 0.25, 0.5, 0.99, 1]) {
        const partial = pointsAtProgress(stroke, progress);
        const index = Math.floor(progress * (stroke.points.length - 1));
        assert.deepEqual(
          partial.slice(0, index + 1),
          stroke.points.slice(0, index + 1),
        );
        assert.ok(partial.length <= index + 2);
        const replay = pointsAtProgress(stroke, progress);
        assert.deepEqual(replay, partial);
      }
      assert.equal(JSON.stringify(stroke.points), original);
    }
});

test("genuine tldraw segment encoding preserves each lesson throughout partial and full playback", () => {
  for (const lesson of LESSONS)
    for (const stroke of getOutlineMarks(lesson)) {
      const origin = stroke.points[0];
      for (const progress of [0, 0.001, 0.5, 1]) {
        const points = pointsAtProgress(stroke, progress).map((point) => ({
          x: point.x - origin.x,
          y: point.y - origin.y,
          z: point.z,
        }));
        const decoded = b64Vecs.decodePoints(b64Vecs.encodePoints(points));
        assert.equal(decoded.length, points.length);
        for (const [index, point] of decoded.entries()) {
          assert.ok(Math.abs(point.x - points[index].x) < 0.1);
          assert.ok(Math.abs(point.y - points[index].y) < 0.1);
        }
      }
    }
});

test("preparation is blank, reference phases show the complete subject, and future drawing stays hidden", () => {
  for (const lesson of LESSONS) {
    if (!lesson.preparationCompletedBeforeStart)
      assert.ok(
        demonstrationState(lesson, 0, 1).every(
          (mark) => !mark.visible && !mark.current,
        ),
      );
    for (const [referenceStep, step] of lesson.steps.entries()) {
      if (!["observe", "colour", "explore"].includes(step.kind)) continue;
      assert.ok(
        demonstrationState(lesson, referenceStep).every(
          (mark) => mark.visible && mark.progress === 1 && !mark.current,
        ),
      );
    }
    for (const [index, stroke] of lesson.strokes.entries()) {
      const states = demonstrationState(lesson, stroke.step, 0.4);
      assert.equal(states.filter((mark) => mark.current).length, 1);
      states.forEach((mark, markIndex) => {
        assert.equal(mark.visible, markIndex <= index);
        assert.equal(
          mark.progress,
          markIndex < index ? 1 : markIndex === index ? 0.4 : 0,
        );
      });
      const replay = demonstrationState(lesson, stroke.step, 0);
      assert.equal(replay[index].progress, 0);
      assert.deepEqual(replay.slice(0, index), states.slice(0, index));
      assert.deepEqual(replay.slice(index + 1), states.slice(index + 1));
      const still = demonstrationState(lesson, stroke.step, 1);
      assert.equal(still[index].progress, 1);
      assert.ok(still.slice(index + 1).every((mark) => !mark.visible));
    }
    assert.equal(clampStageIndex(lesson, -5), 0);
    assert.equal(clampStageIndex(lesson, 999), lesson.steps.length - 1);
    assert.equal(clampStageIndex(lesson, NaN), 0);
  }
});

test("distance resampling and partial playback preserve authored stylus pressure", () => {
  const source = [{ x: 0, y: 0, z: 0.1 }, { x: 10, y: 0, z: 0.9 }];
  const sampled = sampleEvenly(source, 2);
  for (const point of sampled)
    assert.ok(Math.abs(point.z - (0.1 + point.x * 0.08)) < 1e-10);
  assert.ok(Math.abs(pointsAtProgress({ points: source }, 0.25).at(-1).z - 0.3) < 1e-10);
  assert.deepEqual(source, [{ x: 0, y: 0, z: 0.1 }, { x: 10, y: 0, z: 0.9 }]);
});

test("every cat colouring phase keeps all 13 tldraw marks complete without replaying a drawing", () => {
  const cat = LESSONS.find((lesson) => lesson.id === "cat");
  const colourStages = cat.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.kind === "colour");
  assert.equal(colourStages.length, 6);
  assert.equal(cat.strokes.length, 13);
  const fullReference = Array.from({ length: 13 }, () => ({
    visible: true,
    progress: 1,
    current: false,
  }));
  for (const { step, index } of colourStages) {
    assert.ok(index > cat.strokes.at(-1).step, step.id);
    for (const animationProgress of [0, 0.4, 1])
      assert.deepEqual(
        demonstrationState(cat, index, animationProgress),
        fullReference,
        step.id,
      );
  }
});

test("pausing retains partial progress; resume continues it and long frame gaps cannot fast-forward", () => {
  const partial = advanceProgress(0.3, 50, 5000);
  assert.equal(partial, 0.31);
  assert.equal(advanceProgress(partial, 60000, 5000, true), partial);
  assert.equal(advanceProgress(partial, 50, 5000), 0.32);
  assert.equal(advanceProgress(0.3, 60000, 5000), 0.32);
  assert.equal(advanceProgress(0.3, -10, 5000), 0.3);
  assert.equal(advanceProgress(0.999, 100, 5000), 1);
});
