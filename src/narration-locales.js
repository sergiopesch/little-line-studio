import englishIndex from "./narration-index.json" with { type: "json" };
import englishDurations from "./narration-durations.json" with { type: "json" };
import spanishAvailability from "./narration-availability.es-419.json" with { type: "json" };
import { LESSONS, getLesson } from "./lesson-catalogue.js";

export const isNarrationPath = (value) =>
  typeof value === "string" && /^\/narration\/clip-[a-f0-9]{64}\.mp3$/.test(value);

// A locale is voiced only when every authored instruction and hint, and the
// voice sample, have matching local assets and measured durations. A partial
// translation never falls back to another language.
export function hasCompleteNarration(lessons, index, durations) {
  if (!Array.isArray(lessons) || !lessons.length) return false;
  if (lessons.some((lesson) => !lesson?.id || !Array.isArray(lesson.steps) || !lesson.steps.length ||
      lesson.steps.some((step) => typeof step?.id !== "string" || !step.id))) return false;
  const keys = ["sample", ...lessons.flatMap((lesson) =>
    lesson.steps.flatMap((step) => ["instruction", "hint"].map((kind) => `${lesson.id}/${step.id}/${kind}`)))];
  return keys.every((key) => isNarrationPath(index?.[key]) &&
    Number.isFinite(durations?.[key]) && durations[key] > 0);
}

export function validSpanishAvailability(descriptor, knownLessons = LESSONS) {
  if (descriptor?.schemaVersion !== 1 || descriptor.locale !== "es-419" ||
      !Array.isArray(descriptor.lessons) || !Array.isArray(knownLessons)) return false;
  const known = new Set(knownLessons.map((lesson) => lesson.id));
  return descriptor.lessons.every((id, index, ids) =>
    typeof id === "string" && known.has(id) && (index === 0 || ids[index - 1] < id));
}

export function spanishLessonReleased(lesson, {
  descriptor = spanishAvailability,
  knownLessons = LESSONS,
} = {}) {
  if (!validSpanishAvailability(descriptor, knownLessons)) return false;
  const authored = knownLessons.find((item) => item.id === lesson?.id);
  return Boolean(authored && descriptor.lessons.includes(authored.id));
}

export function spanishLessonAvailable(lesson, {
  descriptor = spanishAvailability,
  index,
  durations,
  knownLessons = LESSONS,
} = {}) {
  if (!spanishLessonReleased(lesson, { descriptor, knownLessons })) return false;
  const authored = knownLessons.find((item) => item.id === lesson.id);
  return hasCompleteNarration([authored], index, durations);
}

export function isLessonReleased(locale, lesson) {
  if (locale === "en-GB") return Boolean(getLesson(lesson?.id));
  if (locale === "es-419") return spanishLessonReleased(lesson);
  return false;
}

export function releasedLessons(locale, lessons = LESSONS) {
  return lessons.filter((lesson) => isLessonReleased(locale, lesson));
}

export function isLessonAvailable(locale, lesson, spanishNarration = null) {
  if (locale === "en-GB") return isLessonReleased(locale, lesson);
  if (locale === "es-419") return spanishLessonAvailable(lesson, spanishNarration ?? {});
  return false;
}

export function narrationForLocale(locale, lessons, spanishNarration = null) {
  if (locale === "en-GB") return { ready: true, index: englishIndex, durations: englishDurations };
  if (locale === "es-419" && Array.isArray(lessons) && lessons.length > 0 &&
      lessons.every((lesson) => isLessonAvailable(locale, lesson, spanishNarration)))
    return { ready: true, index: spanishNarration.index, durations: spanishNarration.durations };
  return { ready: false, index: {}, durations: {} };
}
