import { LESSONS, getLesson } from "../lesson-catalogue.js";
import { getLocale } from "../locale-registry.js";
import { isLessonAvailable, narrationForLocale, releasedLessons } from "../narration-locales.js";

// Same registered text, release checks and narration metadata as the family UI.
// Explicit locale loaders import bundled files; request strings never become paths.
export function createPublicCatalogue() {
  const loaded = new Map();
  function resources(localeId) {
    const locale = getLocale(localeId);
    if (!locale) throw new TypeError("Unknown authored locale.");
    if (!loaded.has(localeId)) {
      const promise = Promise.all([locale.loadText(), locale.loadNarration()])
        .then(([text, narration]) => ({ text, narration }))
        .catch(error => { loaded.delete(localeId); throw error; });
      loaded.set(localeId, promise);
    }
    return loaded.get(localeId);
  }
  return Object.freeze({
    async list(localeId) {
      const { text, narration } = await resources(localeId);
      return releasedLessons(localeId).filter(lesson => isLessonAvailable(localeId, lesson, narration))
        .map(lesson => ({ id: lesson.id, level: lesson.level,
          title: text.localizedLessonTitle(lesson, localeId), stepCount: lesson.steps.length }));
    },
    async load(localeId, lessonId) {
      const authored = getLesson(lessonId);
      if (!authored) return null;
      const { text, narration } = await resources(localeId);
      if (!isLessonAvailable(localeId, authored, narration)) return null;
      const ready = narrationForLocale(localeId, [authored], narration);
      if (!ready.ready) return null;
      return { lesson: text.localizeLesson(authored, localeId), durations: ready.durations };
    },
  });
}

export const publicLessonIds = Object.freeze(LESSONS.map(lesson => lesson.id));
