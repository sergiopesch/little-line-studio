// Offline export of complete draft text. This neither activates a locale nor generates audio.
import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
import { inspectDraft } from './verify-dutch-draft.mjs';

export function exportDutchDraft() {
  inspectDraft({ complete: true });
  const lessons = {};
  for (const lesson of LESSONS) {
    const record = JSON.parse(readFileSync(new URL(`../research/dutch-draft/${lesson.level}/${lesson.id}.nl-NL.json`, import.meta.url), 'utf8'));
    const { title, invitation, objective, parentNote, simplify, transfer, colouringLabel, pilotPhases, stages } = record;
    lessons[lesson.id] = { title, invitation, objective, parentNote, simplify, transfer, colouringLabel, pilotPhases, steps: stages };
  }
  return { locale: 'nl-NL', reviewStatus: 'assistant-draft-awaiting-native-human-review', lessons };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const catalogue = exportDutchDraft();
  if (!args.length) console.log(JSON.stringify(catalogue));
  else if (args.length === 1 && args[0] === '--write-catalogue') {
    const dest = new URL('../src/dutch-lessons.nl-NL.json', import.meta.url);
    const tmp = new URL(`../src/.dutch-catalogue-${randomUUID()}.tmp`, import.meta.url);
    try {
      writeFileSync(tmp, `${JSON.stringify(catalogue, null, 2)}\n`, { flag: 'wx' });
      renameSync(tmp, dest);
    } finally { try { unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    console.log(JSON.stringify({ locale: catalogue.locale, status: catalogue.reviewStatus, lessons: Object.keys(catalogue.lessons).length }));
  } else throw new Error('Use no arguments or --write-catalogue.');
}
