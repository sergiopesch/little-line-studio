import { getLesson, getLevel } from "./lesson-catalogue.js";

export const initialLesson = Object.freeze({
  phase: "home",
  level: "basic",
  lessonId: null,
  step: 0,
});

// Family controls and the local authored session controller own transitions.
// Raw media, model messages and unqualified timer events are never commands.
export function lessonReducer(state, event) {
  const selected = getLesson(state.lessonId);
  switch (event.type) {
    case "OPEN_CATALOGUE":
      return ["home", "catalogue", "finished"].includes(state.phase) &&
        getLevel(event.level)
        ? { phase: "catalogue", level: event.level, lessonId: null, step: 0 }
        : state;
    case "SELECT_LESSON": {
      const next = getLesson(event.lessonId);
      return state.phase === "catalogue" && next?.level === state.level
        ? { phase: "gate", level: next.level, lessonId: next.id, step: 0 }
        : state;
    }
    case "START":
      return state.phase === "gate" && selected && event.supervised === true
        ? { ...state, phase: "drawing" }
        : state;
    case "NEXT":
      return state.phase === "drawing" && selected
        ? {
            ...state,
            step: Math.min(selected.steps.length - 1, state.step + 1),
          }
        : state;
    case "BACK":
      return state.phase === "drawing" && selected
        ? { ...state, step: Math.max(0, state.step - 1) }
        : state;
    case "PAUSE":
      return state.phase === "drawing" ? { ...state, phase: "paused" } : state;
    case "RESUME":
      return state.phase === "paused" && selected && event.supervised === true
        ? { ...state, phase: "drawing" }
        : state;
    case "FINISH":
      return ["drawing", "paused"].includes(state.phase)
        ? { ...state, phase: "finished" }
        : state;
    case "KEEP_DRAWING":
      return state.phase === "finished" ? { ...state, phase: "paused" } : state;
    case "RESTART":
      return state.phase === "finished" && selected
        ? { ...state, phase: "gate", step: 0 }
        : state;
    case "RESET":
      return { ...initialLesson };
    default:
      return state;
  }
}
