import { test } from "node:test";
import assert from "node:assert/strict";
import { b64Vecs, drawShapeProps } from "@tldraw/tlschema";
import { LESSONS } from "../src/lesson-catalogue.js";
import scripts from "../src/curriculum-scripts.json" with { type: "json" };
import { line, mark, multiMark, pointsAtProgress, sampleEvenly } from "../src/lesson-geometry.js";
import { demonstrationState, getDemonstrationForStep } from "../src/demonstration-state.js";
import { getOutlineMarks, outlineState } from "../src/outline-marks.js";

function fixture() {
  const separate = multiMark("hidden-body", [
    line([20, 80], [70, 80]),
    line([200, 120], [270, 140]),
    line([420, 220], [440, 260]),
  ].map((part) => Object.freeze(sampleEvenly(part))), 4200);
  const strokes = [
    { ...mark("foreground", line([100, 40], [100, 200]), 3000), step: 1 },
    { ...separate, step: 2 },
    { ...mark("later-detail", line([300, 300], [320, 300]), 2500), step: 3 },
  ];
  return {
    id: "test-occlusion", strokes,
    steps: [
      { id: "notice", kind: "observe" },
      ...strokes.map((stroke) => ({ id: stroke.id, kind: "draw", stroke })),
      { id: "colour-body", kind: "colour" },
      { id: "explore", kind: "explore" },
    ],
  };
}

function encodedContour(contour, progress) {
  const origin = contour.points[0];
  return [{
    type: "free",
    path: b64Vecs.encodePoints(pointsAtProgress(contour, progress).map((point) => ({
      x: point.x - origin.x, y: point.y - origin.y, z: point.z,
    }))),
  }];
}

const recordStates = (lesson, stepIndex, progress) => {
  const semantic = demonstrationState(lesson, stepIndex, progress);
  return getOutlineMarks(lesson).map((contour) => outlineState(contour, semantic[contour.sourceIndex]));
};

