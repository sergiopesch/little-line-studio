// Offline validation only. A valid pilot is not a locale release or an audio plan.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getLesson, narrationKey } from '../src/lesson-catalogue.js';
import draft from '../research/german-draft/basic/cat.de-DE.mjs';

const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const sourceFields = ['id', ...lessonFields];
const sourceStepFields = ['id', 'kind', ...stepFields, 'canSkip', 'quietMs'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const select = (object, fields) => Object.fromEntries(fields.filter(key => object[key] !== undefined).map(key => [key, object[key]]));
export function validateGermanPilot(lesson, record, source) {
  const fail = message => { throw new TypeError(message); };
  if (record?.locale !== 'de-DE' || record?.lessonId !== 'cat' || lesson?.id !== 'cat' || source?.lessonId !== 'cat' || record.status !== 'assistant-draft-awaiting-native-human-review') fail('Invalid pilot identity or review status');
  const text = { ...Object.fromEntries(sourceFields.map(key => [key, lesson[key]])), steps: lesson.steps.map(step => select(step, sourceStepFields)) };
  if (hash(lesson) !== source.sourceLessonSha256 || hash(text) !== source.sourceTextSha256) fail('English source or geometry changed');
  if (lessonFields.some(key => typeof record[key] !== 'string' || (lesson[key] && !record[key].trim()))) fail('Missing lesson text');
  if (!Array.isArray(record.pilotPhases) || JSON.stringify(record.pilotPhases.map(p => p.id)) !== JSON.stringify(lesson.pilotPhases.map(p => p.id)) || record.pilotPhases.some(p => typeof p.label !== 'string' || !p.label.trim())) fail('Invalid phases');
  if (!record.stages || JSON.stringify(Object.keys(record.stages)) !== JSON.stringify(lesson.steps.map(step => step.id))) fail('Invalid stage order');
  for (const step of lesson.steps) {
    const translated = record.stages[step.id];
    if (!translated || JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify([...stepFields].sort()) || stepFields.some(key => typeof translated[key] !== 'string' || !translated[key].trim())) fail(`Missing stage text: ${step.id}`);
  }
  return { locale: record.locale, lessonId: lesson.id, stages: lesson.steps.length, narrationKeys: lesson.steps.flatMap((_, index) => [narrationKey(lesson, index), narrationKey(lesson, index, 'hint')]), reviewStatus: record.status };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = JSON.parse(readFileSync(new URL('../research/german-draft/basic/cat.de-DE.source.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(validateGermanPilot(getLesson('cat'), draft, source), null, 2));
}
