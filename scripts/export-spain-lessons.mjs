// @ts-check
// Deterministically compile the verified Spain Spanish source draft for runtime.
import { pathToFileURL } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
import { readDraft, validateDraft } from './validate-spanish-spain-draft.mjs';
import { compileCatalogue, record, regionalExport } from './localization/export.ts';
import { writeExportFiles } from './localization/write.ts';

export function exportSpain() {
  const source = readDraft();
  validateDraft(source);
  const entries = record(record(source.catalogue, 'Spain catalogue').lessons, 'Spain lessons');
  const lessons = Object.fromEntries(Object.entries(entries).map(([id, item]) => [id, record(item, `es-ES/${id}`).text]));
  const locale = 'es-ES', reviewStatus = 'assistant-draft-awaiting-native-human-review';
  const catalogue = compileCatalogue({ locale, reviewStatus, lessons }, locale, reviewStatus, LESSONS);
  return regionalExport(catalogue, { strings: record(source.ui, 'Spain UI').strings, sample: record(source.pilot, 'Spain pilot').sample });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--write')) throw Error('Use no arguments or --write.');
  const result = exportSpain();
  if (!args.length) console.log(JSON.stringify(result));
  else {
    const { locale, reviewStatus, lessons, strings, sample } = result;
    writeExportFiles([
      { destination: new URL('../src/spanish-lessons.es-ES.json', import.meta.url), contents: JSON.stringify({ locale, reviewStatus, lessons }, null, 2) + '\n' },
      { destination: new URL('../src/spanish-ui.es-ES.json', import.meta.url), contents: JSON.stringify(strings, null, 2) + '\n' },
      { destination: new URL('../src/narration-sample.es-ES.txt', import.meta.url), contents: sample + '\n' },
    ]);
    console.log(JSON.stringify({ locale, lessons: result.count, uiStrings: Object.keys(strings).length }));
  }
}
