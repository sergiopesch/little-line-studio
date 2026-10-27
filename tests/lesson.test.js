import test from "node:test";
import assert from "node:assert/strict";
import { initialLesson, lessonReducer } from "../src/lesson.js";
import { LESSONS, LEVELS } from "../src/lesson-catalogue.js";

function setupFor(lesson) {
  const catalogue = lessonReducer(initialLesson, {
    type: "OPEN_CATALOGUE",
    level: lesson.level,
  });
  return lessonReducer(catalogue, {
    type: "SELECT_LESSON",
    lessonId: lesson.id,
  });
}
function startFor(lesson) {
  return lessonReducer(setupFor(lesson), { type: "START", supervised: true });
}

test("every lesson is reached through its level catalogue and explicit supervision acknowledgement", () => {
  assert.deepEqual(initialLesson, {
    phase: "home",
    level: "basic",
    lessonId: null,
    step: 0,
  });
  for (const lesson of LESSONS) {
    const catalogue = lessonReducer(initialLesson, {
      type: "OPEN_CATALOGUE",
      level: lesson.level,
    });
    assert.deepEqual(catalogue, {
      phase: "catalogue",
      level: lesson.level,
      lessonId: null,
      step: 0,
    });
    const gate = lessonReducer(catalogue, {
      type: "SELECT_LESSON",
      lessonId: lesson.id,
    });
    assert.deepEqual(gate, {
      phase: "gate",
      level: lesson.level,
      lessonId: lesson.id,
      step: 0,
    });
    for (const supervised of [undefined, false, null, 1, "true"]) {
      assert.equal(lessonReducer(gate, { type: "START", supervised }), gate);
    }
    const drawing = lessonReducer(gate, {
      type: "START",
      supervised: true,
      age: "untrusted extra field",
    });
    assert.deepEqual(drawing, {
      phase: "drawing",
      level: lesson.level,
      lessonId: lesson.id,
      step: 0,
    });
    assert.equal(Object.hasOwn(drawing, "age"), false);
  }
});

test("unknown levels, unknown lessons and cross-level selection cannot open setup", () => {
  for (const level of [
    undefined,
    null,
    "unknown",
    "__proto__",
    "constructor",
  ]) {
    assert.equal(
      lessonReducer(initialLesson, { type: "OPEN_CATALOGUE", level }),
      initialLesson,
    );
  }
  for (const level of LEVELS) {
    const catalogue = lessonReducer(initialLesson, {
      type: "OPEN_CATALOGUE",
      level: level.id,
    });
    for (const lessonId of [
      undefined,
      null,
      "unknown",
      "__proto__",
      "constructor",
    ]) {
      assert.equal(
        lessonReducer(catalogue, { type: "SELECT_LESSON", lessonId }),
        catalogue,
      );
    }
    for (const lesson of LESSONS.filter(
      (candidate) => candidate.level !== level.id,
    )) {
      assert.equal(
        lessonReducer(catalogue, {
          type: "SELECT_LESSON",
          lessonId: lesson.id,
        }),
        catalogue,
      );
    }
  }
});

test("home and catalogue cannot start a lesson; live lessons cannot silently switch selection", () => {
  for (const state of [
    initialLesson,
    lessonReducer(initialLesson, { type: "OPEN_CATALOGUE", level: "basic" }),
  ]) {
    for (const type of ["START", "NEXT", "BACK", "RESUME"]) {
      assert.equal(lessonReducer(state, { type, supervised: true }), state);
    }
  }
  for (const lesson of LESSONS) {
    const gate = setupFor(lesson),
      drawing = startFor(lesson);
    const paused = lessonReducer(drawing, { type: "PAUSE" });
    for (const state of [gate, drawing, paused]) {
      assert.equal(
        lessonReducer(state, { type: "OPEN_CATALOGUE", level: "expert" }),
        state,
      );
      assert.equal(
        lessonReducer(state, { type: "SELECT_LESSON", lessonId: "cat" }),
        state,
      );
    }
    for (const phase of ["gate", "drawing", "paused"]) {
      const invalid = { ...gate, phase, lessonId: "unknown" };
      for (const type of ["START", "NEXT", "BACK", "RESUME"]) {
        assert.equal(
          lessonReducer(invalid, { type, supervised: true }),
          invalid,
        );
      }
    }
  }
});

test("Next and Back move exactly one turn and respect each lesson’s own bounds", () => {
  for (const lesson of LESSONS) {
    let state = startFor(lesson);
    const identity = {
      level: lesson.level,
      lessonId: lesson.id,
      phase: "drawing",
    };
    for (let step = 1; step < lesson.steps.length; step++) {
      state = lessonReducer(state, { type: "NEXT" });
      assert.deepEqual(state, { ...identity, step }, `${lesson.id} Next`);
    }
    for (let repeat = 0; repeat < 3; repeat++) {
      state = lessonReducer(state, { type: "NEXT" });
      assert.equal(state.step, lesson.steps.length - 1);
      assert.equal(
        state.phase,
        "drawing",
        "Exploration must not automatically finish",
      );
    }
    for (let step = lesson.steps.length - 2; step >= 0; step--) {
      state = lessonReducer(state, { type: "BACK" });
      assert.deepEqual(state, { ...identity, step }, `${lesson.id} Back`);
    }
    assert.deepEqual(lessonReducer(state, { type: "BACK" }), {
      ...identity,
      step: 0,
    });
  }
});

