import { LESSONS } from "./lesson-catalogue.js";
import { createLessonEngine } from "./core/lesson-engine.ts";

// The browser and the local rehearsal adapter use the same authored transitions.
const engine = createLessonEngine(LESSONS);
export const initialLesson = engine.initialState;
export const lessonReducer = engine.reduce;
