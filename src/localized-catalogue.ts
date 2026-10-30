import type { AuthoredLesson, TeachingPhase } from "./authoring/contracts.ts";
import type { CatalogueReviewStatus, LanguageText, LocalizedCatalogue, LocalizedLessonText, LocalizedStepText } from "./localization/contracts.ts";

function record(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(message);
}

function text(value: unknown, message: string, nonempty = true): string {
  if (typeof value !== "string" || (nonempty && !value.trim())) throw new TypeError(message);
  return value;
}

function stepText(value: unknown): LocalizedStepText {
  const message = "The localized lesson is missing teaching text.";
  record(value, message);
  return Object.freeze({
    title: text(value.title, message), instruction: text(value.instruction, message),
    spoken: text(value.spoken, message), hint: text(value.hint, message), notice: text(value.notice, message),
  });
}

function phaseText(value: unknown): TeachingPhase {
  const message = "The localized lesson does not match the current teaching phases.";
  record(value, message);
  const id = value.id;
  if (id !== "observe" && id !== "draw" && id !== "colour" && id !== "explore") throw new TypeError(message);
  return Object.freeze({ id, label: text(value.label, message) });
}

function lessonText(value: unknown): LocalizedLessonText {
  const message = "The localized lesson is missing lesson text.";
  record(value, message);
  record(value.steps, "The localized lesson does not match the current teaching stages.");
  if (!Array.isArray(value.pilotPhases)) throw new TypeError("The localized lesson does not match the current teaching phases.");
  // Only these text fields cross into an authored lesson. Extra catalogue fields
  // cannot replace identity, geometry, progression, practice windows or music.
  return Object.freeze({
    title: text(value.title, message, false), invitation: text(value.invitation, message, false),
    objective: text(value.objective, message, false), parentNote: text(value.parentNote, message, false),
    simplify: text(value.simplify, message, false), transfer: text(value.transfer, message, false),
    colouringLabel: text(value.colouringLabel, message, false),
    pilotPhases: Object.freeze(value.pilotPhases.map(phaseText)),
    steps: Object.freeze(Object.fromEntries(Object.entries(value.steps).map(([id, entry]) => [id, stepText(entry)]))),
  });
}

function catalogueData(input: unknown, locale: string, reviewStatus: CatalogueReviewStatus): LocalizedCatalogue {
  const message = "The localized catalogue has an invalid locale or review status.";
  record(input, message);
  if (input.locale !== locale || input.reviewStatus !== reviewStatus) throw new TypeError(message);
  record(input.lessons, "The localized lesson does not match the current teaching stages.");
  return Object.freeze({ locale, reviewStatus,
    lessons: Object.freeze(Object.fromEntries(Object.entries(input.lessons).map(([id, entry]) => [id, lessonText(entry)]))),
  });
}

function findLesson(catalogue: LocalizedCatalogue, id: string): LocalizedLessonText | undefined {
  return Object.hasOwn(catalogue.lessons, id) ? catalogue.lessons[id] : undefined;
}

// JSON is checked when its lazy module opens, before exposing callable text.
// Each locale retains its own sentences, grammar and review provenance.
export function createLessonLocalizer(input: unknown, locale: string,
  reviewStatus: CatalogueReviewStatus = "assistant-draft-awaiting-native-human-review"): LanguageText {
  const catalogue = catalogueData(input, locale, reviewStatus);
  return {
    localizedLessonTitle(lesson, languageId) {
      if (languageId !== locale) return lesson?.title ?? null;
      const title = lesson && findLesson(catalogue, lesson.id)?.title;
      return typeof title === "string" && title.trim() ? title : null;
    },
    localizeLesson(lesson: AuthoredLesson, languageId: string, translations?: unknown): AuthoredLesson {
      if (languageId !== locale) return lesson;
      const active = translations === undefined ? catalogue : catalogueData(translations, locale, reviewStatus);
      const translated = findLesson(active, lesson.id);
      if (!translated || !Array.isArray(lesson.steps) ||
          JSON.stringify(Object.keys(translated.steps)) !== JSON.stringify(lesson.steps.map(step => step.id)))
        throw new TypeError("The localized lesson does not match the current teaching stages.");
      const { steps: translatedSteps, pilotPhases: translatedPhases, ...fields } = translated;
      if (!Array.isArray(lesson.pilotPhases) || translatedPhases.length !== lesson.pilotPhases.length)
        throw new TypeError("The localized lesson does not match the current teaching phases.");
      for (const key of ["title", "invitation", "objective", "parentNote", "simplify", "transfer", "colouringLabel"] as const) {
        if (lesson[key] && !fields[key].trim()) throw new TypeError("The localized lesson is missing lesson text.");
      }
      const steps = lesson.steps.map(step => {
        const entry = translatedSteps[step.id];
        if (!entry) throw new TypeError("The localized lesson is missing teaching text.");
        return { ...step, ...entry };
      });
      const pilotPhases = lesson.pilotPhases.map((phase, index) => {
        const entry = translatedPhases[index];
        if (!entry || entry.id !== phase.id) throw new TypeError("The localized lesson does not match the current teaching phases.");
        return { ...phase, label: entry.label };
      });
      return { ...lesson, ...fields, pilotPhases, steps };
    },
  };
}
