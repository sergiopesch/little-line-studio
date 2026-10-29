import { LOCALES, getLocale, DEFAULT_LOCALE } from "./locale-registry.js";
import { isNarrationPath } from "./narration-locales.js";

export function createNarrationRegistry(load) {
  const loaded = new WeakSet();
  let clips = new Set();
  return {
    async load() {
      const result = await load();
      if (!result || typeof result !== "object") throw new TypeError("Invalid narration module.");
      loaded.add(result);
      return result;
    },
    authorize(narration) {
      // Only the module returned by this registry can provide clip membership.
      // Loading alone does not authorize a canceled or failed language choice.
      if (!narration || typeof narration !== "object" || !loaded.has(narration) || !narration.index ||
          typeof narration.index !== "object" || Array.isArray(narration.index)) return false;
      clips = new Set(Object.values(narration.index).filter(isNarrationPath));
      return true;
    },
    contains(source) { return clips.has(source); },
  };
}

export function createSpanishNarrationRegistry(load = getLocale("es-419").loadNarration) {
  return createNarrationRegistry(load);
}

const locales = Object.fromEntries(LOCALES.filter(locale => locale.id !== DEFAULT_LOCALE)
  .map(locale => [locale.id, createNarrationRegistry(locale.loadNarration)]));
const registry = locales["es-419"];
export const loadSpanishNarration = () => registry.load();
export const authorizeSpanishNarration = (narration) => registry.authorize(narration);
export const isSpanishAuthoredClip = (source) => registry.contains(source);

export function loadLocaleNarration(locale) {
  if (!Object.hasOwn(locales, locale)) throw new TypeError("Unknown narration locale.");
  return locales[locale].load();
}
export function authorizeLocaleNarration(locale, narration) {
  return Object.hasOwn(locales, locale) && locales[locale].authorize(narration);
}
export function isLocalizedAuthoredClip(source) {
  return Object.values(locales).some((locale) => locale.contains(source));
}
