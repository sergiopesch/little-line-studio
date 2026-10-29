// Offline integration candidate. It is not imported by the running app.
// Independent Italian review and live accessibility review remain pending.
import dictionary from './dynamic.it-IT.json' with { type: 'json' };
const template = (key, values = {}) => dictionary.templates[key].replace(/\{(\w+)\}/g, (_, name) => {
  if (!(name in values)) throw new TypeError(`Missing ${name} for ${key}`);
  return String(values[name]);
});
export const ITALIAN_DYNAMIC = Object.freeze({
  documentTitle: template('documentTitle'), errorTitle: template('errorTitle'),
  errorBody: template('errorBody'), errorReload: template('errorReload'),
  levelExplore: (level, count) => template('levelExplore', { level, count }),
  catalogueRange: (level, first, last, total) => template('catalogueRange', { level, first, last, total }),
  drawTitle: title => template('drawTitle', { title }),
  pageCount: (page, total) => template('pageCount', { page, total }),
  duration: minutes => template('duration', { minutes }), remaining: minutes => template('remaining', { minutes }),
  together: elapsed => template('together', { elapsed }), preview: title => template('preview', { title }),
  boardBlank: template('boardBlank'), boardColour: title => template('boardColour', { title }),
  boardReference: title => template('boardReference', { title }),
  boardAction: (title, action) => template('boardAction', { title, action }),
  stepObserve: template('stepObserve'), stepColour: (index, total) => template('stepColour', { index, total }),
  stepExplore: template('stepExplore'), stepDrawing: (index, total) => template('stepDrawing', { index, total }),
  stepPrepare: template('stepPrepare'), stepGeneric: (index, total) => template('stepGeneric', { index, total }),
});
export function demonstrationLabel(lesson, stepIndex) {
  const kind = lesson.steps[stepIndex].kind;
  if (kind === 'prepare') return ITALIAN_DYNAMIC.boardBlank;
  if (kind === 'colour') return ITALIAN_DYNAMIC.boardColour(lesson.title);
  if (kind === 'observe' || kind === 'explore') return ITALIAN_DYNAMIC.boardReference(lesson.title);
  const index = lesson.strokes.findIndex(stroke => stroke.step === stepIndex);
  if (index < 0) throw new TypeError('No demonstration action for this stage');
  return ITALIAN_DYNAMIC.boardAction(lesson.title, index + 1);
}
export function stageLabel(lesson, stepIndex) {
  const step = lesson.steps[stepIndex];
  if (!lesson.pilot) return stepIndex === 0 ? ITALIAN_DYNAMIC.stepPrepare : ITALIAN_DYNAMIC.stepGeneric(stepIndex, lesson.steps.length - 1);
  if (step.kind === 'observe') return ITALIAN_DYNAMIC.stepObserve;
  if (step.kind === 'colour') return ITALIAN_DYNAMIC.stepColour(
    lesson.steps.slice(0, stepIndex + 1).filter(part => part.kind === 'colour').length,
    lesson.steps.filter(part => part.kind === 'colour').length);
  if (step.kind === 'explore') return ITALIAN_DYNAMIC.stepExplore;
  const index = lesson.strokes.findIndex(stroke => stroke.id === step.id);
  if (index < 0) throw new TypeError('No demonstration action for this stage');
  return ITALIAN_DYNAMIC.stepDrawing(index + 1, lesson.strokes.length);
}
export function timelineEstimate(progress, translate) {
  return /^About \d+ min left$/.test(progress.estimateLabel)
    ? ITALIAN_DYNAMIC.remaining(Math.ceil(progress.remainingMs / 60000)) : translate(progress.estimateLabel);
}
