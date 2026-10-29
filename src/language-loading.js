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

export { createLatestLanguageRequest } from "./language-request.js";
