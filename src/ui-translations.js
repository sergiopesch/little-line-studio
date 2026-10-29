import { LOCALES, getLocale } from "./locale-registry.js";
import { resolveUIMessage } from "./ui-message-sources.js";

// Shared by normal screens and failure screens; no React or eager lesson data.
export const UI_DICTIONARIES = Object.freeze(Object.fromEntries(LOCALES.map(({ id, ui }) => [id, ui])));

export function translate(locale, text) {
  return resolveUIMessage(getLocale(locale)?.ui ?? null, text);
}
