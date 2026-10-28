// Deterministically compile the verified Spain Spanish source draft for runtime.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readDraft, validateDraft } from './validate-spanish-spain-draft.mjs';

export function exportSpain() {
  const source = readDraft();
  const coverage = validateDraft(source);
  const lessons = Object.fromEntries(Object.entries(source.catalogue.lessons).map(([id, item]) => [id, item.text]));
  return { locale: 'es-ES', reviewStatus: 'assistant-draft-awaiting-native-human-review',
    count: coverage.lessons, lessons, strings: source.ui.strings, sample: source.pilot.sample };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = exportSpain();
  if (process.argv.length === 2) console.log(JSON.stringify(result));
  else if (process.argv.length === 3 && process.argv[2] === '--write') {
    const runtime = { locale: result.locale, reviewStatus: result.reviewStatus, lessons: result.lessons };
    writeFileSync(new URL('../src/spanish-lessons.es-ES.json', import.meta.url), JSON.stringify(runtime, null, 2) + '\n');
    writeFileSync(new URL('../src/spanish-ui.es-ES.json', import.meta.url), JSON.stringify(result.strings, null, 2) + '\n');
    writeFileSync(new URL('../src/narration-sample.es-ES.txt', import.meta.url), result.sample + '\n');
    console.log(JSON.stringify({ locale: result.locale, lessons: result.count, uiStrings: Object.keys(result.strings).length }));
  } else throw Error('Use no arguments or --write.');
}
