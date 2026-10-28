import { FRENCH_DYNAMIC, stageLabel as frenchStage, demonstrationLabel as frenchBoard, timelineEstimate as frenchEstimate } from './french-dynamic.fr-FR.js';
import { SPAIN_DYNAMIC, stageLabel as spainStage, demonstrationLabel as spainBoard, timelineEstimate as spainEstimate } from './spanish-spain-dynamic.js';
import { GERMAN_DYNAMIC, stageLabel as germanStage, demonstrationLabel as germanBoard, timelineEstimate as germanEstimate } from './german-dynamic.js';
import { ITALIAN_DYNAMIC, stageLabel as italianStage, demonstrationLabel as italianBoard, timelineEstimate as italianEstimate } from './italian-dynamic.js';
import { DUTCH_DYNAMIC, stageLabel as dutchStage, demonstrationLabel as dutchBoard, timelineEstimate as dutchEstimate } from './dutch-dynamic.js';

const locales = Object.freeze({
  'fr-FR': { copy: FRENCH_DYNAMIC, stage: frenchStage, board: frenchBoard, estimate: frenchEstimate },
  'es-ES': { copy: SPAIN_DYNAMIC, stage: spainStage, board: spainBoard, estimate: spainEstimate },
  'de-DE': { copy: GERMAN_DYNAMIC, stage: germanStage, board: germanBoard, estimate: germanEstimate },
  'it-IT': { copy: ITALIAN_DYNAMIC, stage: italianStage, board: italianBoard, estimate: italianEstimate },
  'nl-NL': { copy: DUTCH_DYNAMIC, stage: dutchStage, board: dutchBoard, estimate: dutchEstimate },
});
export const dynamicLocale = (locale) => locales[locale] ?? null;
