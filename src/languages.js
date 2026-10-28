import { LESSONS } from "./lesson-catalogue.js";
import { releasedLessons } from "./narration-locales.js";

// The build validates the release descriptor against the prepared Spanish audio.
const spanishCount = releasedLessons("es-419").length;
const ready = (locale) => releasedLessons(locale).length > 0;
export const LANGUAGES = Object.freeze([
  Object.freeze({ id: "en-GB", name: "English", region: "British", flag: "🇬🇧", ready: true }),
  Object.freeze({ id: "en-IE", name: "English", region: "Irish", flag: "🇮🇪", ready: ready("en-IE") }),
  Object.freeze({ id: "en-GB-x-scotland", name: "English", region: "Scottish", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", ready: ready("en-GB-x-scotland") }),
  Object.freeze({ id: "es-419", name: "Castellano", region: "Latinoamérica", flag: "🇻🇪", ready: spanishCount > 0 }),
  Object.freeze({ id: "fr-FR", name: "Français", region: "French", flag: "🇫🇷", ready: ready("fr-FR") }),
  Object.freeze({ id: "de-DE", name: "Deutsch", region: "German", flag: "🇩🇪", ready: false }),
  Object.freeze({ id: "it-IT", name: "Italiano", region: "Italian", flag: "🇮🇹", ready: false }),
  Object.freeze({ id: "nl-NL", name: "Nederlands", region: "Dutch", flag: "🇳🇱", ready: false }),
]);

export const DEFAULT_LANGUAGE = "en-GB";
export const getLanguage = (id) => LANGUAGES.find((language) => language.id === id) ?? null;
export const languageAvailableForLevel = (id, levelId) =>
  Boolean(getLanguage(id)?.ready && releasedLessons(id).some((lesson) => lesson.level === levelId));

export function languageAvailabilityCopy(
  spanishReady = getLanguage("es-419")?.ready === true,
  partial = spanishReady && spanishCount > 0 && spanishCount < LESSONS.length,
  otherReady = ready("fr-FR") || ready("en-IE") || ready("en-GB-x-scotland"),
) {
  if (otherReady) return {
    banner: "Choose a language for your drawing",
    note: "Choose an available language. More languages are in preparation.",
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
