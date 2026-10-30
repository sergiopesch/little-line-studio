import type { LanguageText, LocaleRegistration, RegisteredLocale } from "./localization/contracts.ts";
import spanishAvailability from "./narration-availability.es-419.json" with { type: "json" };
import spainAvailability from "./narration-availability.es-ES.json" with { type: "json" };
import germanAvailability from "./narration-availability.de-DE.json" with { type: "json" };
import italianAvailability from "./narration-availability.it-IT.json" with { type: "json" };
import dutchAvailability from "./narration-availability.nl-NL.json" with { type: "json" };
import frenchAvailability from "./narration-availability.fr-FR.json" with { type: "json" };
import irishAvailability from "./narration-availability.en-IE.json" with { type: "json" };
import scottishAvailability from "./narration-availability.en-GB-x-scotland.json" with { type: "json" };
import SPANISH_UI from "./spanish-ui.es-419.json" with { type: "json" };
import SPAIN_UI from "./spanish-ui.es-ES.json" with { type: "json" };
import { FRENCH_UI } from "./french-ui.fr-FR.js";
import GERMAN_UI from "./german-ui.de-DE.json" with { type: "json" };
import ITALIAN_UI from "./italian-ui.it-IT.json" with { type: "json" };
import DUTCH_UI from "./dutch-ui.nl-NL.json" with { type: "json" };
import { FRENCH_DYNAMIC, stageLabel as frenchStage, demonstrationLabel as frenchBoard, timelineEstimate as frenchEstimate } from "./french-dynamic.fr-FR.js";
import { SPAIN_DYNAMIC, stageLabel as spainStage, demonstrationLabel as spainBoard, timelineEstimate as spainEstimate } from "./spanish-spain-dynamic.js";
import { GERMAN_DYNAMIC, stageLabel as germanStage, demonstrationLabel as germanBoard, timelineEstimate as germanEstimate } from "./german-dynamic.js";
import { ITALIAN_DYNAMIC, stageLabel as italianStage, demonstrationLabel as italianBoard, timelineEstimate as italianEstimate } from "./italian-dynamic.js";
import { DUTCH_DYNAMIC, stageLabel as dutchStage, demonstrationLabel as dutchBoard, timelineEstimate as dutchEstimate } from "./dutch-dynamic.js";

export const DEFAULT_LOCALE = "en-GB";
const englishText: LanguageText = Object.freeze<LanguageText>({
  localizeLesson: lesson => lesson,
  localizedLessonTitle: lesson => lesson?.title ?? null,
});
const loadEnglishText = () => Promise.resolve(englishText);
// Registration does not load lesson text or recordings. Explicit import paths
// preserve separate Vite chunks and let a failed selection retry its loaders.
export function createLocaleRegistry(entries: readonly LocaleRegistration[]) {
  const byId = new Map<string, RegisteredLocale>();
  const locales = entries.map((entry): RegisteredLocale => {
    if (!entry || typeof entry.id !== "string" || byId.has(entry.id))
      throw new TypeError("Missing or duplicate locale identity.");
    new Intl.Locale(entry.id);
    for (const key of ["name", "region", "flag", "textLocale", "voiceId", "sampleFile"] as const)
      if (typeof entry[key] !== "string" || !entry[key].trim()) throw new TypeError(`Missing ${key}: ${entry.id}`);
    if (typeof entry.loadText !== "function" || typeof entry.loadNarration !== "function" ||
        !(entry.ui === null && entry.textLocale === DEFAULT_LOCALE ||
          entry.ui && typeof entry.ui === "object" && !Array.isArray(entry.ui)) ||
        !(entry.dynamic === null || entry.dynamic && (["stage", "board", "estimate"] as const).every(key => typeof entry.dynamic?.[key] === "function")) ||
        (entry.id !== DEFAULT_LOCALE && (entry.availability?.locale !== entry.id || !Array.isArray(entry.availability.lessons))))
      throw new TypeError(`Incomplete locale registration: ${entry.id}`);
    const locale: RegisteredLocale = Object.freeze({ ...entry,
      assetSuffix: entry.id === DEFAULT_LOCALE ? "" : `.${entry.id}`,
      ui: entry.ui && Object.freeze(entry.ui),
      dynamic: entry.dynamic && Object.freeze(entry.dynamic),
    });
    byId.set(entry.id, locale);
    return locale;
  });
  return Object.freeze({ locales: Object.freeze(locales), get: (id: string) => byId.get(id) ?? null });
}

