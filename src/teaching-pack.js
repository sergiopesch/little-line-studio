function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be authored data.`);
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} needs nonempty authored text.`);
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !/^[a-z]+(?:-[a-z]+)*$/.test(value))
    throw new TypeError(`${label} needs a permanent semantic identifier.`);
  return value;
}

function quietWindow(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} needs a finite, nonnegative practice window.`);
  return value;
}

function stage(source, { id, kind, notice, canSkip = false }) {
  record(source, `${id} teaching`);
  if (source.canSkip !== undefined && typeof source.canSkip !== "boolean")
    throw new TypeError(`${id} has an invalid optional-detail choice.`);
  return {
    id: identifier(id, `${kind} stage`),
    kind,
    title: text(
      source.title ?? id.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
      `${id} title`,
    ),
    instruction: text(source.instruction, `${id} caption`),
    spoken: text(source.spoken, `${id} narration`),
    hint: text(source.hint, `${id} hint`),
    notice: text(source.notice ?? notice, `${id} parent note`),
    canSkip: source.canSkip ?? canSkip,
    ...(kind === "explore"
      ? {}
      : { quietMs: quietWindow(source.quietMs, `${id} practice`) }),
  };
}

// A teaching pack is fixed content. This adapter can arrange reviewed stages and
// attach their marks; audio, animation and model output cannot change the pack.
export function applyTeachingPack(lesson, pack) {
  record(lesson, "Lesson");
  record(pack, "Teaching pack");
  if (pack.version !== 1 || pack.lessonId !== lesson.id)
    throw new TypeError("A version-1 pack must match its authored lesson.");
  identifier(pack.lessonId, "Pack lesson");
  const story = record(pack.story, "Pack story");
  text(story.thread, "Story thread");
  const storyMetadata = Object.fromEntries(Object.entries(story).map(([key, value]) => [
    identifier(key, "Story field"),
    text(value, `${key} story text`),
  ]));
  if (pack.musicId !== null) identifier(pack.musicId, "Pack music");
  text(pack.colouringLabel, "Colouring label");
  record(pack.draw, "Drawing teaching");
  if (!Array.isArray(lesson.strokes) || !lesson.strokes.length)
    throw new TypeError("A teaching pack needs authored drawing marks.");
  if (!Array.isArray(pack.colourSteps) || !pack.colourSteps.length)
    throw new TypeError("A teaching pack needs authored colouring stages.");
  if (!Array.isArray(pack.phases) || !pack.phases.length)
    throw new TypeError("A teaching pack needs labelled lesson phases.");

  const sourceSteps = new Map(lesson.steps.map((step) => [step.id, step]));
  const markIds = lesson.strokes.map((stroke) => identifier(stroke.id, "Mark"));
  if (new Set(markIds).size !== markIds.length)
    throw new TypeError("Every drawing mark needs a unique identity.");
  const teachingIds = Object.keys(pack.draw);
  if (
    teachingIds.length !== markIds.length ||
    markIds.some((id) => !Object.hasOwn(pack.draw, id))
  ) throw new TypeError("Teaching must cover every authored drawing mark exactly once.");

  const observeId = identifier(pack.observe?.id, "Observation");
  const exploreId = identifier(pack.explore?.id, "Exploration");
  const steps = [
    stage(pack.observe, {
      id: observeId,
      kind: "observe",
      notice: sourceSteps.get(observeId)?.notice ?? lesson.parentNote,
    }),
    ...lesson.strokes.map((stroke) => stage(pack.draw[stroke.id], {
      id: stroke.id,
      kind: "draw",
      notice: sourceSteps.get(stroke.id)?.notice ?? lesson.parentNote,
      canSkip: sourceSteps.get(stroke.id)?.canSkip === true,
    })),
    ...pack.colourSteps.map((entry) => stage(entry, {
      id: entry.id,
      kind: "colour",
      notice: pack.colourNotice ?? lesson.parentNote,
    })),
    stage(pack.explore, {
      id: exploreId,
      kind: "explore",
      notice: sourceSteps.get(exploreId)?.notice ?? lesson.parentNote,
      canSkip: true,
    }),
  ];
  const stageIds = steps.map((step) => step.id);
  if (new Set(stageIds).size !== stageIds.length)
    throw new TypeError("Teaching stages need unique identities across all phases.");

  const phases = pack.phases.map((phase) => Object.freeze({
    id: identifier(phase.id, "Phase"),
    label: text(phase.label, `${phase.id} phase label`),
  }));
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length)
    throw new TypeError("Lesson phase identities must be unique.");
  const phaseKinds = ["observe", "draw", "colour", "explore"];
  if (phases.length !== phaseKinds.length || phaseKinds.some((kind) => !phases.some((phase) => phase.id === kind)))
    throw new TypeError("Teaching phases must label observation, drawing, colouring and exploration.");

  if (
    lesson.pilot === true &&
    lesson.teachingPack?.lessonId === pack.lessonId &&
    lesson.teachingPack?.version === pack.version
  ) return lesson;

  const indexById = new Map(steps.map((step, index) => [step.id, index]));
  const strokes = lesson.strokes.map((stroke) => Object.freeze({
    ...stroke,
    step: indexById.get(stroke.id),
  }));
  const strokeById = new Map(strokes.map((stroke) => [stroke.id, stroke]));

  return Object.freeze({
    ...lesson,
    teachingPack: Object.freeze({
      version: pack.version,
      lessonId: pack.lessonId,
      story: Object.freeze(storyMetadata),
    }),
    pilot: true,
    concurrentTeaching: true,
    preparationCompletedBeforeStart: true,
    musicId: pack.musicId,
    colouringLabel: pack.colouringLabel,
    pilotPhases: Object.freeze(phases),
    strokes: Object.freeze(strokes),
    steps: Object.freeze(steps.map((step) => Object.freeze({
      ...step,
      ...(step.kind === "draw" ? { stroke: strokeById.get(step.id) } : {}),
    }))),
  });
}

// Join independently authored content and crayon geometry before a board can
// mount. An orphaned paint phase must never silently lose its demonstration.
export function attachTeachingAppearance(lesson, appearance) {
  record(lesson, "Compiled teaching lesson");
  record(appearance, "Teaching appearance");
  if (!lesson.teachingPack || appearance.version !== 1 || appearance.medium !== "crayon")
    throw new TypeError("A reviewed teaching pack needs a version-1 crayon appearance.");
  record(appearance.colourPhases, "Appearance colouring phases");
  const phaseIds = Object.keys(appearance.colourPhases);
  if (!phaseIds.length)
    throw new TypeError("A teaching appearance needs authored painting phases.");
  const colourIds = new Set(lesson.steps.filter((step) => step.kind === "colour").map((step) => step.id));
  for (const phaseId of phaseIds) {
    if (!colourIds.has(phaseId))
      throw new TypeError(`Painting phase ${phaseId} has no matching colouring stage.`);
  }
  return lesson.appearance === appearance
    ? lesson
    : Object.freeze({ ...lesson, appearance });
}
