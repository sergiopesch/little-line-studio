import { availability, validAvailability, isLessonReleased } from "./locale-availability.js";
export { validAvailability, isLessonReleased } from "./locale-availability.js";
import englishIndex from "./narration-index.json" with { type: "json" };
import englishDurations from "./narration-durations.json" with { type: "json" };
import { getLocale } from "./locale-registry.js";
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
  return validAvailability(descriptor, "es-419", knownLessons);
}

const spanishAvailability = getLocale("es-419").availability;

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

export function releasedLessons(locale, lessons = LESSONS) {
  return lessons.filter((lesson) => isLessonReleased(locale, lesson));
}

export function isLessonAvailable(locale, lesson, localeNarration = null) {
  if (locale === "en-GB") return isLessonReleased(locale, lesson);
  if (locale === "es-419") return spanishLessonAvailable(lesson, localeNarration ?? {});
  const authored = getLesson(lesson?.id);
  return Boolean(authored && isLessonReleased(locale, authored) &&
    hasCompleteNarration([authored], localeNarration?.index, localeNarration?.durations));
}

/** @param {import("./core/contracts.ts").NarrationData | null} localeNarration */
export function narrationForLocale(locale, lessons, localeNarration = null) {
  if (locale === "en-GB") return { ready: true, index: englishIndex, durations: englishDurations };
  if (availability[locale] && Array.isArray(lessons) && lessons.length > 0 &&
      lessons.every((lesson) => isLessonAvailable(locale, lesson, localeNarration)))
    return { ready: true, index: localeNarration.index, durations: localeNarration.durations };
  return { ready: false, index: {}, durations: {} };
}
