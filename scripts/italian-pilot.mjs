// Offline Cat pilot validation and review plan. This never contacts a provider.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LESSONS, narrationKey } from '../src/lesson-catalogue.js';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const required = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const sample = 'Ciao, disegniamo insieme. Prendi un foglio e i tuoi colori. Cominciamo con una piccola linea.';
// Includes varied lengths, positional language, optionality, a letter name,
// quiet practice and two Help hints. No audio is implied by this plan.
const selection = [
  ['notice', 'spoken'], ['round-head', 'spoken'], ['left-ear', 'spoken'],
  ['curved-mouth', 'spoken'], ['left-whisker-middle', 'spoken'],
  ['right-whisker-lower', 'spoken'], ['colour-choice', 'spoken'],
  ['colour-fur', 'spoken'], ['colour-reflection', 'spoken'], ['explore', 'spoken'],
  ['round-head', 'hint'], ['colour-fur', 'hint'],
];
export function validatePilot(source, draft) {
  if (draft.locale !== 'it-IT' || draft.lessonId !== source.id ||
      draft.status !== 'assistant-reviewed-awaiting-native-human-review' ||
      draft.sourceLessonSha256 !== digest(source)) throw Error('Italian pilot identity, status or English source changed');
  for (const key of ['title', 'invitation', 'objective', 'parentNote', 'transfer', 'colouringLabel']) {
    if (typeof draft[key] !== 'string' || !draft[key].trim()) throw Error(`Missing lesson field: ${key}`);
  }
  if (typeof draft.simplify !== 'string') throw Error('Invalid simplify field');
  if (!Array.isArray(draft.pilotPhases) || draft.pilotPhases.length !== source.pilotPhases.length ||
      draft.pilotPhases.some((p, i) => p.id !== source.pilotPhases[i].id || typeof p.label !== 'string' || !p.label.trim())) throw Error('Phase mismatch');
  if (!draft.steps || JSON.stringify(Object.keys(draft.steps)) !== JSON.stringify(source.steps.map(s => s.id))) throw Error('Stage mismatch');
  for (const step of source.steps) {
    const translated = draft.steps[step.id];
    if (!translated || JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify([...required].sort()) ||
        required.some(k => typeof translated[k] !== 'string' || !translated[k].trim())) throw Error(`Incomplete stage: ${step.id}`);
  }
  return true;
}
export function makePilotPlan(source, draft) {
  validatePilot(source, draft);
  const clips = [{ key: 'sample', text: sample }, ...selection.map(([id, field]) => {
    const index = source.steps.findIndex(s => s.id === id);
    if (index < 0) throw Error(`Missing selected stage: ${id}`);
    return { key: narrationKey(source, index, field === 'hint' ? 'hint' : 'instruction'), stage: id, kind: field, text: draft.steps[id][field] };
  })];
  if (new Set(clips.map(c => c.key)).size !== clips.length) throw Error('Duplicate pilot key');
  return { locale: 'it-IT', providerLanguage: 'it', selectedVoice: 'Alina — Friendly Italian', voiceId: 'wOXFTxgu7FQDBb1dsL7I',
    status: 'draft-not-approved-for-generation', sourceLessonSha256: draft.sourceLessonSha256,
    draftSha256: digest(draft), clipCount: clips.length,
    textCharacters: clips.reduce((n, clip) => n + Array.from(clip.text).length, 0), clips };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const draft = JSON.parse(readFileSync(new URL('../research/italian-pilot/cat.it-IT.json', import.meta.url), 'utf8'));
  const plan = makePilotPlan(LESSONS.find(l => l.id === 'cat'), draft);
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
}
