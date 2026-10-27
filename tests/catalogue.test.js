import test from "node:test";
import assert from "node:assert/strict";
import { TEACHING_PACKS } from "../src/lesson-packs.js";
import scripts from "../src/curriculum-scripts.json" with { type: "json" };
import { PAPER_PREPARATION, OBSERVATION_CUES } from "../src/lesson-model.js";
import {
  LESSONS,
  LEVELS,
  getLesson,
  getLevel,
  narrationKey,
} from "../src/lesson-catalogue.js";

function nonempty(value, context) {
  assert.equal(typeof value, "string", context);
  assert.ok(value.trim().length > 0, context);
}

test("each fixed subject camera contains every mark with space for stroke edges", () => {
  for (const lesson of LESSONS) {
    nonempty(lesson.invitation, lesson.id);
    const frame = lesson.viewFrame;
    assert.ok(frame.w > 36 && frame.h > 36);
    for (const stroke of lesson.strokes)
      for (const point of stroke.points) {
        assert.ok(
          point.x >= frame.x + 17 && point.x <= frame.x + frame.w - 17,
          lesson.id,
        );
        assert.ok(
          point.y >= frame.y + 17 && point.y <= frame.y + frame.h - 17,
          lesson.id,
        );
      }
  }
});

test("the catalogue exposes 30 distinct authored lessons, ten at each requested level", () => {
  assert.deepEqual(
    LEVELS.map((level) => level.id),
    ["basic", "intermediate", "expert"],
  );
  assert.equal(LESSONS.length, 30);
  assert.equal(new Set(LESSONS.map((lesson) => lesson.id)).size, 30);
  assert.deepEqual(
    LESSONS.map((lesson) => lesson.id).sort(),
    Object.keys(scripts).sort(),
  );
  for (const level of LEVELS) {
    assert.equal(getLevel(level.id), level);
    assert.equal(
      LESSONS.filter((lesson) => lesson.level === level.id).length,
      10,
    );
    for (const field of ["name", "short", "description"])
      nonempty(level[field], `${level.id}.${field}`);
  }
  for (const id of [undefined, null, "missing", "__proto__", "constructor"]) {
    assert.equal(getLevel(id), null);
    assert.equal(getLesson(id), null);
  }
});

test("all thirty complete packs retain 500 authored drawing actions and subject-specific colouring", () => {
  assert.equal(LESSONS.reduce((total, lesson) => total + lesson.strokes.length, 0), 500);
  assert.equal(TEACHING_PACKS.length, 30);
  assert.equal(LESSONS.filter((lesson) => lesson.teachingPack && lesson.appearance).length, 30);
  for (const lesson of LESSONS) {
    assert.equal(getLesson(lesson.id), lesson);
    assert.equal(lesson.pilot, true);
    assert.equal(lesson.preparationCompletedBeforeStart, true);
    assert.equal(lesson.steps[0].kind, "observe");
    assert.equal(lesson.steps.some((step) => step.kind === "prepare"), false);
    const pack = TEACHING_PACKS.find((entry) => entry.lessonId === lesson.id);
    const colourStages = lesson.steps.filter((step) => step.kind === "colour");
    assert.deepEqual(colourStages.map((step) => step.id), pack.colourSteps.map((step) => step.id));
    assert.ok(colourStages.length >= 4, `${lesson.id}: choice, painting and reflection`);
    assert.ok(Object.keys(lesson.appearance.colourPhases).length >= 3, `${lesson.id}: several small painting demonstrations`);
    assert.equal(lesson.steps.length, lesson.strokes.length + colourStages.length + 2);
    assert.equal(lesson.musicId, lesson.id);
    assert.equal(lesson.steps.at(-1).kind, "explore");
    assert.equal(lesson.steps.at(-1).canSkip, true);
    assert.equal(lesson.steps.filter((step) => step.kind === "draw").length, lesson.strokes.length);
    for (const step of lesson.steps.filter((step) => step.kind !== "draw"))
      assert.equal(Object.hasOwn(step, "stroke"), false, `${lesson.id}/${step.id} must not add outline marks`);
  }
});

