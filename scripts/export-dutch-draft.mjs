// @ts-check
// Offline export of complete draft text. This neither activates a locale nor generates audio.
import { pathToFileURL } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
import { inspectDraft, validateLesson } from './verify-dutch-draft.mjs';
import { compileCatalogue, lessonTextInput, readRecord } from './localization/export.ts';
import { writeExportFiles } from './localization/write.ts';

export function exportDutchDraft() {
  inspectDraft({ complete: true });
  /** @type {Record<string, unknown>} */
  const lessons = {};
  for (const lesson of LESSONS) {
    const record = readRecord(new URL(`../research/dutch-draft/${lesson.level}/${lesson.id}.nl-NL.json`, import.meta.url));
    validateLesson(record, lesson);
    lessons[lesson.id] = lessonTextInput(record, 'stages');
  }
  const locale = 'nl-NL', reviewStatus = 'assistant-draft-awaiting-native-human-review';
  return compileCatalogue({ locale, reviewStatus, lessons }, locale, reviewStatus, LESSONS);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--write-catalogue')) throw new Error('Use no arguments or --write-catalogue.');
  const catalogue = exportDutchDraft();
  if (!args.length) console.log(JSON.stringify(catalogue));
  else {
    writeExportFiles([{ destination: new URL('../src/dutch-lessons.nl-NL.json', import.meta.url), contents: JSON.stringify(catalogue, null, 2) + '\n' }]);
    console.log(JSON.stringify({ locale: catalogue.locale, status: catalogue.reviewStatus, lessons: Object.keys(catalogue.lessons).length }));
  }
}
