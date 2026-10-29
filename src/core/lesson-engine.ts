import type { LessonState, LevelId } from "./contracts.ts";

export const initialLesson: LessonState = Object.freeze({
  phase: "home", level: "basic", lessonId: null, step: 0,
});

const levels: readonly string[] = ["basic", "intermediate", "expert"];
export function isLevel(value: unknown): value is LevelId {
  return typeof value === "string" && levels.includes(value);
}

/** Own data fields only: inherited commands and accessors are not commands. */
export function dataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(field => !Object.hasOwn(field, "value"))) return null;
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, field] of Object.entries(descriptors)) result[key] = field.value;
  return result;
}

interface CatalogueEntry {
  readonly id: string;
  readonly level: string;
  readonly steps: readonly unknown[];
}

/** The catalogue is trusted authored input, copied once; commands are not trusted. */
export function createLessonEngine(catalogue: readonly CatalogueEntry[]) {
  const lessons = new Map<string, { id: string; level: LevelId; stepCount: number }>();
  for (const lesson of catalogue) {
    if (!lesson || typeof lesson.id !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(lesson.id) ||
        !isLevel(lesson.level) || !Array.isArray(lesson.steps) || !lesson.steps.length || lessons.has(lesson.id))
      throw new TypeError("A unique authored lesson identity, level and steps are required.");
    lessons.set(lesson.id, { id: lesson.id, level: lesson.level, stepCount: lesson.steps.length });
  }

  function reduce(state: LessonState, input: unknown): LessonState {
    const event = dataRecord(input);
    if (!event || !Object.hasOwn(event, "type")) return state;
    const selected = state.lessonId === null ? undefined : lessons.get(state.lessonId);
    switch (event.type) {
      case "OPEN_CATALOGUE":
        return ["home", "catalogue", "finished"].includes(state.phase) && isLevel(event.level)
          ? { phase: "catalogue", level: event.level, lessonId: null, step: 0 } : state;
      case "SELECT_LESSON": {
        const next = typeof event.lessonId === "string" ? lessons.get(event.lessonId) : undefined;
        return state.phase === "catalogue" && next?.level === state.level
          ? { phase: "gate", level: next.level, lessonId: next.id, step: 0 } : state;
      }
      case "START":
        return state.phase === "gate" && selected && event.supervised === true
          ? { ...state, phase: "drawing" } : state;
      case "NEXT":
        return state.phase === "drawing" && selected
          ? { ...state, step: Math.min(selected.stepCount - 1, state.step + 1) } : state;
      case "BACK":
        return state.phase === "drawing" && selected ? { ...state, step: Math.max(0, state.step - 1) } : state;
      case "PAUSE":
        return state.phase === "drawing" ? { ...state, phase: "paused" } : state;
      case "RESUME":
        return state.phase === "paused" && selected && event.supervised === true
          ? { ...state, phase: "drawing" } : state;
      case "FINISH":
        return ["drawing", "paused"].includes(state.phase) ? { ...state, phase: "finished" } : state;
      case "KEEP_DRAWING":
        return state.phase === "finished" ? { ...state, phase: "paused" } : state;
      case "RESTART":
        return state.phase === "finished" && selected ? { ...state, phase: "gate", step: 0 } : state;
      case "RESET": return { ...initialLesson };
      default: return state;
    }
  }
  return Object.freeze({ initialState: initialLesson, reduce });
}
