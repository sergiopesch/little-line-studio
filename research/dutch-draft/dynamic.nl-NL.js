// @ts-check
// Draft only: language and accessibility review by a native speaker is pending.
/** @type {import("../../src/localization/contracts.ts").DynamicCopy} */
const copy = {
  documentTitle: 'Trazolino — Elke tekening begint met een klein lijntje',
  errorTitle: 'Laten we even pauzeren.',
  errorBody: 'De les kon niet worden geopend. Je tekening op papier blijft van jou. Vraag de volwassene bij je om de pagina opnieuw te laden als jullie er klaar voor zijn.',
  errorReload: 'Les opnieuw laden',
  levelExplore: (level, count) => `Ontdek ${level}: ${count}`,
  catalogueRange: (level, first, last, total) => `${level}, tekeningen ${first} tot en met ${last} van ${total}`,
  drawTitle: (title) => `${title} tekenen`,
  pageCount: (page, total) => `${page} van ${total}`,
  duration: (minutes) => `Ongeveer ${minutes} minuten, zonder pauzes. Neem meer tijd wanneer je die nodig hebt.`,
  remaining: (minutes) => `Nog ongeveer ${minutes} min`,
  together: (elapsed) => `${elapsed} samen`,
  preview: (title) => `${title}. Voltooid voorbeeld; teken je eigen versie op papier.`,
  boardBlank: 'Leeg demonstratiebord. Teken op je papier.',
  boardColour: (title) => `${title}. Kleurdemonstratie. Teken op je papier.`,
  boardReference: (title) => `${title}. Voltooid voorbeeld. Teken op je papier.`,
  boardAction: (title, action) => `${title}, lijn ${action}. Teken op je papier.`,
  stepObserve: 'KIJKEN',
  stepColour: (index, total) => `KLEUREN ${index} VAN ${total}`,
  stepExplore: 'JOUW MOMENT',
  stepDrawing: (index, total) => `TEKENEN ${index} VAN ${total}`,
  stepPrepare: 'VOORBEREIDING',
  stepGeneric: (index, total) => `STAP ${index} VAN ${total}`,
};
export const DUTCH_DYNAMIC = Object.freeze(copy);

// Proposed accessibility and timeline helpers for a later gated integration.
/** @param {import("../../src/authoring/contracts.ts").AuthoredLesson} lesson @param {number} stepIndex */
export function demonstrationLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!step) throw new TypeError("Unknown localized teaching stage.");
  const kind = step.kind;
  if (kind === 'prepare') return DUTCH_DYNAMIC.boardBlank;
  if (kind === 'colour') return DUTCH_DYNAMIC.boardColour(lesson.title);
  if (kind === 'observe' || kind === 'explore') return DUTCH_DYNAMIC.boardReference(lesson.title);
  const action = lesson.strokes.findIndex((stroke) => stroke.step === stepIndex) + 1;
  return DUTCH_DYNAMIC.boardAction(lesson.title, action);
}

/** @param {import("../../src/authoring/contracts.ts").AuthoredLesson} lesson @param {number} stepIndex */
export function stageLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!step) throw new TypeError("Unknown localized teaching stage.");
  if (!lesson.pilot) return stepIndex === 0
    ? DUTCH_DYNAMIC.stepPrepare
    : DUTCH_DYNAMIC.stepGeneric(stepIndex, lesson.steps.length - 1);
  if (step.kind === 'observe') return DUTCH_DYNAMIC.stepObserve;
  if (step.kind === 'colour') {
    const count = lesson.steps.slice(0, stepIndex + 1).filter((part) => part.kind === 'colour').length;
    const total = lesson.steps.filter((part) => part.kind === 'colour').length;
    return DUTCH_DYNAMIC.stepColour(count, total);
  }
  if (step.kind === 'explore') return DUTCH_DYNAMIC.stepExplore;
  const action = lesson.strokes.findIndex((stroke) => stroke.id === step.id) + 1;
  return DUTCH_DYNAMIC.stepDrawing(action, lesson.strokes.length);
}

/** @param {import("../../src/localization/contracts.ts").TimelineEstimate} progress @param {(text: string) => string} translate */
export function timelineEstimate(progress, translate) {
  return /^About \d+ min left$/.test(progress.estimateLabel)
    ? DUTCH_DYNAMIC.remaining(Math.ceil(progress.remainingMs / 60000))
    : translate(progress.estimateLabel);
}
