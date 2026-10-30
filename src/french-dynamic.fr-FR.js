// @ts-check
// French dynamic strings; independent native-speaker review remains pending.
/** @type {import("./localization/contracts.ts").DynamicCopy} */
const copy = {
  documentTitle: "Trazolino — Chaque dessin commence par un petit trait",
  errorTitle: "Prenons une petite pause.",
  errorBody: "La leçon n’a pas pu s’ouvrir. Ton dessin sur papier est à toi. Demande à l’adulte qui t’accompagne de recharger la page quand vous serez prêts.",
  errorReload: "Recharger la leçon",
  levelExplore: (level, count) => `Explorer ${level} : ${count}`,
  catalogueRange: (level, first, last, total) => `${level}, dessins ${first} à ${last} sur ${total}`,
  drawTitle: (title) => `Dessiner ${title}`,
  pageCount: (page, total) => `${page} sur ${total}`,
  duration: (minutes) => `Environ ${minutes} minutes, sans compter les pauses. Prenez plus de temps quand vous en avez besoin.`,
  remaining: (minutes) => `Environ ${minutes} min restantes`,
  together: (elapsed) => `${elapsed} ensemble`,
  preview: (title) => `${title}. Exemple complet ; dessine ta propre version sur papier.`,
  boardBlank: "Tableau de démonstration vide. Dessine sur ta feuille.",
  boardColour: (title) => `${title}. Démonstration de coloriage. Dessine sur ta feuille.`,
  boardReference: (title) => `${title}. Exemple complet. Dessine sur ta feuille.`,
  boardAction: (title, action) => `${title}, tracé ${action}. Dessine sur ta feuille.`,
  stepObserve: "OBSERVE",
  stepColour: (index, total) => `COLORIAGE ${index} SUR ${total}`,
  stepExplore: "TON MOMENT",
  stepDrawing: (index, total) => `DESSIN ${index} SUR ${total}`,
  stepPrepare: "PRÉPARATION",
  stepGeneric: (index, total) => `ÉTAPE ${index} SUR ${total}`,
};
export const FRENCH_DYNAMIC = Object.freeze(copy);

/** @param {import("./authoring/contracts.ts").AuthoredLesson} lesson @param {number} stepIndex */
export function demonstrationLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!step) throw new TypeError("Unknown localized teaching stage.");
  const kind = step.kind;
  if (kind === 'prepare') return FRENCH_DYNAMIC.boardBlank;
  if (kind === 'colour') return FRENCH_DYNAMIC.boardColour(lesson.title);
  if (kind === 'observe' || kind === 'explore') return FRENCH_DYNAMIC.boardReference(lesson.title);
  const action = lesson.strokes.findIndex((stroke) => stroke.step === stepIndex) + 1;
  return FRENCH_DYNAMIC.boardAction(lesson.title, action);
}

/** @param {import("./authoring/contracts.ts").AuthoredLesson} lesson @param {number} stepIndex */
export function stageLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!step) throw new TypeError("Unknown localized teaching stage.");
  if (!lesson.pilot) return stepIndex === 0
    ? FRENCH_DYNAMIC.stepPrepare
    : FRENCH_DYNAMIC.stepGeneric(stepIndex, lesson.steps.length - 1);
  if (step.kind === 'observe') return FRENCH_DYNAMIC.stepObserve;
  if (step.kind === 'colour') {
    const count = lesson.steps.slice(0, stepIndex + 1).filter((part) => part.kind === 'colour').length;
    const total = lesson.steps.filter((part) => part.kind === 'colour').length;
    return FRENCH_DYNAMIC.stepColour(count, total);
  }
  if (step.kind === 'explore') return FRENCH_DYNAMIC.stepExplore;
  const action = lesson.strokes.findIndex((stroke) => stroke.id === step.id) + 1;
  return FRENCH_DYNAMIC.stepDrawing(action, lesson.strokes.length);
}

/** @param {import("./localization/contracts.ts").TimelineEstimate} progress @param {(text: string) => string} translate */
export function timelineEstimate(progress, translate) {
  return /^About \d+ min left$/.test(progress.estimateLabel)
    ? FRENCH_DYNAMIC.remaining(Math.ceil(progress.remainingMs / 60000))
    : translate(progress.estimateLabel);
}
