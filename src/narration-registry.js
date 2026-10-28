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

export function createSpanishNarrationRegistry(load = () => import("./spanish-narration.js")) {
  return createNarrationRegistry(load);
}

const registry = createSpanishNarrationRegistry();
export const loadSpanishNarration = () => registry.load();
export const authorizeSpanishNarration = (narration) => registry.authorize(narration);
export const isSpanishAuthoredClip = (source) => registry.contains(source);

const locales = {
  "es-419": registry,
  "es-ES": createNarrationRegistry(async () => {
    const [index, durations] = await Promise.all([
      import("./narration-index.es-ES.json"), import("./narration-durations.es-ES.json"),
    ]);
    return { index: index.default, durations: durations.default };
  }),
  "de-DE": createNarrationRegistry(async () => {
    const [index, durations] = await Promise.all([
      import("./narration-index.de-DE.json"), import("./narration-durations.de-DE.json"),
    ]);
    return { index: index.default, durations: durations.default };
  }),
  "it-IT": createNarrationRegistry(async () => {
    const [index, durations] = await Promise.all([
      import("./narration-index.it-IT.json"), import("./narration-durations.it-IT.json"),
    ]);
    return { index: index.default, durations: durations.default };
  }),
  "fr-FR": createNarrationRegistry(async () => {
    const [index, durations] = await Promise.all([
      import("./narration-index.fr-FR.json"), import("./narration-durations.fr-FR.json"),
    ]);
    return { index: index.default, durations: durations.default };
  }),
  "en-IE": createNarrationRegistry(async () => {
    const [index, durations] = await Promise.all([
      import("./narration-index.en-IE.json"), import("./narration-durations.en-IE.json"),
    ]);
    return { index: index.default, durations: durations.default };
  }),
  "en-GB-x-scotland": createNarrationRegistry(async () => {
    const [index, durations] = await Promise.all([
      import("./narration-index.en-GB-x-scotland.json"), import("./narration-durations.en-GB-x-scotland.json"),
    ]);
    return { index: index.default, durations: durations.default };
  }),
};

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
