import test from "node:test";
import assert from "node:assert/strict";
import { LESSONS } from "../src/lesson-catalogue.js";
import { applyTeachingPack, attachTeachingAppearance } from "../src/teaching-pack.js";
import { SUN_TEACHING_PACK } from "../src/sun-teaching-pack.js";
import { CAT_TEACHING_PACK } from "../src/cat-pilot.js";
import { SUN_APPEARANCE } from "../src/sun-appearance.js";
import narration from "../src/narration-manifest.json" with { type: "json" };

function baseSun() {
  return {
    ...LESSONS.find((lesson) => lesson.id === "sun"),
    pilot: false,
    teachingPack: undefined,
  };
}

test("the shared pack adapter preserves geometry, parent notes and immutable stage identity", () => {
  const original = baseSun();
  const snapshot = structuredClone(original);
  const sun = applyTeachingPack(original, SUN_TEACHING_PACK);
  assert.deepEqual(original, snapshot);
  assert.equal(applyTeachingPack(sun, SUN_TEACHING_PACK), sun);
  assert.deepEqual(sun.teachingPack, {
    version: 1,
    lessonId: "sun",
    story: SUN_TEACHING_PACK.story,
  });
  assert.equal(sun.preparationCompletedBeforeStart, true);
  assert.equal(sun.concurrentTeaching, true);
  assert.equal(sun.musicId, "sun");
  assert.equal(sun.steps.some((step) => step.kind === "prepare"), false);
  assert.equal(sun.steps[0].notice, original.steps.find((step) => step.kind === "observe").notice);
  assert.equal(sun.steps.at(-1).notice, original.parentNote);
  assert.ok(Object.isFrozen(sun));
  assert.ok(Object.isFrozen(sun.teachingPack.story));
  for (const [index, stroke] of sun.strokes.entries()) {
    assert.equal(stroke.points, original.strokes[index].points);
    assert.equal(stroke.durationMs, original.strokes[index].durationMs);
    assert.equal(stroke.closed, original.strokes[index].closed);
    assert.equal(stroke.step, index + 1);
    assert.equal(sun.steps[stroke.step].stroke, stroke);
    assert.equal(sun.steps[stroke.step].canSkip,
      original.steps.find((step) => step.id === stroke.id).canSkip);
    assert.ok(Object.isFrozen(stroke));
    assert.ok(Object.isFrozen(sun.steps[stroke.step]));
  }
});

test("pack compilation rejects missing or unknown marks and mismatched lesson identities", () => {
  const missing = structuredClone(SUN_TEACHING_PACK);
  delete missing.draw["upward-ray"];
  assert.throws(() => applyTeachingPack(baseSun(), missing), /every authored drawing mark/);
  const unknown = structuredClone(SUN_TEACHING_PACK);
  unknown.draw["unreviewed-mark"] = unknown.draw["upward-ray"];
  assert.throws(() => applyTeachingPack(baseSun(), unknown), /every authored drawing mark/);
  assert.throws(() => applyTeachingPack(baseSun(), CAT_TEACHING_PACK), /match its authored lesson/);
  assert.throws(() => applyTeachingPack(baseSun(), { ...SUN_TEACHING_PACK, version: 2 }), /version-1/);
});

test("pack compilation rejects collisions, empty teaching and invalid practice values", () => {
  const duplicate = structuredClone(SUN_TEACHING_PACK);
  duplicate.colourSteps[0].id = "round-sun";
  assert.throws(() => applyTeachingPack(baseSun(), duplicate), /unique identities/);
  const phases = structuredClone(SUN_TEACHING_PACK);
  phases.phases[1].id = phases.phases[0].id;
  assert.throws(() => applyTeachingPack(baseSun(), phases), /phase identities/);
  const missingPhase = structuredClone(SUN_TEACHING_PACK);
  missingPhase.phases = missingPhase.phases.filter((phase) => phase.id !== "colour");
  assert.throws(() => applyTeachingPack(baseSun(), missingPhase), /Teaching phases/);
  const executableStory = { ...SUN_TEACHING_PACK, story: { thread: () => "unreviewed" } };
  assert.throws(() => applyTeachingPack(baseSun(), executableStory), /authored text/);
  for (const field of ["instruction", "spoken", "hint"]) {
    const empty = structuredClone(SUN_TEACHING_PACK);
    empty.draw["round-sun"][field] = " ";
    assert.throws(() => applyTeachingPack(baseSun(), empty), /nonempty authored text/);
  }
  for (const quietMs of [-1, NaN, Infinity, 1.5]) {
    const invalid = structuredClone(SUN_TEACHING_PACK);
    invalid.draw["round-sun"].quietMs = quietMs;
    assert.throws(() => applyTeachingPack(baseSun(), invalid), /practice window/);
  }
  const invalidChoice = structuredClone(SUN_TEACHING_PACK);
  invalidChoice.draw["round-sun"].canSkip = "yes";
  assert.throws(() => applyTeachingPack(baseSun(), invalidChoice), /optional-detail choice/);
  assert.throws(() => applyTeachingPack(baseSun(), { ...SUN_TEACHING_PACK, musicId: "https://unreviewed.example" }), /semantic identifier/);
  const compiled = applyTeachingPack(baseSun(), SUN_TEACHING_PACK);
  assert.throws(() => applyTeachingPack(compiled, duplicate), /unique identities/);
});

