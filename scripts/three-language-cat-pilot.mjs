// Offline source-linked audition texts. This script does not contact a provider.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getLesson, narrationKey } from '../src/lesson-catalogue.js';
import { readDraft, validateDraft } from './validate-spanish-spain-draft.mjs';
import { validateGermanPilot } from './validate-german-pilot.mjs';
import { validatePilot } from './italian-pilot.mjs';
import germanCat from '../research/german-draft/basic/cat.de-DE.mjs';

export function pilotTexts() {
  const lesson = getLesson('cat');
  const spanish = readDraft();
  validateDraft(spanish);
  const germanSource = JSON.parse(readFileSync(new URL('../research/german-draft/basic/cat.de-DE.source.json', import.meta.url), 'utf8'));
  validateGermanPilot(lesson, germanCat, germanSource);
  const italianCat = JSON.parse(readFileSync(new URL('../research/italian-pilot/cat.it-IT.json', import.meta.url), 'utf8'));
  validatePilot(lesson, italianCat);
  const definitions = [
    { locale: 'es-ES', voice: 'BkOojM1ZhtSAHgsAkMx2', language: 'es', sample: spanish.pilot.sample, steps: spanish.catalogue.lessons.cat.text.steps },
    { locale: 'de-DE', voice: '5bVYvsqKAWO1hDgOO72l', language: 'de', sample: 'Hallo, wir zeichnen zusammen. Nimm ein Blatt Papier und deine Stifte. Fangen wir mit einer kleinen Linie an.', steps: germanCat.stages },
    { locale: 'it-IT', voice: 'wOXFTxgu7FQDBb1dsL7I', language: 'it', sample: 'Ciao, disegniamo insieme. Prendi un foglio e i tuoi colori. Cominciamo con una piccola linea.', steps: italianCat.steps },
  ];
  return definitions.map(({ steps, sample, ...info }) => {
    const texts = { sample };
    for (const [index, step] of lesson.steps.entries()) {
      texts[narrationKey(lesson, index)] = steps[step.id].spoken;
      texts[narrationKey(lesson, index, 'hint')] = steps[step.id].hint;
    }
    if (Object.keys(texts).length !== 43 || Object.values(texts).some(value => typeof value !== 'string' || !value.trim())) throw Error('Incomplete Cat pilot');
    return { ...info, texts, reviewStatus: 'assistant-draft-awaiting-native-human-review' };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(pilotTexts()));
