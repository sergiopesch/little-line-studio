import catalogue from './italian-lessons.it-IT.json' with { type: 'json' };
import { createLessonLocalizer } from './localized-catalogue.js';
export const { localizeLesson, localizedLessonTitle } = createLessonLocalizer(catalogue, 'it-IT');
