// Spain Spanish copy remains subject to independent native-speaker review.
export const SPAIN_DYNAMIC = Object.freeze({
  documentTitle: 'Trazolino — Todo dibujo empieza con una pequeña línea',
  errorTitle: 'Hagamos una pequeña pausa.',
  errorBody: 'No se ha podido abrir la clase. Tu dibujo en papel es tuyo. Pide a la persona adulta que vuelva a cargar la página cuando estéis preparados.',
  errorReload: 'Volver a cargar la clase',
  levelExplore: (level, count) => `Explorar ${level}: ${count}`,
  catalogueRange: (level, first, last, total) => `${level}, dibujos del ${first} al ${last} de ${total}`,
  drawTitle: (title) => `Dibujar ${title}`,
  pageCount: (page, total) => `${page} de ${total}`,
  duration: (minutes) => `Unos ${minutes} minutos, más las pausas. Tomad más tiempo cuando lo necesitéis.`,
  remaining: (minutes) => `Quedan unos ${minutes} min`,
  together: (elapsed) => `${elapsed} juntos`,
  preview: (title) => `${title}. Ejemplo terminado; dibuja tu propia versión en papel.`,
  boardBlank: 'Tablero de demostración vacío. Dibuja en tu papel.',
  boardColour: (title) => `${title}. Demostración de coloreado. Dibuja en tu papel.`,
  boardReference: (title) => `${title}. Ejemplo terminado. Dibuja en tu papel.`,
  boardAction: (title, action) => `${title}, trazo ${action}. Dibuja en tu papel.`,
  stepObserve: 'OBSERVA',
  stepColour: (index, total) => `COLOREAR ${index} DE ${total}`,
  stepExplore: 'TU TIEMPO',
  stepDrawing: (index, total) => `DIBUJO ${index} DE ${total}`,
  stepPrepare: 'PREPARACIÓN',
  stepGeneric: (index, total) => `PASO ${index} DE ${total}`,
});

export function demonstrationLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (step.kind === 'prepare') return SPAIN_DYNAMIC.boardBlank;
  if (step.kind === 'colour') return SPAIN_DYNAMIC.boardColour(lesson.title);
  if (step.kind === 'observe' || step.kind === 'explore') return SPAIN_DYNAMIC.boardReference(lesson.title);
  const action = lesson.strokes.findIndex((stroke) => stroke.step === stepIndex) + 1;
  return SPAIN_DYNAMIC.boardAction(lesson.title, action);
}

export function stageLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!lesson.pilot) return stepIndex === 0
    ? SPAIN_DYNAMIC.stepPrepare
    : SPAIN_DYNAMIC.stepGeneric(stepIndex, lesson.steps.length - 1);
  if (step.kind === 'observe') return SPAIN_DYNAMIC.stepObserve;
  if (step.kind === 'colour') {
    const count = lesson.steps.slice(0, stepIndex + 1).filter((part) => part.kind === 'colour').length;
    const total = lesson.steps.filter((part) => part.kind === 'colour').length;
    return SPAIN_DYNAMIC.stepColour(count, total);
  }
  if (step.kind === 'explore') return SPAIN_DYNAMIC.stepExplore;
  const action = lesson.strokes.findIndex((stroke) => stroke.id === step.id) + 1;
  return SPAIN_DYNAMIC.stepDrawing(action, lesson.strokes.length);
}

export function timelineEstimate(progress, translate) {
  return /^About \d+ min left$/.test(progress.estimateLabel)
    ? SPAIN_DYNAMIC.remaining(Math.ceil(progress.remainingMs / 60000))
    : translate(progress.estimateLabel);
}
