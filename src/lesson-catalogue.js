import { basicLessons } from "./lessons/basic.js";
import { intermediateLessons } from "./lessons/intermediate.js";
import { expertLessons } from "./lessons/expert.js";

export { LEVELS, getLevel } from "./lesson-levels.js";
export const LESSONS = Object.freeze([
  ...basicLessons,
  ...intermediateLessons,
  ...expertLessons,
]);
const byId = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));
export const getLesson = (id) => byId.get(id) ?? null;
export function narrationKey(lesson, stepIndex, kind = "instruction") {
  const step = lesson?.steps[stepIndex];
  return step ? `${lesson.id}/${step.id}/${kind}` : null;
}
