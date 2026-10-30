// @ts-check
import catalogue from "./spanish-lessons.es-419.json" with { type: "json" };
import { createLessonLocalizer } from "./localized-catalogue.js";

export const { localizeLesson, localizedLessonTitle } = createLessonLocalizer(catalogue, "es-419", "assistant-reviewed-awaiting-native-human-review");