test("multipart outlines retain separate native contours rather than drawing hidden connecting bridges", () => {
  const lesson = fixture();
  const semantic = lesson.strokes[1];
  const before = JSON.stringify(semantic);
  const contours = getOutlineMarks(lesson).filter((contour) => contour.sourceId === semantic.id);
  assert.equal(contours.length, 3);
  assert.throws(() => pointsAtProgress(semantic, 0.5), /individual native contours/);
  contours.forEach((contour, index) => {
    assert.deepEqual(contour.points, semantic.parts[index]);
    assert.equal(contour.parts, undefined);
    assert.equal(contour.sourceIndex, 1);
    assert.equal(contour.step, semantic.step);
    assert.equal(contour.closed, false);
    assert.deepEqual(pointsAtProgress(contour, 1), semantic.parts[index]);
    const full = b64Vecs.decodePoints(encodedContour(contour, 1)[0].path);
    const start = contour.points[0];
    const absolute = full.map((point) => ({ x: point.x + start.x, y: point.y + start.y }));
    const sourceBounds = semantic.parts[index].reduce((bounds, point) => ({
      left: Math.min(bounds.left, point.x), right: Math.max(bounds.right, point.x),
      top: Math.min(bounds.top, point.y), bottom: Math.max(bounds.bottom, point.y),
    }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    for (const point of absolute) {
      assert.ok(point.x >= sourceBounds.left - 0.1 && point.x <= sourceBounds.right + 0.1);
      assert.ok(point.y >= sourceBounds.top - 0.1 && point.y <= sourceBounds.bottom + 0.1);
    }
  });
  assert.equal(JSON.stringify(semantic), before);
  assert.equal(getOutlineMarks(lesson), getOutlineMarks(lesson), "stable records are cached per lesson");
});

test("each contour gets a deliberate movement and a real 180ms pencil lift without extending its teaching action", () => {
  const lesson = fixture();
  const semantic = lesson.strokes[1];
  const contours = getOutlineMarks(lesson).filter((contour) => contour.sourceId === semantic.id);
  assert.equal(contours[0].startMs, 0);
  assert.equal(contours.at(-1).endMs, semantic.durationMs);
  assert.equal(contours.reduce((sum, contour) => sum + contour.endMs - contour.startMs, 0), semantic.durationMs - 2 * 180);
  for (const [index, contour] of contours.entries()) {
    assert.ok(Number.isInteger(contour.startMs) && Number.isInteger(contour.endMs));
    assert.ok(contour.endMs - contour.startMs >= 300);
    if (!index) continue;
    const previous = contours[index - 1];
    assert.equal(contour.startMs - previous.endMs, 180);
    for (const offset of [0, 1, 90, 179]) {
      const elapsed = previous.endMs + offset;
      const states = recordStates(lesson, semantic.step, elapsed / semantic.durationMs);
      const previousState = states[getOutlineMarks(lesson).indexOf(previous)];
      const nextState = states[getOutlineMarks(lesson).indexOf(contour)];
      assert.equal(previousState.visible, true);
      assert.equal(previousState.progress, 1);
      assert.equal(nextState.visible, false, `the next contour stays hidden ${offset}ms into the lift`);
      assert.equal(nextState.progress, 0);
    }
    assert.equal(outlineState(contour, { visible: true, current: true, progress: contour.startMs / semantic.durationMs }).visible, true);
  }
  assert.deepEqual(getDemonstrationForStep(lesson, semantic.step), { kind: "draw", durationMs: semantic.durationMs });
});

test("a tiny visible contour still receives deliberate time beside a much longer contour", () => {
  const stroke = multiMark("long-and-short", [
    sampleEvenly(line([0, 0], [1000, 0])),
    sampleEvenly(line([1500, 20], [1503, 20])),
  ], 7000);
  const contours = getOutlineMarks({ strokes: [stroke] });
  assert.equal(contours.length, 2);
  assert.ok(contours[1].endMs - contours[1].startMs >= 300);
  assert.ok(contours[0].endMs - contours[0].startMs > contours[1].endMs - contours[1].startMs);
  assert.equal(contours[1].startMs - contours[0].endMs, 180);
  assert.equal(contours[1].endMs, 7000);
  assert.throws(() => getOutlineMarks({ strokes: [multiMark("no-ink-budget", Array.from({ length: 8 }, () => line([0, 0], [10, 0])), 2200)] }), /time|duration|deliberate/i);
});

test("rounding a tight outline schedule preserves every contour's minimum time", () => {
  const parts = [100, 100, 100, 25].map((length, part) =>
    Array.from({ length: length + 1 }, (_, index) => ({ x: index, y: part * 20, z: 0.5 })));
  const durationMs = 4 * 300 + 3 * 180 + 2;
  const contours = getOutlineMarks({ strokes: [multiMark("tight-rounding", parts, durationMs)] });
  assert.ok(contours.every((contour) => contour.endMs - contour.startMs >= 300));
  assert.equal(contours.at(-1).endMs, durationMs);
});

test("future contours stay hidden and replay preserves earlier semantic marks and full reference geometry", () => {
  const lesson = fixture();
  const contours = getOutlineMarks(lesson);
  const multipart = contours.filter((contour) => contour.sourceId === "hidden-body");
  const second = multipart[1];
  const duringSecond = (second.startMs + (second.endMs - second.startMs) / 2) / lesson.strokes[1].durationMs;
  const states = recordStates(lesson, 2, duringSecond);
  assert.deepEqual(states[0], { visible: true, current: false, progress: 1 });
  assert.equal(states[1].progress, 1);
  assert.equal(states[2].visible, true);
  assert.ok(Math.abs(states[2].progress - 0.5) < 1e-12);
  assert.equal(states[3].visible, false);
  assert.equal(states[4].visible, false);
  const replay = recordStates(lesson, 2, 0);
  assert.deepEqual(replay[0], states[0]);
  assert.equal(replay[1].progress, 0);
  assert.ok(replay.slice(2).every((state) => !state.visible && state.progress === 0));
  for (const step of [0, 4, 5]) {
    assert.ok(recordStates(lesson, step, 0).every((state) => state.visible && state.progress === 1 && !state.current));
  }
  const initialFull = contours.map((contour) => encodedContour(contour, 1));
  for (const contour of contours) for (const progress of [0, 0.001, 0.4, 0.9, 1]) encodedContour(contour, progress);
  assert.deepEqual(contours.map((contour) => encodedContour(contour, 1)), initialFull);
});

test("every authored native outline part has valid SDK encoding at partial, replay and full progress", () => {
  for (const lesson of LESSONS) {
    const original = JSON.stringify(lesson.strokes);
    for (const contour of getOutlineMarks(lesson)) {
      for (const progress of [0, 0.001, 0.2, 0.6, 0.99, 1]) {
        const segments = encodedContour(contour, progress);
        assert.doesNotThrow(() => drawShapeProps.segments.validate(segments), `${lesson.id}/${contour.id}`);
        const decoded = b64Vecs.decodePoints(segments[0].path);
        const source = pointsAtProgress(contour, progress);
        assert.equal(decoded.length, source.length);
        const origin = contour.points[0];
        for (const [index, point] of decoded.entries()) {
          assert.ok(Math.abs(point.x - (source[index].x - origin.x)) < 0.1);
          assert.ok(Math.abs(point.y - (source[index].y - origin.y)) < 0.1);
          assert.ok(Number.isFinite(point.z));
        }
      }
    }
    assert.equal(JSON.stringify(lesson.strokes), original);
  }
});

test("native contour expansion preserves all 500 semantic marks and their teaching identities", () => {
  assert.equal(LESSONS.length, 30);
  assert.equal(LESSONS.reduce((sum, lesson) => sum + lesson.strokes.length, 0), 500);
  assert.equal(Object.values(scripts).reduce((sum, lesson) => sum + lesson.actions.length, 0), 500);
  let expanded = 0;
  for (const lesson of LESSONS) {
    const contours = getOutlineMarks(lesson);
    expanded += contours.length;
    assert.equal(new Set(contours.map((contour) => contour.id)).size, contours.length, lesson.id);
    for (const [index, stroke] of lesson.strokes.entries()) {
      assert.equal(lesson.steps[stroke.step].id, stroke.id);
      assert.equal(lesson.steps[stroke.step].stroke, stroke);
      const owned = contours.filter((contour) => contour.sourceId === stroke.id);
      assert.equal(owned.length, stroke.parts?.length ?? 1);
      assert.ok(owned.every((contour) => contour.sourceIndex === index && contour.step === stroke.step));
      assert.equal(owned.at(-1).endMs, stroke.durationMs);
      assert.equal(owned[0].startMs, 0);
      assert.equal(getDemonstrationForStep(lesson, stroke.step).durationMs, stroke.durationMs);
    }
  }
  assert.ok(expanded > 500, "occluded outlines add native records, never extra teaching stages");
});
