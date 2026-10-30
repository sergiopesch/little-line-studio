// @ts-check
import catalogue from "./dutch-lessons.nl-NL.json" with { type: "json" };
import { createLessonLocalizer } from "./localized-catalogue.js";

export const { localizeLesson, localizedLessonTitle } = createLessonLocalizer(catalogue, "nl-NL");
