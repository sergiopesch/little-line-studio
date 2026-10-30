import { narrationForLocale } from "../narration-locales.js";
import { loadLocaleNarration } from "../narration-registry.js";
import { getLocale, DEFAULT_LOCALE } from "../locale-registry.js";

import type { NarrationData } from "../core/contracts.ts";

import type { AuthoredLesson } from "../authoring/contracts.ts";
import type { LanguageText } from "../localization/contracts.ts";
export type { LanguageText } from "../localization/contracts.ts";

export interface LanguageLoadOptions {
  readonly loadText?: () => Promise<LanguageText>;
  readonly loadNarration?: () => Promise<NarrationData>;
  readonly validate?: (locale: string, lessons: readonly AuthoredLesson[], narration: NarrationData) => { readonly ready: boolean };
}
export interface LoadedLanguage {
  readonly localizeLesson: LanguageText["localizeLesson"];
  readonly localizedTitle: LanguageText["localizedLessonTitle"];
  readonly narration: NarrationData;
}

export function loadSpanishLanguage(lessons: readonly AuthoredLesson[], options?: LanguageLoadOptions) {
  return loadLocaleLanguage("es-419", lessons, options);
}

export async function loadLocaleLanguage(locale: string, lessons: readonly AuthoredLesson[], {
  loadText,
  loadNarration = () => loadLocaleNarration(locale),
  validate = narrationForLocale,
}: LanguageLoadOptions = {}): Promise<LoadedLanguage> {
  const registration = getLocale(locale);
  if (!registration || locale === DEFAULT_LOCALE) throw new TypeError("Unknown language.");
  const [text, narration] = await Promise.all([(loadText ?? (() => registration.loadText()))(), loadNarration()]);
  if (!Array.isArray(lessons) || !lessons.length || !validate(locale, lessons, narration).ready ||
      typeof text.localizeLesson !== "function" || typeof text.localizedLessonTitle !== "function")
    throw new TypeError("The selected lessons could not be verified.");
  for (const lesson of lessons) text.localizeLesson(lesson, locale);
  return { localizeLesson: text.localizeLesson, localizedTitle: text.localizedLessonTitle, narration };
}

export { createLatestLanguageRequest } from "./language-request.ts";