test("the sun pack pairs brief story-led teaching with exact marks and six colouring stages", () => {
  const sun = applyTeachingPack(baseSun(), SUN_TEACHING_PACK);
  assert.equal(sun.steps.length, 20);
  assert.equal(sun.strokes.length, 12);
  assert.equal(sun.steps.filter((step) => step.kind === "colour").length, 6);
  assert.equal(sun.steps.reduce((sum, step) => sum + (step.quietMs ?? 0), 0), 62000);
  const quiet = Object.fromEntries(sun.steps.map((step) => [step.id, step.quietMs]));
  for (const step of sun.steps.filter((step) => step.kind === "draw"))
    assert.ok(step.quietMs >= 2000 && step.quietMs <= 6000, step.id);
  assert.ok(quiet["round-sun"] > quiet["upward-ray"]);
  assert.ok(quiet["sun-smile"] > quiet["sun-left-eye"]);
  assert.ok(quiet["colour-centre-left"] > quiet["colour-rays"]);
  assert.ok(quiet["colour-rays"] > quiet["colour-warmth"]);
  assert.equal(sun.steps.at(-1).kind, "explore");
  assert.equal(sun.steps.at(-1).canSkip, true);
  assert.match(sun.steps[0].spoken, /imaginary garden/);
  assert.match(sun.steps[0].spoken, /Sun is a star/);
  assert.match(sun.steps[0].spoken, /light and warmth/);
  assert.match(sun.steps.find((step) => step.id === "sun-left-eye").spoken, /real Sun has no face/);
  assert.match(sun.steps.find((step) => step.id === "colour-centre-left").spoken, /then lift/);
  assert.match(sun.steps.find((step) => step.id === "colour-warmth").spoken, /second layer/);
  assert.match(sun.steps[0].hint, /Never look directly/);
  const secondEye = sun.steps.find((step) => step.id === "sun-right-eye");
  const smile = sun.steps.find((step) => step.id === "sun-smile");
  assert.match(secondEye.spoken, /right side of your circle/);
  assert.doesNotMatch(`${secondEye.instruction} ${secondEye.spoken} ${secondEye.hint}`, /first|other|between.*eyes/);
  assert.match(smile.spoken, /lower half of the circle/);
  assert.doesNotMatch(smile.spoken, /eyes/);
  for (const step of sun.steps) {
    assert.ok(step.instruction.split(/\s+/).length <= 15, step.id);
    assert.ok(step.spoken.split(/\s+/).length <= 25, step.id);
    assert.ok(step.hint.split(/\s+/).length >= 8, step.id);
    assert.ok(step.hint.split(/\s+/).length <= 15, step.id);
    assert.doesNotMatch(`${step.instruction} ${step.spoken} ${step.hint}`,
      /grown[\s-]?up|parent|adult|supervis/i, step.id);
  }
  assert.ok(sun.steps.reduce((sum, step) => sum + step.spoken.length + step.hint.length, 0) <= 4300);
});

test("every registered native painting phase owns a matching compiled colour stage", () => {
  for (const lesson of LESSONS.filter((entry) => entry.teachingPack)) {
    assert.equal(attachTeachingAppearance(lesson, lesson.appearance), lesson);
    for (const phaseId of Object.keys(lesson.appearance.colourPhases))
      assert.equal(lesson.steps.find((step) => step.id === phaseId)?.kind, "colour", `${lesson.id}/${phaseId}`);
  }
  const sun = applyTeachingPack(baseSun(), SUN_TEACHING_PACK);
  const typo = structuredClone(SUN_APPEARANCE);
  typo.colourPhases["colour-center-left"] = typo.colourPhases["colour-centre-left"];
  delete typo.colourPhases["colour-centre-left"];
  assert.throws(() => attachTeachingAppearance(sun, typo), /no matching colouring stage/);
  const drawCollision = structuredClone(SUN_APPEARANCE);
  drawCollision.colourPhases["round-sun"] = drawCollision.colourPhases["colour-centre-left"];
  assert.throws(() => attachTeachingAppearance(sun, drawCollision), /no matching colouring stage/);
  assert.throws(() => attachTeachingAppearance(sun, { ...SUN_APPEARANCE, colourPhases: {} }), /authored painting phases/);
});

test("adapting the cat to a reusable pack keeps every prepared instruction and hint", () => {
  const cat = LESSONS.find((lesson) => lesson.id === "cat");
  for (const step of cat.steps) {
    for (const [kind, text] of [["instruction", step.spoken], ["hint", step.hint]]) {
      const clip = narration.clips[`cat/${step.id}/${kind}`];
      assert.ok(clip, `${step.id}/${kind}`);
      assert.equal(clip.generationSettings.inputs[0].text, text, `${step.id}/${kind}`);
    }
  }
});
