// @ts-check
// Independent German language review remains pending.
/** @type {import("./localization/contracts.ts").DynamicCopy} */
const copy = {
  documentTitle: 'Trazolino – Jede Zeichnung beginnt mit einer kleinen Linie',
  errorTitle: 'Machen wir eine kleine Pause.',
  errorBody: 'Die Zeichenstunde konnte nicht geöffnet werden. Deine Zeichnung auf Papier gehört dir. Bitte die erwachsene Person bei dir, die Seite neu zu laden, wenn ihr bereit seid.',
  errorReload: 'Zeichenstunde neu laden',
  levelExplore: (level, count) => `${level} entdecken: ${count}`,
  catalogueRange: (level, first, last, total) => `${level}, Zeichnungen ${first} bis ${last} von ${total}`,
  drawTitle: title => `${title} zeichnen`,
  pageCount: (page, total) => `${page} von ${total}`,
  duration: minutes => `Etwa ${minutes} Minuten, ohne Pausen. Nehmt euch mehr Zeit, wann immer ihr sie braucht.`,
  remaining: minutes => `Noch etwa ${minutes} Min.`,
  together: elapsed => `${elapsed} zusammen`,
  preview: title => `${title}. Fertiges Beispiel; zeichne deine eigene Version auf Papier.`,
  boardBlank: 'Leere Zeichentafel. Zeichne auf deinem Blatt.',
  boardColour: title => `${title}. Vorführung zum Ausmalen. Zeichne auf deinem Blatt.`,
  boardReference: title => `${title}. Fertiges Beispiel. Zeichne auf deinem Blatt.`,
  boardAction: (title, action) => `${title}, Strich ${action}. Zeichne auf deinem Blatt.`,
  stepObserve: 'ANSCHAUEN',
  stepColour: (index, total) => `AUSMALEN ${index} VON ${total}`,
  stepExplore: 'DEINE ZEIT',
  stepDrawing: (index, total) => `ZEICHNEN ${index} VON ${total}`,
  stepPrepare: 'VORBEREITUNG',
  stepGeneric: (index, total) => `SCHRITT ${index} VON ${total}`,
};
export const GERMAN_DYNAMIC = Object.freeze(copy);

/** @param {import("./authoring/contracts.ts").AuthoredLesson} lesson @param {number} stepIndex */
export function demonstrationLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!step) throw new TypeError("Unknown localized teaching stage.");
  const kind = step.kind;
  if (kind === 'prepare') return GERMAN_DYNAMIC.boardBlank;
  if (kind === 'colour') return GERMAN_DYNAMIC.boardColour(lesson.title);
  if (kind === 'observe' || kind === 'explore') return GERMAN_DYNAMIC.boardReference(lesson.title);
  const action = lesson.strokes.findIndex(stroke => stroke.step === stepIndex) + 1;
  return GERMAN_DYNAMIC.boardAction(lesson.title, action);
}

/** @param {import("./authoring/contracts.ts").AuthoredLesson} lesson @param {number} stepIndex */
export function stageLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!step) throw new TypeError("Unknown localized teaching stage.");
  if (!lesson.pilot) return stepIndex === 0 ? GERMAN_DYNAMIC.stepPrepare : GERMAN_DYNAMIC.stepGeneric(stepIndex, lesson.steps.length - 1);
  if (step.kind === 'observe') return GERMAN_DYNAMIC.stepObserve;
  if (step.kind === 'colour') {
    const count = lesson.steps.slice(0, stepIndex + 1).filter(part => part.kind === 'colour').length;
    const total = lesson.steps.filter(part => part.kind === 'colour').length;
    return GERMAN_DYNAMIC.stepColour(count, total);
  }
  if (step.kind === 'explore') return GERMAN_DYNAMIC.stepExplore;
  return GERMAN_DYNAMIC.stepDrawing(lesson.strokes.findIndex(stroke => stroke.id === step.id) + 1, lesson.strokes.length);
}

/** @param {import("./localization/contracts.ts").TimelineEstimate} progress @param {(text: string) => string} translate */
export function timelineEstimate(progress, translate) {
  return /^About \d+ min left$/.test(progress.estimateLabel)
    ? GERMAN_DYNAMIC.remaining(Math.ceil(progress.remainingMs / 60000))
    : translate(progress.estimateLabel);
}
