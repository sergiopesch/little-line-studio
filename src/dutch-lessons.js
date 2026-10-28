import catalogue from './dutch-lessons.nl-NL.json' with { type: 'json' };

// Source-linked Dutch text. Availability is controlled by the verified audio catalogue.
const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];

export function localizedLessonTitle(lesson, languageId) {
  if (languageId !== 'nl-NL') return lesson?.title ?? null;
  const title = catalogue.lessons[lesson?.id]?.title;
  return typeof title === 'string' && title.trim() ? title : null;
}

export function localizeLesson(lesson, languageId, translations = catalogue) {
  if (languageId !== 'nl-NL') return lesson;
  if (translations?.locale !== 'nl-NL' || translations.reviewStatus !== 'assistant-draft-awaiting-native-human-review')
    throw new TypeError('The Dutch catalogue has an invalid locale or review status.');
  const text = translations.lessons?.[lesson?.id];
  if (!text?.steps || !Array.isArray(lesson?.steps) ||
      JSON.stringify(Object.keys(text.steps)) !== JSON.stringify(lesson.steps.map(({ id }) => id)))
    throw new TypeError('The Dutch lesson does not match the current teaching stages.');
  if (!Array.isArray(text.pilotPhases) || !Array.isArray(lesson.pilotPhases) ||
      text.pilotPhases.length !== lesson.pilotPhases.length ||
      text.pilotPhases.some((phase, i) => phase?.id !== lesson.pilotPhases[i].id ||
        typeof phase.label !== 'string' || !phase.label.trim()))
    throw new TypeError('The Dutch lesson does not match the current teaching phases.');
  if (lessonFields.some((key) => typeof text[key] !== 'string' || (lesson[key] && !text[key].trim())))
    throw new TypeError('The Dutch lesson is missing lesson text.');
  const steps = lesson.steps.map((step) => {
    const translated = text.steps[step.id];
    if (!translated || stepFields.some((key) => typeof translated[key] !== 'string' || !translated[key].trim()))
      throw new TypeError('The Dutch lesson is missing teaching text.');
    return { ...step, ...Object.fromEntries(stepFields.map((key) => [key, translated[key]])) };
  });
  const lessonText = Object.fromEntries(lessonFields.map((key) => [key, text[key]]));
  const pilotPhases = lesson.pilotPhases.map((phase, i) => ({ ...phase, label: text.pilotPhases[i].label }));
  return { ...lesson, ...lessonText, pilotPhases, steps };
}
