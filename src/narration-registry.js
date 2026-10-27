import { isNarrationPath } from "./narration-locales.js";

export function createSpanishNarrationRegistry(load = () => import("./spanish-narration.js")) {
  let loaded = null;
  let clips = new Set();
  return {
    async load() {
      loaded = await load();
      return loaded;
    },
    authorize(narration) {
      // Only the module returned by this registry can provide clip membership.
      // Loading alone does not authorize a canceled or failed language choice.
      if (!loaded || narration !== loaded || !narration.index ||
          typeof narration.index !== "object" || Array.isArray(narration.index)) return false;
      clips = new Set(Object.values(narration.index).filter(isNarrationPath));
      return true;
    },
    contains(source) { return clips.has(source); },
  };
}

const registry = createSpanishNarrationRegistry();
export const loadSpanishNarration = () => registry.load();
export const authorizeSpanishNarration = (narration) => registry.authorize(narration);
export const isSpanishAuthoredClip = (source) => registry.contains(source);