test("every stage has unique local identity and complete teaching text without age categorisation", () => {
  for (const lesson of LESSONS) {
    assert.match(lesson.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(getLevel(lesson.level));
    for (const field of ["title", "objective", "parentNote", "transfer"]) {
      nonempty(lesson[field], `${lesson.id}.${field}`);
    }
    assert.equal(typeof lesson.simplify, "string", `${lesson.id}.simplify`);
    if (lesson.level === "expert")
      nonempty(lesson.simplify, `${lesson.id}.simplify`);
    assert.equal(
      new Set(lesson.steps.map((step) => step.id)).size,
      lesson.steps.length,
      lesson.id,
    );
    assert.equal(
      new Set(lesson.strokes.map((stroke) => stroke.id)).size,
      lesson.strokes.length,
      lesson.id,
    );
    for (const record of [lesson, ...lesson.steps]) {
      assert.equal(
        Object.keys(record).some((key) =>
          /^age(?:$|Band|Group|Range)/i.test(key),
        ),
        false,
      );
    }
    for (const step of lesson.steps) {
      assert.match(step.id, /^[a-z]+(?:-[a-z]+)*$/);
      for (const field of [
        "title",
        "instruction",
        "spoken",
        "hint",
        "notice",
      ]) {
        nonempty(step[field], `${lesson.id}/${step.id}.${field}`);
      }
      assert.equal(typeof step.canSkip, "boolean", `${lesson.id}/${step.id}`);
      for (const field of ["instruction", "spoken"])
        assert.doesNotMatch(
          step[field],
          /grown[\s-]?up|parent|adult|supervis/i,
          `${lesson.id}/${step.id}.${field} must remain child-facing`,
        );
    }
  }
});

test("authored scripts, optional details and geometry stay aligned at every drawing turn", () => {
  for (const lesson of LESSONS) {
    const script = scripts[lesson.id];
    assert.equal(lesson.title, script.title);
    assert.equal(lesson.level, script.level);
    assert.equal(lesson.objective, script.objective);
    const drawingOffset = lesson.teachingPack ? 1 : 2;
    const observationIndex = drawingOffset - 1;
    if (!lesson.teachingPack) {
      assert.equal(lesson.steps[0].instruction, PAPER_PREPARATION);
      assert.equal(lesson.steps[0].notice, script.prepare);
    }
    assert.equal(lesson.steps[observationIndex].notice, script.observe);
    if (!lesson.teachingPack) {
      assert.equal(
        lesson.steps[observationIndex].instruction,
        OBSERVATION_CUES[lesson.id],
      );
      assert.equal(lesson.steps.at(-1).instruction, script.explore);
      assert.equal(lesson.steps.at(-1).hint, script.transfer);
    } else {
      assert.equal(lesson.steps[observationIndex].id, "notice");
      assert.equal(lesson.steps.at(-1).id, "explore");
      assert.equal(lesson.concurrentTeaching, true);
    }
    assert.equal(lesson.strokes.length, script.actions.length);
    for (const [index, action] of script.actions.entries()) {
      const stage = lesson.steps[index + drawingOffset],
        stroke = lesson.strokes[index];
      assert.equal(typeof action.optional, "boolean");
      assert.equal(stage.kind, "draw");
      assert.equal(stage.id, stroke.id);
      assert.equal(stage.stroke, stroke);
      assert.equal(stroke.step, index + drawingOffset);
      assert.equal(stage.canSkip, action.optional);
      if (lesson.teachingPack) {
        const captionWords = stage.instruction.trim().split(/\s+/).length;
        const teachingWords = stage.spoken.trim().split(/\s+/).length;
        assert.ok(captionWords <= 20, stage.id);
        assert.ok(teachingWords >= 6 && teachingWords <= 35, stage.id);
      } else {
        assert.equal(stage.instruction, action.instruction);
        assert.equal(stage.hint, action.hint);
        assert.ok(stage.spoken.startsWith(action.instruction));
        if (action.optional)
          assert.match(
            stage.spoken,
            /skip|leave it out/i,
            `${lesson.id}/${stage.id} must offer skipping`,
          );
        else assert.equal(stage.spoken, action.instruction);
      }
    }
  }
});

test("narration identity names each lesson, permanent step and clip kind without collisions", () => {
  const keys = new Set();
  for (const lesson of LESSONS) {
    for (const [index, step] of lesson.steps.entries()) {
      for (const kind of ["instruction", "hint"]) {
        const key = narrationKey(lesson, index, kind);
        assert.equal(key, `${lesson.id}/${step.id}/${kind}`);
        assert.equal(keys.has(key), false, key);
        keys.add(key);
      }
      assert.equal(
        narrationKey(lesson, index),
        `${lesson.id}/${step.id}/instruction`,
      );
    }
    assert.equal(narrationKey(lesson, -1), null);
    assert.equal(narrationKey(lesson, lesson.steps.length), null);
  }
  assert.equal(keys.size, 2 * LESSONS.reduce((sum, lesson) => sum + lesson.steps.length, 0));
  assert.equal(narrationKey(null, 0), null);
});
