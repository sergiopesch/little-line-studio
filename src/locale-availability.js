import { LOCALES } from "./locale-registry.js";
import LESSON_DIRECTORY from "./lesson-directory.json" with { type: "json" };

const knownIds = new Set(LESSON_DIRECTORY.map(lesson => lesson.id));
export function validAvailability(descriptor, locale, knownLessons = LESSON_DIRECTORY) {
  if (descriptor?.schemaVersion !== 1 || descriptor.locale !== locale ||
      !Array.isArray(descriptor.lessons) || !Array.isArray(knownLessons)) return false;
  const known = new Set(knownLessons.map((lesson) => lesson.id));
  return descriptor.lessons.every((id, index, ids) =>
    typeof id === "string" && known.has(id) && (index === 0 || ids[index - 1] < id));
}

export const availability = Object.freeze(Object.fromEntries(LOCALES.filter(locale => locale.availability)
  .map(locale => [locale.id, locale.availability])));

export function isLessonReleased(locale, lesson) {
  if (locale === "en-GB") return Boolean(knownIds.has(lesson?.id));
  const descriptor = availability[locale];
  return Boolean(validAvailability(descriptor, locale) && knownIds.has(lesson?.id) && descriptor.lessons.includes(lesson.id));
}
