// @ts-check
// Compile source-validated German and Italian drafts without provider access.
import { pathToFileURL } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
import { fullTexts } from './three-language-full-texts.mjs';
import { loadCatalogue, validateCatalogue as validateItalian } from './validate-italian-catalogue.mjs';
import { validateGermanLesson } from './validate-german-catalogue.mjs';
import { compileCatalogue, lessonTextInput, readRecord, record, regionalExport } from './localization/export.ts';
import { writeExportFiles } from './localization/write.ts';

export async function exportGermanItalian() {
  const source = Object.fromEntries((await fullTexts()).map(item => [item.locale, record(item, 'Narration source')]));
  const loadedItalian = loadCatalogue();
  validateItalian(LESSONS, loadedItalian, { requireAssistantReview: true });
  /** @type {Map<string, Record<string, unknown>>} */
  const italian = new Map();
  for (const input of loadedItalian) {
    const item = record(input, 'Italian lesson');
    if (typeof item.lessonId !== 'string') throw new TypeError('Invalid Italian lesson identity');
    italian.set(item.lessonId, item);
  }
  /** @type {Record<'de-DE' | 'it-IT', Record<string, unknown>>} */
  const records = { 'de-DE': {}, 'it-IT': {} };
  for (const lesson of LESSONS) {
    const stem = `../research/german-draft/${lesson.level}/${lesson.id}.de-DE`;
    const german = record((await import(new URL(`${stem}.mjs`, import.meta.url).href)).default, `de-DE/${lesson.id}`);
    validateGermanLesson(lesson, german, readRecord(new URL(`${stem}.source.json`, import.meta.url)));
    records['de-DE'][lesson.id] = lessonTextInput(german, 'stages');
    records['it-IT'][lesson.id] = lessonTextInput(italian.get(lesson.id));
  }
  /** @type {readonly ('de-DE' | 'it-IT')[]} */
  const locales = ['de-DE', 'it-IT'];
  return locales.map(locale => {
    const uiFile = locale === 'de-DE' ? '../research/german-draft/ui.de-DE.json' : '../research/italian-pilot/ui.it-IT.json';
    const ui = readRecord(new URL(uiFile, import.meta.url));
    if (ui.locale !== locale || typeof ui.status !== 'string' || !ui.status.includes('native-human-review')) throw Error(`Invalid ${locale} UI draft`);
    const reviewStatus = 'assistant-draft-awaiting-native-human-review';
    const catalogue = compileCatalogue({ locale, reviewStatus, lessons: records[locale] }, locale, reviewStatus, LESSONS);
    const narration = record(record(source[locale], `${locale}/narration`).texts, `${locale}/narration texts`);
    return regionalExport(catalogue, { strings: ui.strings, sample: narration.sample });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--write')) throw Error('Use no arguments or --write.');
  const result = await exportGermanItalian();
  if (!args.length) console.log(JSON.stringify(result));
  else {
    writeExportFiles(result.flatMap(({ locale, reviewStatus, lessons, strings, sample }) => {
      const prefix = locale === 'de-DE' ? 'german' : 'italian';
      return [
        { destination: new URL(`../src/${prefix}-lessons.${locale}.json`, import.meta.url), contents: JSON.stringify({ locale, reviewStatus, lessons }, null, 2) + '\n' },
        { destination: new URL(`../src/${prefix}-ui.${locale}.json`, import.meta.url), contents: JSON.stringify(strings, null, 2) + '\n' },
        { destination: new URL(`../src/narration-sample.${locale}.txt`, import.meta.url), contents: sample + '\n' },
      ];
    }));
    console.log(JSON.stringify(result.map(({ locale, count, strings }) => ({ locale, lessons: count, uiStrings: Object.keys(strings).length }))));
  }
}
