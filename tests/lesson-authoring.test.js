import test from "node:test";
import assert from "node:assert/strict";
import { defineLesson } from "../src/lesson-model.js";
import { getLesson } from "../src/lesson-catalogue.js";

const cat = getLesson("cat");

test("authoring rejects invalid mark timing before it reaches lesson playback", () => {
  for (const durationMs of [NaN, Infinity, -1, 0, "5000"]) {
    const marks = cat.strokes.map((mark, index) => index === 0 ? { ...mark, durationMs } : mark);
    assert.throws(() => defineLesson("cat", marks), /positive finite duration/);
  }
});

test("authoring rejects an invalid camera frame before a board can mount", () => {
  for (const frame of [
    { x: NaN, y: 0, w: 600, h: 480 },
    { x: 0, y: Infinity, w: 600, h: 480 },
    { x: 0, y: 0, w: 0, h: 480 },
    { x: 0, y: 0, w: 600, h: -1 },
    { x: 0, y: 0, w: "600", h: 480 },
  ]) assert.throws(() => defineLesson("cat", cat.strokes, frame), /finite frame with positive dimensions/);
});
