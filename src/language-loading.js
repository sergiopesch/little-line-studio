import { narrationForLocale } from "./narration-locales.js";
import { loadSpanishNarration } from "./narration-registry.js";

export async function loadSpanishLanguage(lessons, {
  loadText = () => import("./spanish-lessons.js"),
  loadNarration = loadSpanishNarration,
  validate = narrationForLocale,
} = {}) {
  const [text, narration] = await Promise.all([loadText(), loadNarration()]);
  if (!Array.isArray(lessons) || !lessons.length ||
      !validate("es-419", lessons, narration).ready ||
      typeof text.localizeLesson !== "function" || typeof text.localizedLessonTitle !== "function")
    throw new TypeError("The Spanish lessons could not be verified.");
  for (const lesson of lessons) text.localizeLesson(lesson, "es-419");
  return { localizeLesson: text.localizeLesson, localizedTitle: text.localizedLessonTitle, narration };
}

// Closing the picker or selecting another language invalidates older requests.
export function createLatestLanguageRequest() {
  let version = 0;
  return {
    cancel() { version++; },
    async run(load, { onStart, onSuccess, onError }) {
      const current = ++version;
      onStart();
      try {
        const value = await load();
        if (current !== version) return false;
        onSuccess(value);
        return true;
      } catch (error) {
        if (current !== version) return false;
        onError(error);
        return false;
      }
    },
  };
}
