import type { LevelId } from "../core/contracts.ts";
import { getLocale, DEFAULT_LOCALE } from "../locale-registry.js";

let studioPromise: Promise<typeof import("../App.jsx")> | undefined;
export function loadStudio() {
  if (!studioPromise) studioPromise = import("../App.jsx").catch(error => {
    studioPromise = undefined;
    throw error;
  });
  return studioPromise;
}

export async function prepareEntry(languageId: string, level: LevelId) {
  const locale = getLocale(languageId);
  if (!locale) throw new TypeError("Unknown language.");
  // Fetch independent resources together. Validation and narration authorization
  // still belong to the studio; a canceled download cannot enable playback.
  const [studio] = await Promise.all([
    loadStudio(),
    ...(languageId === DEFAULT_LOCALE ? [] : [locale.loadText(), locale.loadNarration()]),
  ]);
  const selection = await studio.prepareInitialSelection(languageId, level);
  return { studio, selection };
}
