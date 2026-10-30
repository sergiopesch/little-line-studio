// @ts-check
import catalogue from "./german-lessons.de-DE.json" with { type: "json" };
import { createLessonLocalizer } from "./localized-catalogue.js";

export const { localizeLesson, localizedLessonTitle } = createLessonLocalizer(catalogue, "de-DE");
