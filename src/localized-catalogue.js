const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];

export function createLessonLocalizer(catalogue, locale) {
  function localizedLessonTitle(lesson, languageId) {
    if (languageId !== locale) return lesson?.title ?? null;
    const title = catalogue.lessons[lesson?.id]?.title;
    return typeof title === 'string' && title.trim() ? title : null;
  }
  function localizeLesson(lesson, languageId, translations = catalogue) {
    if (languageId !== locale) return lesson;
    if (translations?.locale !== locale || translations.reviewStatus !== 'assistant-draft-awaiting-native-human-review')
      throw new TypeError('Invalid localized catalogue identity or review status.');
    const text = translations.lessons?.[lesson?.id];
    if (!text?.steps || !Array.isArray(lesson?.steps) ||
        JSON.stringify(Object.keys(text.steps)) !== JSON.stringify(lesson.steps.map(({ id }) => id)))
      throw new TypeError('Localized stages do not match the lesson.');
    if (!Array.isArray(text.pilotPhases) || !Array.isArray(lesson.pilotPhases) ||
        text.pilotPhases.length !== lesson.pilotPhases.length ||
        text.pilotPhases.some((phase, i) => phase?.id !== lesson.pilotPhases[i].id || typeof phase.label !== 'string' || !phase.label.trim()))
      throw new TypeError('Localized phases do not match the lesson.');
    if (lessonFields.some(key => typeof text[key] !== 'string' || (lesson[key] && !text[key].trim())))
      throw new TypeError('Localized lesson text is incomplete.');
    const steps = lesson.steps.map(step => {
      const translated = text.steps[step.id];
      if (!translated || stepFields.some(key => typeof translated[key] !== 'string' || !translated[key].trim()))
        throw new TypeError('Localized stage text is incomplete.');
      return { ...step, ...Object.fromEntries(stepFields.map(key => [key, translated[key]])) };
    });
    return { ...lesson, ...Object.fromEntries(lessonFields.map(key => [key, text[key]])),
      pilotPhases: lesson.pilotPhases.map((phase, i) => ({ ...phase, label: text.pilotPhases[i].label })), steps };
  }
  return { localizeLesson, localizedLessonTitle };
}
