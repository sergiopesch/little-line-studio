import test from "node:test";
import assert from "node:assert/strict";
import { LESSONS } from "../src/lesson-catalogue.js";
import { applyCatPilot, CAT_COLOUR_STEPS } from "../src/cat-pilot.js";
import { getStepTiming } from "../src/scripted-session.js";

function originalCat() {
  const current = LESSONS.find((lesson) => lesson.id === "cat");
  const observation = current.steps.find((step) => step.kind === "observe");
  const drawing = current.steps.filter((step) => step.kind === "draw");
  const exploration = current.steps.find((step) => step.kind === "explore");
  const strokes = current.strokes.map((stroke, index) => ({
    ...stroke,
    step: index + 2,
  }));
  return {
    ...current,
    pilot: false,
    preparationCompletedBeforeStart: false,
    strokes,
    steps: [
      { id: "prepare", kind: "prepare", spoken: "An adult preparation fixture." },
      { ...observation },
      ...drawing.map((step, index) => ({ ...step, stroke: strokes[index] })),
      { ...exploration },
    ],
  };
}

test("the pilot changes only the cat and is safe to apply more than once", () => {
  for (const lesson of LESSONS.filter((entry) => entry.id !== "cat"))
    assert.equal(applyCatPilot(lesson), lesson, lesson.id);
  assert.equal(applyCatPilot(null), null);
  const cat = applyCatPilot(originalCat());
  assert.equal(applyCatPilot(cat), cat);
  assert.equal(cat.pilot, true);
  assert.equal(cat.preparationCompletedBeforeStart, true);
  assert.equal(cat.concurrentTeaching, true);
});

test("cat preparation is completed before the child-facing observation", () => {
  const cat = applyCatPilot(originalCat());
  assert.equal(cat.steps[0].kind, "observe");
  assert.equal(cat.steps.some((step) => step.kind === "prepare"), false);
  for (const step of cat.steps) {
    assert.doesNotMatch(step.spoken, /grown.up|parent|adult|supervis/i, step.id);
    assert.doesNotMatch(step.hint, /grown.up|parent|adult|supervis/i, step.id);
  }
});

test("removing preparation preserves every cat mark and remaps stroke identity", () => {
  const original = originalCat();
  const snapshot = structuredClone(original);
  const cat = applyCatPilot(original);
  assert.deepEqual(original, snapshot, "The source lesson must not be mutated.");
  assert.equal(cat.strokes.length, 13);
  for (let index = 0; index < cat.strokes.length; index++) {
    const stroke = cat.strokes[index];
    const previous = original.strokes[index];
    assert.equal(stroke.id, previous.id);
    assert.equal(stroke.durationMs, previous.durationMs);
    assert.equal(stroke.points, previous.points);
    assert.equal(stroke.closed, previous.closed);
    assert.equal(stroke.step, index + 1);
    assert.equal(cat.steps[stroke.step].kind, "draw");
    assert.equal(cat.steps[stroke.step].id, stroke.id);
    assert.equal(cat.steps[stroke.step].stroke, stroke);
  }
});

test("cat practice is brief between explanations and allows longer shape work", () => {
  const cat = applyCatPilot(originalCat());
  const quiet = Object.fromEntries(
    cat.steps.map((step, index) => [step.id, getStepTiming(cat, index).quietMs]),
  );
  for (const step of cat.steps.filter((step) => step.kind === "draw")) {
    assert.ok(quiet[step.id] >= 2000, step.id);
    assert.ok(quiet[step.id] <= 6000, step.id);
  }
  assert.ok(quiet["round-head"] > quiet["left-eye"]);
  assert.ok(quiet["left-ear"] > quiet["left-whisker-middle"]);
  assert.ok(quiet["curved-mouth"] > quiet["right-whisker-middle"]);
  assert.equal(quiet.notice, 1000);
  assert.equal(
    cat.steps.reduce((total, step) => total + (step.quietMs ?? 0), 0),
    62000,
  );
});

test("teacher explanations remain short and separate from readable captions", () => {
  const cat = applyCatPilot(originalCat());
  const briefRepeats = new Set([
    "right-ear",
    "right-eye",
    "left-whisker-middle",
    "left-whisker-lower",
    "right-whisker-middle",
    "right-whisker-lower",
  ]);
  for (const step of cat.steps) {
    const spokenWords = step.spoken.trim().split(/\s+/).length;
    assert.ok(
      spokenWords >= (briefRepeats.has(step.id) ? 10 : 20) &&
        spokenWords <= (briefRepeats.has(step.id) ? 15 : 35),
      step.id,
    );
    assert.ok(step.instruction.trim().split(/\s+/).length <= 20, step.id);
    assert.notEqual(step.spoken, step.instruction, step.id);
  }
  const byId = new Map(cat.steps.map((step) => [step.id, step]));
  assert.match(byId.get("left-ear").spoken, /turn their ears towards sounds/);
  assert.match(byId.get("left-whisker-upper").spoken, /sense nearby objects/);
  assert.match(byId.get("curved-mouth").spoken, /two little curves/);
  assert.match(byId.get("colour-fur-right").spoken, /other cheek and ear/);
});

test("six short colouring windows complete the cat before open exploration", () => {
  const cat = applyCatPilot(originalCat());
  const colours = cat.steps.filter((step) => step.kind === "colour");
  assert.deepEqual(colours, CAT_COLOUR_STEPS);
  assert.deepEqual(
    colours.map((step) => step.quietMs),
    [2000, 6000, 6000, 4000, 4000, 1000],
  );
  assert.equal(cat.steps.at(-8).kind, "draw");
  assert.equal(cat.steps.at(-7).id, "colour-choice");
  assert.equal(cat.steps.at(-2).id, "colour-reflection");
  assert.equal(cat.steps.at(-1).kind, "explore");
  for (const step of colours) {
    assert.ok(step.instruction.split(/\s+/).length <= 20, step.id);
    assert.ok(step.spoken.length > step.instruction.length, step.id);
    const timing = getStepTiming(cat, cat.steps.indexOf(step));
    const painted = [
      "colour-fur",
      "colour-fur-right",
      "colour-details",
      "colour-patterns",
    ].includes(step.id);
    assert.equal(timing.hasDemonstration, painted, step.id);
    assert.equal(timing.demoMs > 0, painted, step.id);
    assert.equal(timing.quietMs, step.quietMs);
    assert.equal(timing.holdOpen, false);
    assert.equal(Object.hasOwn(step, "stroke"), false);
    for (const field of ["instruction", "spoken", "hint", "notice"])
      assert.ok(step[field].trim(), `${step.id}/${field}`);
  }
  assert.equal(getStepTiming(cat, cat.steps.length - 1).holdOpen, true);
  assert.equal(new Set(cat.steps.map((step) => step.id)).size, cat.steps.length);
});
