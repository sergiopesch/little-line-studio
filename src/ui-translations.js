import SPANISH_UI from "./spanish-ui.es-419.json" with { type: "json" };
import SPAIN_UI from "./spanish-ui.es-ES.json" with { type: "json" };
import { FRENCH_UI } from "./french-ui.fr-FR.js";
import GERMAN_UI from "./german-ui.de-DE.json" with { type: "json" };
import ITALIAN_UI from "./italian-ui.it-IT.json" with { type: "json" };
import DUTCH_UI from "./dutch-ui.nl-NL.json" with { type: "json" };
import { resolveUIMessage } from "./ui-message-sources.js";

// Explicit English entries distinguish shared source copy from a forgotten locale.
// Keep this independent of React and lesson/audio data so fallbacks can use it too.
export const UI_DICTIONARIES = Object.freeze({
  "en-GB": null,
  "en-IE": null,
  "en-GB-x-scotland": null,
  "es-419": Object.freeze(SPANISH_UI),
  "es-ES": Object.freeze(SPAIN_UI),
  "fr-FR": Object.freeze(FRENCH_UI),
  "de-DE": Object.freeze(GERMAN_UI),
  "it-IT": Object.freeze(ITALIAN_UI),
  "nl-NL": Object.freeze(DUTCH_UI),
});

export function translate(locale, text) {
  const dictionary = Object.hasOwn(UI_DICTIONARIES, locale) ? UI_DICTIONARIES[locale] : null;
  return resolveUIMessage(dictionary, text);
}