test("pause preserves the current lesson and requires fresh acknowledgement to resume", () => {
  for (const lesson of LESSONS) {
    const drawing = {
      ...startFor(lesson),
      step: Math.floor(lesson.steps.length / 2),
    };
    const paused = lessonReducer(drawing, { type: "PAUSE" });
    assert.deepEqual(paused, { ...drawing, phase: "paused" });
    for (const type of ["NEXT", "BACK", "START"]) {
      assert.equal(lessonReducer(paused, { type, supervised: true }), paused);
    }
    for (const supervised of [undefined, false, null, "true", 1]) {
      assert.equal(
        lessonReducer(paused, { type: "RESUME", supervised }),
        paused,
      );
    }
    assert.deepEqual(
      lessonReducer(paused, { type: "RESUME", supervised: true }),
      drawing,
    );
  }
});

test("finish, return, restart and catalogue selection retain separate supervision boundaries", () => {
  for (const lesson of LESSONS) {
    const drawing = { ...startFor(lesson), step: 3 };
    assert.equal(lessonReducer(drawing, { type: "RESTART" }), drawing);
    for (const state of [drawing, lessonReducer(drawing, { type: "PAUSE" })]) {
      const finished = lessonReducer(state, { type: "FINISH" });
      assert.deepEqual(finished, { ...drawing, phase: "finished" });
      for (const type of ["NEXT", "BACK", "START", "RESUME"]) {
        assert.equal(
          lessonReducer(finished, { type, supervised: true }),
          finished,
        );
      }
      const returned = lessonReducer(finished, { type: "KEEP_DRAWING" });
      assert.deepEqual(returned, { ...drawing, phase: "paused" });
      assert.equal(lessonReducer(returned, { type: "RESUME" }), returned);
      const restart = lessonReducer(finished, { type: "RESTART" });
      assert.deepEqual(restart, { ...drawing, phase: "gate", step: 0 });
      assert.equal(lessonReducer(restart, { type: "START" }), restart);
      for (const level of LEVELS) {
        assert.deepEqual(
          lessonReducer(finished, { type: "OPEN_CATALOGUE", level: level.id }),
          {
            phase: "catalogue",
            level: level.id,
            lessonId: null,
            step: 0,
          },
        );
      }
      assert.equal(
        lessonReducer(finished, { type: "OPEN_CATALOGUE", level: "unknown" }),
        finished,
      );
    }
  }
});

test("reset always returns home with no selected lesson or age state", () => {
  const lesson = LESSONS.at(-1),
    gate = setupFor(lesson),
    drawing = startFor(lesson);
  const states = [
    initialLesson,
    lessonReducer(initialLesson, {
      type: "OPEN_CATALOGUE",
      level: lesson.level,
    }),
    gate,
    drawing,
    lessonReducer(drawing, { type: "PAUSE" }),
    lessonReducer(drawing, { type: "FINISH" }),
  ];
  for (const state of states) {
    const reset = lessonReducer(state, { type: "RESET" });
    assert.deepEqual(reset, initialLesson);
    assert.deepEqual(Object.keys(reset).sort(), [
      "lessonId",
      "level",
      "phase",
      "step",
    ]);
    assert.equal(
      lessonReducer(reset, { type: "START", supervised: true }),
      reset,
    );
  }
});

test("silence, audio, animation and model completion have no authority in any reachable phase", () => {
  const lesson = LESSONS.find(
    (candidate) => candidate.level === "intermediate",
  );
  const gate = setupFor(lesson),
    drawing = { ...startFor(lesson), step: 4 };
  const states = [
    initialLesson,
    lessonReducer(initialLesson, {
      type: "OPEN_CATALOGUE",
      level: lesson.level,
    }),
    gate,
    drawing,
    lessonReducer(drawing, { type: "PAUSE" }),
    lessonReducer(drawing, { type: "FINISH" }),
  ];
  const ignored = [
    "SILENCE",
    "TIMEOUT",
    "AUDIO_ENDED",
    "NARRATION_ENDED",
    "MODEL_OUTPUT",
    "VOICE_READY",
    "DEMONSTRATION_ENDED",
    "DEMO_COMPLETE",
    "STROKE_COMPLETE",
    "ANIMATION_COMPLETE",
    "AUTO_ADVANCE",
  ];
  for (const state of states) {
    const before = structuredClone(state);
    for (const type of ignored) {
      assert.equal(
        lessonReducer(state, {
          type,
          supervised: true,
          next: 999,
          level: "expert",
          lessonId: "robot",
          phase: "drawing",
        }),
        state,
        `${state.phase}: ${type}`,
      );
      assert.deepEqual(state, before);
    }
  }
});
