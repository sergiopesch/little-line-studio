import { narrationForLocale } from "./narration-locales.js";
import { loadLocaleNarration } from "./narration-registry.js";
import { getLocale, DEFAULT_LOCALE } from "./locale-registry.js";

export function loadSpanishLanguage(lessons, options) {
  return loadLocaleLanguage("es-419", lessons, options);
}

export async function loadLocaleLanguage(locale, lessons, {
  loadText = () => getLocale(locale).loadText(),
  loadNarration = () => loadLocaleNarration(locale),
  validate = narrationForLocale,
} = {}) {
  if (!getLocale(locale) || locale === DEFAULT_LOCALE) throw new TypeError("Unknown language.");
  const [text, narration] = await Promise.all([loadText(), loadNarration()]);
  if (!Array.isArray(lessons) || !lessons.length || !validate(locale, lessons, narration).ready ||
      typeof text.localizeLesson !== "function" || typeof text.localizedLessonTitle !== "function")
    throw new TypeError("The selected lessons could not be verified.");
  for (const lesson of lessons) text.localizeLesson(lesson, locale);
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
