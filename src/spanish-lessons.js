import catalogue from "./spanish-lessons.es-419.json" with { type: "json" };

// This module is loaded lazily. The picker remains disabled until the text and
// complete prepared narration pass their separate release reviews.
const lessonFields = ["title", "invitation", "objective", "parentNote", "simplify", "transfer", "colouringLabel"];
const stepFields = ["title", "instruction", "spoken", "hint", "notice"];

export function localizedLessonTitle(lesson, languageId) {
  if (languageId !== "es-419") return lesson?.title ?? null;
  const title = catalogue.lessons[lesson?.id]?.title;
  return typeof title === "string" && title.trim() ? title : null;
}

export function localizeLesson(lesson, languageId, translations = catalogue) {
  if (languageId !== "es-419") return lesson;
  const text = translations.lessons?.[lesson?.id];
  if (!text?.steps || !Array.isArray(lesson?.steps) ||
      JSON.stringify(Object.keys(text.steps)) !== JSON.stringify(lesson.steps.map(({ id }) => id)))
    throw new TypeError("The Spanish lesson does not match the current teaching stages.");
  if (!Array.isArray(text.pilotPhases) || !Array.isArray(lesson.pilotPhases) ||
      text.pilotPhases.length !== lesson.pilotPhases.length ||
      text.pilotPhases.some((phase, index) => phase?.id !== lesson.pilotPhases[index].id ||
        typeof phase.label !== "string" || !phase.label.trim()))
    throw new TypeError("The Spanish lesson does not match the current teaching phases.");
  if (lessonFields.some((key) => typeof text[key] !== "string" ||
      (lesson[key] && !text[key].trim())))
    throw new TypeError("The Spanish lesson is missing lesson text.");
  const steps = lesson.steps.map((step) => {
    const translated = text.steps[step.id];
    if (!translated || stepFields.some((key) => typeof translated[key] !== "string" || !translated[key].trim()))
      throw new TypeError("The Spanish lesson is missing teaching text.");
    return { ...step, ...Object.fromEntries(stepFields.map((key) => [key, translated[key]])) };
  });
  const lessonText = Object.fromEntries(lessonFields.map((key) => [key, text[key]]));
  const pilotPhases = lesson.pilotPhases.map((phase, index) => ({ ...phase, label: text.pilotPhases[index].label }));
  return { ...lesson, ...lessonText, pilotPhases, steps };
}
