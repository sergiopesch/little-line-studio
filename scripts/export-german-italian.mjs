// Compile source-validated German and Italian drafts without provider access.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
import { fullTexts } from './three-language-full-texts.mjs';
import { loadCatalogue } from './validate-italian-catalogue.mjs';

export async function exportGermanItalian() {
  const source = Object.fromEntries((await fullTexts()).map(item => [item.locale, item]));
  const italian = new Map(loadCatalogue().map(record => [record.lessonId, record]));
  const fields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel', 'pilotPhases'];
  const records = { 'de-DE': {}, 'it-IT': {} };
  for (const lesson of LESSONS) {
    const file = new URL(`../research/german-draft/${lesson.level}/${lesson.id}.de-DE.mjs`, import.meta.url);
    const german = (await import(file.href)).default, it = italian.get(lesson.id);
    for (const [locale, record, steps] of [['de-DE', german, german.stages], ['it-IT', it, it.steps]]) {
      records[locale][lesson.id] = { ...Object.fromEntries(fields.map(key => [key, record[key]])), steps };
    }
  }
  return ['de-DE', 'it-IT'].map(locale => {
    const uiFile = locale === 'de-DE' ? '../research/german-draft/ui.de-DE.json' : '../research/italian-pilot/ui.it-IT.json';
    const ui = JSON.parse(readFileSync(new URL(uiFile, import.meta.url), 'utf8'));
    if (ui.locale !== locale || !ui.strings || !String(ui.status).includes('native-human-review')) throw Error(`Invalid ${locale} UI draft`);
    return { locale, reviewStatus: 'assistant-draft-awaiting-native-human-review', count: LESSONS.length,
      lessons: records[locale], strings: ui.strings, sample: source[locale].texts.sample };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await exportGermanItalian();
  if (process.argv.length === 2) console.log(JSON.stringify(result));
  else if (process.argv.length === 3 && process.argv[2] === '--write') {
    for (const item of result) {
      const { locale, reviewStatus, lessons, strings, sample } = item;
      const prefix = locale === 'de-DE' ? 'german' : 'italian';
      writeFileSync(new URL(`../src/${prefix}-lessons.${locale}.json`, import.meta.url), JSON.stringify({ locale, reviewStatus, lessons }, null, 2) + '\n');
      writeFileSync(new URL(`../src/${prefix}-ui.${locale}.json`, import.meta.url), JSON.stringify(strings, null, 2) + '\n');
      writeFileSync(new URL(`../src/narration-sample.${locale}.txt`, import.meta.url), sample + '\n');
    }
    console.log(JSON.stringify(result.map(({ locale, count, strings }) => ({ locale, lessons: count, uiStrings: Object.keys(strings).length }))));
  } else throw Error('Use no arguments or --write.');
}
