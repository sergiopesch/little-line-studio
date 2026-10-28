// Offline preparation checks only. A passing result is not a release or language review.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LESSONS, narrationKey } from '../src/lesson-catalogue.js';
import { FRENCH_UI } from '../src/french-ui.fr-FR.js';
import { FRENCH_DYNAMIC } from '../src/french-dynamic.fr-FR.js';
import { DUTCH_DYNAMIC } from '../research/dutch-draft/dynamic.nl-NL.js';

const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const fullFields = ['id', ...lessonFields];
const fullStepFields = ['id', 'kind', ...stepFields, 'canSkip', 'quietMs'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message) => { throw new Error(message); };
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());
const sorted = (keys) => [...keys].sort();
const sameKeys = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export function validateLesson(record, lesson) {
  if (record?.locale !== 'nl-NL' || record.lessonId !== lesson.id ||
      record.status !== 'assistant-draft-awaiting-native-human-review') fail(`Invalid Dutch identity or status: ${lesson.id}`);
  const source = {
    ...Object.fromEntries(fullFields.map((key) => [key, lesson[key]])),
    steps: lesson.steps.map((step) => Object.fromEntries(fullStepFields.filter((key) => step[key] !== undefined).map((key) => [key, step[key]]))),
  };
  if (record.sourceLessonSha256 !== hash(lesson) || record.sourceTextSha256 !== hash(source))
    fail(`Source or geometry changed: ${lesson.id}`);
  if (lessonFields.some((key) => typeof record[key] !== 'string' || (lesson[key] && !nonempty(record[key]))))
    fail(`Missing lesson wording: ${lesson.id}`);
  if (!Array.isArray(record.pilotPhases) || JSON.stringify(record.pilotPhases.map((p) => p.id)) !== JSON.stringify(lesson.pilotPhases.map((p) => p.id)) ||
      record.pilotPhases.some((p) => !nonempty(p.label))) fail(`Phase mismatch: ${lesson.id}`);
  if (!record.stages || JSON.stringify(Object.keys(record.stages)) !== JSON.stringify(lesson.steps.map((step) => step.id)))
    fail(`Stage mismatch: ${lesson.id}`);
  const texts = {};
  lesson.steps.forEach((step, index) => {
    const stage = record.stages[step.id];
    if (!stage || !sameKeys(Object.keys(stage), stepFields) || stepFields.some((key) => !nonempty(stage[key])))
      fail(`Incomplete stage: ${lesson.id}/${step.id}`);
    texts[narrationKey(lesson, index)] = stage.spoken;
    texts[narrationKey(lesson, index, 'hint')] = stage.hint;
  });
  return texts;
}

export function validateUI(ui) {
  if (ui?.locale !== 'nl-NL' || ui.status !== 'assistant-draft-awaiting-native-human-review' ||
      !ui.strings || !sameKeys(Object.keys(ui.strings), Object.keys(FRENCH_UI)) ||
      Object.values(ui.strings).some((value) => !nonempty(value))) fail('Dutch UI keys or wording are incomplete.');
  if (!sameKeys(Object.keys(DUTCH_DYNAMIC), Object.keys(FRENCH_DYNAMIC)) ||
      Object.keys(FRENCH_DYNAMIC).some((key) => typeof DUTCH_DYNAMIC[key] !== typeof FRENCH_DYNAMIC[key]))
    fail('Dutch dynamic UI keys are incomplete.');
}

export function inspectDraft({ complete = false } = {}) {
  const ui = JSON.parse(readFileSync(new URL('../research/dutch-draft/ui.nl-NL.json', import.meta.url), 'utf8'));
  validateUI(ui);
  const missing = [], texts = {};
  for (const lesson of LESSONS) {
    const url = new URL(`../research/dutch-draft/${lesson.level}/${lesson.id}.nl-NL.json`, import.meta.url);
    if (!existsSync(url)) { missing.push(lesson.id); continue; }
    Object.assign(texts, validateLesson(JSON.parse(readFileSync(url, 'utf8')), lesson));
  }
  if (complete && missing.length) fail(`Dutch catalogue incomplete: ${missing.length} lessons missing.`);
  return { locale: 'nl-NL', status: 'draft-not-released', lessons: LESSONS.length - missing.length,
    stages: Object.keys(texts).length / 2, narrationKeys: Object.keys(texts).length, missing, texts };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--complete')) fail('Use no arguments or --complete.');
  console.log(JSON.stringify(inspectDraft({ complete: args[0] === '--complete' }), null, 2));
}
