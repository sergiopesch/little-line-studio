import { basicLessons } from "./lessons/basic.js";
import { intermediateLessons } from "./lessons/intermediate.js";
import { expertLessons } from "./lessons/expert.js";

export const LEVELS = Object.freeze([
  {
    id: "basic",
    name: "Basic drawing",
    short: "Basic",
    description: "Little lines, curves and shapes.",
    image: "/brand/flower.webp",
  },
  {
    id: "intermediate",
    name: "Intermediate drawing",
    short: "Intermediate",
    description: "Connect shapes. Find new possibilities.",
    image: "/brand/dog.webp",
  },
  {
    id: "expert",
    name: "Expert drawing",
    short: "Expert",
    description: "Explore overlap, viewpoints and scenes.",
    image: "/brand/bird.webp",
  },
]);
export const LESSONS = Object.freeze([
  ...basicLessons,
  ...intermediateLessons,
  ...expertLessons,
]);
const byId = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));
export const getLesson = (id) => byId.get(id) ?? null;
export const getLevel = (id) => LEVELS.find((level) => level.id === id) ?? null;
export function narrationKey(lesson, stepIndex, kind = "instruction") {
  const step = lesson?.steps[stepIndex];
  return step ? `${lesson.id}/${step.id}/${kind}` : null;
}
