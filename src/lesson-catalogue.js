// @ts-check
import { basicLessons } from "./lessons/basic.js";
import { intermediateLessons } from "./lessons/intermediate.js";
import { expertLessons } from "./lessons/expert.js";

export { LEVELS, getLevel } from "./lesson-levels.js";
/** @type {readonly import("./authoring/contracts.ts").AuthoredLesson[]} */
export const LESSONS = Object.freeze([
  ...basicLessons,
  ...intermediateLessons,
  ...expertLessons,
]);
const byId = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));
/** @param {string | null | undefined} id */
export const getLesson = (id) => (id == null ? null : byId.get(id)) ?? null;
/** @param {Pick<import("./core/contracts.ts").TimingLesson, "id" | "steps"> | null | undefined} lesson
 * @param {number} stepIndex
 * @param {string} kind */
export function narrationKey(lesson, stepIndex, kind = "instruction") {
  const step = lesson?.steps[stepIndex];
  return step ? `${lesson.id}/${step.id}/${kind}` : null;
}
