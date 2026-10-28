// Offline export of source-validated draft narration; no provider calls.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LESSONS, narrationKey } from '../src/lesson-catalogue.js';
import { pilotTexts } from './three-language-cat-pilot.mjs';
import { readDraft, validateDraft } from './validate-spanish-spain-draft.mjs';
import { validateCatalogue as validateGerman } from './validate-german-catalogue.mjs';
import { loadCatalogue, validateCatalogue as validateItalian } from './validate-italian-catalogue.mjs';

export async function fullTexts() {
  const pilot = pilotTexts();
  const spanish = readDraft(); validateDraft(spanish);
  const german = new Map();
  for (const lesson of LESSONS) {
    const stem = `../research/german-draft/${lesson.level}/${lesson.id}.de-DE`;
    const record = (await import(new URL(`${stem}.mjs`, import.meta.url).href)).default;
    const source = JSON.parse(readFileSync(new URL(`${stem}.source.json`, import.meta.url), 'utf8'));
    german.set(lesson.id, { record, source });
  }
  validateGerman(LESSONS, german);
  const italian = loadCatalogue(); validateItalian(LESSONS, italian, { requireAssistantReview: true });
  const italianById = new Map(italian.map(record => [record.lessonId, record]));
  return pilot.map(({ texts: cat, ...info }) => {
    const texts = { sample: cat.sample };
    for (const lesson of LESSONS) {
      const steps = info.locale === 'es-ES' ? spanish.catalogue.lessons[lesson.id].text.steps
        : info.locale === 'de-DE' ? german.get(lesson.id).record.stages : italianById.get(lesson.id).steps;
      for (const [i, step] of lesson.steps.entries()) {
        texts[narrationKey(lesson, i)] = steps[step.id].spoken;
        texts[narrationKey(lesson, i, 'hint')] = steps[step.id].hint;
      }
    }
    if (Object.keys(texts).length !== 1461 || Object.values(texts).some(x => typeof x !== 'string' || !x.trim())) throw Error(`Incomplete narration: ${info.locale}`);
    for (const [key, text] of Object.entries(cat)) if (texts[key] !== text) throw Error(`Pilot changed: ${info.locale}/${key}`);
    return { ...info, texts };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await fullTexts()));