const registry = createLocaleRegistry([
  { id: "en-GB", name: "English", region: "British", flag: "🇬🇧", textLocale: "en-GB",
    ui: null, dynamic: null, availability: null, voiceId: "pFZP5JQG7iQjIQuC4Bku", sampleFile: "narration-sample.en.txt",
    loadText: loadEnglishText,
    loadNarration: () => import("./narration-data.en-GB.js") },
  { id: "en-IE", name: "English", region: "Irish", flag: "🇮🇪", textLocale: "en-GB",
    ui: null, dynamic: null, availability: irishAvailability, voiceId: "t6WJWTYTryhcQnrBHdCr", sampleFile: "narration-sample.en.txt",
    loadText: loadEnglishText,
    loadNarration: () => import("./narration-data.en-IE.js") },
  { id: "en-GB-x-scotland", name: "English", region: "Scottish", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", textLocale: "en-GB",
    ui: null, dynamic: null, availability: scottishAvailability, voiceId: "M6KCOw7VXEJAZwuYFLuz", sampleFile: "narration-sample.en.txt",
    loadText: loadEnglishText,
    loadNarration: () => import("./narration-data.en-GB-x-scotland.js") },
  { id: "es-419", name: "Castellano", region: "Latinoamérica", flag: "🇻🇪", textLocale: "es-419",
    ui: SPANISH_UI, dynamic: null, availability: spanishAvailability, voiceId: "gBXbHGNePmWl9WrdHoCH", sampleFile: "spanish-narration-sample.txt",
    loadText: () => import("./spanish-lessons.js"), loadNarration: () => import("./spanish-narration.js") },
  { id: "es-ES", name: "Castellano", region: "España", flag: "🇪🇸", textLocale: "es-ES",
    ui: SPAIN_UI, dynamic: { copy: SPAIN_DYNAMIC, stage: spainStage, board: spainBoard, estimate: spainEstimate },
    availability: spainAvailability, voiceId: "BkOojM1ZhtSAHgsAkMx2", sampleFile: "narration-sample.es-ES.txt",
    loadText: () => import("./spanish-spain-lessons.js"),
    loadNarration: () => import("./narration-data.es-ES.js") },
  { id: "fr-FR", name: "Français", region: "French", flag: "🇫🇷", textLocale: "fr-FR",
    ui: FRENCH_UI, dynamic: { copy: FRENCH_DYNAMIC, stage: frenchStage, board: frenchBoard, estimate: frenchEstimate },
    availability: frenchAvailability, voiceId: "tKaoyJLW05zqV0tIH9FD", sampleFile: "narration-sample.fr-FR.txt",
    loadText: () => import("./french-lessons.js"),
    loadNarration: () => import("./narration-data.fr-FR.js") },
  { id: "de-DE", name: "Deutsch", region: "German", flag: "🇩🇪", textLocale: "de-DE",
    ui: GERMAN_UI, dynamic: { copy: GERMAN_DYNAMIC, stage: germanStage, board: germanBoard, estimate: germanEstimate },
    availability: germanAvailability, voiceId: "5bVYvsqKAWO1hDgOO72l", sampleFile: "narration-sample.de-DE.txt",
    loadText: () => import("./german-lessons.js"),
    loadNarration: () => import("./narration-data.de-DE.js") },
  { id: "it-IT", name: "Italiano", region: "Italian", flag: "🇮🇹", textLocale: "it-IT",
    ui: ITALIAN_UI, dynamic: { copy: ITALIAN_DYNAMIC, stage: italianStage, board: italianBoard, estimate: italianEstimate },
    availability: italianAvailability, voiceId: "wOXFTxgu7FQDBb1dsL7I", sampleFile: "narration-sample.it-IT.txt",
    loadText: () => import("./italian-lessons.js"),
    loadNarration: () => import("./narration-data.it-IT.js") },
  { id: "nl-NL", name: "Nederlands", region: "Dutch", flag: "🇳🇱", textLocale: "nl-NL",
    ui: DUTCH_UI, dynamic: { copy: DUTCH_DYNAMIC, stage: dutchStage, board: dutchBoard, estimate: dutchEstimate },
    availability: dutchAvailability, voiceId: "DiUBVrSFwkMaPz4XqWvR", sampleFile: "narration-sample.nl-NL.txt",
    loadText: () => import("./dutch-lessons.js"),
    loadNarration: () => import("./narration-data.nl-NL.js") },
]);

export const LOCALES = registry.locales;
export const getLocale = registry.get;
