import { narrationForLocale } from "../narration-locales.js";
import { loadLocaleNarration } from "../narration-registry.js";
import { getLocale, DEFAULT_LOCALE } from "../locale-registry.js";

import type { TimingLesson, NarrationData } from "../core/contracts.ts";

export interface LanguageText<L extends TimingLesson> {
  readonly localizeLesson: (lesson: L, locale: string) => L;
  readonly localizedLessonTitle: (lesson: L, locale: string) => string | null;
}
export interface LanguageLoadOptions<L extends TimingLesson> {
  readonly loadText?: () => Promise<LanguageText<L>>;
  readonly loadNarration?: () => Promise<NarrationData>;
  readonly validate?: (locale: string, lessons: readonly L[], narration: NarrationData) => { readonly ready: boolean };
}
export interface LoadedLanguage<L extends TimingLesson> {
  readonly localizeLesson: LanguageText<L>["localizeLesson"];
  readonly localizedTitle: LanguageText<L>["localizedLessonTitle"];
  readonly narration: NarrationData;
}

export function loadSpanishLanguage<L extends TimingLesson>(lessons: readonly L[], options?: LanguageLoadOptions<L>) {
  return loadLocaleLanguage("es-419", lessons, options);
}

export async function loadLocaleLanguage<L extends TimingLesson>(locale: string, lessons: readonly L[], {
  loadText = () => getLocale(locale).loadText(),
  loadNarration = () => loadLocaleNarration(locale),
  validate = narrationForLocale,
}: LanguageLoadOptions<L> = {}): Promise<LoadedLanguage<L>> {
  if (!getLocale(locale) || locale === DEFAULT_LOCALE) throw new TypeError("Unknown language.");
  const [text, narration] = await Promise.all([loadText(), loadNarration()]);
  if (!Array.isArray(lessons) || !lessons.length || !validate(locale, lessons, narration).ready ||
      typeof text.localizeLesson !== "function" || typeof text.localizedLessonTitle !== "function")
    throw new TypeError("The selected lessons could not be verified.");
  for (const lesson of lessons) text.localizeLesson(lesson, locale);
  return { localizeLesson: text.localizeLesson, localizedTitle: text.localizedLessonTitle, narration };
}

export { createLatestLanguageRequest } from "./language-request.ts";
