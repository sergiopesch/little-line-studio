// @ts-check
import catalogue from "./french-lessons.fr-FR.json" with { type: "json" };
import { createLessonLocalizer } from "./localized-catalogue.js";

export const { localizeLesson, localizedLessonTitle } = createLessonLocalizer(catalogue, "fr-FR", "assistant-reviewed-awaiting-native-human-review");
