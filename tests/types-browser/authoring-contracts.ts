import { defineLesson } from "../../src/lesson-model.js";
import { applyTeachingPack, attachTeachingAppearance } from "../../src/teaching-pack.js";
import { createTeachingPackRegistry } from "../../src/lesson-packs.js";
import { regionPatch } from "../../src/crayon-regions.js";
import { LESSONS } from "../../src/lesson-catalogue.js";
import { SUN_TEACHING_PACK } from "../../src/sun-teaching-pack.js";
import { line, mark } from "../../src/lesson-geometry.js";
import type { AuthoredLesson, TeachingPack } from "../../src/authoring/contracts.ts";
import type { CrayonAppearance } from "../../src/drawing/contracts.ts";
import type { LessonView } from "../../src/browser/ui-contracts.ts";

declare const lesson: AuthoredLesson;
declare const appearance: CrayonAppearance;
const points = line([0, 0], [20, 0], [20, 20], [0, 0]);
const markData = mark("outline", points);
const patch = { id: "paint", boundary: points, colour: "yellow", cx: 10, cy: 10, rx: 8, ry: 5 };
const catalogue: readonly AuthoredLesson[] = LESSONS;
const view: LessonView = lesson;
const pack: TeachingPack = SUN_TEACHING_PACK;
applyTeachingPack(lesson, pack);
attachTeachingAppearance(lesson, appearance);
createTeachingPackRegistry([{ id: lesson.id, pack, appearance }]);
regionPatch(patch);
void catalogue; void view;

// @ts-expect-error the lesson identity must exist in the authored curriculum
defineLesson("misspelled-lesson", [markData]);
// @ts-expect-error authored duration is numeric, not narration text
defineLesson("cat", [{ ...markData, durationMs: "five seconds" }]);
// @ts-expect-error a lesson frame needs both dimensions
defineLesson("cat", [markData], { x: 0, y: 0, w: 600 });
// @ts-expect-error future pack versions need an explicit compiler implementation
applyTeachingPack(lesson, { ...pack, version: 2 });
// @ts-expect-error drawing teaching needs a quiet-practice window
applyTeachingPack(lesson, { ...pack, draw: { outline: { instruction: "Draw.", spoken: "Draw.", hint: "Slowly." } } });
// @ts-expect-error translated text belongs in reviewed strings, not callbacks
applyTeachingPack(lesson, { ...pack, explore: { ...pack.explore, spoken: () => "Keep drawing." } });
// @ts-expect-error phase identities use the authored vocabulary
applyTeachingPack(lesson, { ...pack, phases: [{ id: "assessment", label: "Score" }] });
// @ts-expect-error registrations must include authored appearance
createTeachingPackRegistry([{ id: "sun", pack }]);
// @ts-expect-error appearance remains fixed data with numeric geometry
attachTeachingAppearance(lesson, { ...appearance, colourPhases: { paint: { durationMs: "slow", gestures: [] } } });
// @ts-expect-error a region contour must contain points with both coordinates
regionPatch({ ...patch, boundary: [{ x: 1 }] });
// @ts-expect-error crayon width is a number, not a CSS value
regionPatch({ ...patch, width: "8px" });
// @ts-expect-error compiled teaching is immutable during a family session
lesson.steps[0]?.stroke?.points.push({ x: 1, y: 2 });
