// @ts-check
import catalogue from "./spanish-lessons.es-ES.json" with { type: "json" };
import { createLessonLocalizer } from "./localized-catalogue.js";

export const { localizeLesson, localizedLessonTitle } = createLessonLocalizer(catalogue, "es-ES");
