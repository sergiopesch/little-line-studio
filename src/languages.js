import { LOCALES, DEFAULT_LOCALE } from "./locale-registry.js";
import LESSONS from "./lesson-directory.json" with { type: "json" };
import { isLessonReleased } from "./locale-availability.js";

const releasedLessons = locale => LESSONS.filter(lesson => isLessonReleased(locale, lesson));

// The build validates the release descriptor against the prepared Spanish audio.
const spanishCount = releasedLessons("es-419").length;
const ready = (locale) => releasedLessons(locale).length > 0;
export const LANGUAGES = Object.freeze(LOCALES.map(({ id, name, region, flag }) =>
  Object.freeze({ id, name, region, flag, ready: id === DEFAULT_LOCALE || ready(id) })));

export const DEFAULT_LANGUAGE = DEFAULT_LOCALE;
export const getLanguage = (id) => LANGUAGES.find((language) => language.id === id) ?? null;
export const languageAvailableForLevel = (id, levelId) =>
  Boolean(getLanguage(id)?.ready && releasedLessons(id).some((lesson) => lesson.level === levelId));

export function languageAvailabilityCopy(
  spanishReady = getLanguage("es-419")?.ready === true,
  partial = spanishReady && spanishCount > 0 && spanishCount < LESSONS.length,
  otherReady = ready("fr-FR") || ready("en-IE") || ready("en-GB-x-scotland"),
  allComplete = LANGUAGES.every(({ id }) => releasedLessons(id).length === LESSONS.length),
) {
  if (otherReady) return {
    banner: "Choose a language for your drawing",
    note: allComplete ? "Choose a language for your drawing"
      : "Choose an available language. More languages are in preparation.",
  };
  if (spanishReady && partial) return {
    banner: "English and some Spanish lessons ready · more soon",
    note: "British English and selected drawings in Latin American Spanish are ready. The other Spanish drawings are being prepared.",
  };
  return spanishReady
    ? {
        banner: "English and Spanish ready · more languages soon",
        note: "British English and Latin American Spanish are ready. We’re preparing the other languages.",
      }
    : {
        banner: "English ready · more languages soon",
        note: "British English is ready. We’re preparing the other languages.",
      };
}
