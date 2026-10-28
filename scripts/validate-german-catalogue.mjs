// Offline draft verification. The default full-catalogue mode fails closed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LESSONS, narrationKey } from '../src/lesson-catalogue.js';

const lessonFields = ['title','invitation','objective','parentNote','simplify','transfer','colouringLabel'];
const stageFields = ['title','instruction','spoken','hint','notice'];
const sourceFields = ['id', ...lessonFields];
const sourceStageFields = ['id','kind', ...stageFields, 'canSkip','quietMs'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new TypeError(message); };
export function validateGermanLesson(lesson, record, source) {
  if (!lesson || record?.locale !== 'de-DE' || record?.lessonId !== lesson.id || source?.lessonId !== lesson.id || record.status !== 'assistant-draft-awaiting-native-human-review') fail('Invalid lesson identity or review status');
  const text = { ...Object.fromEntries(sourceFields.map(key => [key, lesson[key]])), steps: lesson.steps.map(step => Object.fromEntries(sourceStageFields.filter(key => step[key] !== undefined).map(key => [key, step[key]]))) };
  if (hash(lesson) !== source.sourceLessonSha256 || hash(text) !== source.sourceTextSha256) fail(`English source or geometry changed: ${lesson.id}`);
  if (lessonFields.some(key => typeof record[key] !== 'string' || (lesson[key] && !record[key].trim()))) fail(`Missing lesson text: ${lesson.id}`);
  if (!Array.isArray(record.pilotPhases) || JSON.stringify(record.pilotPhases.map(phase => phase.id)) !== JSON.stringify(lesson.pilotPhases.map(phase => phase.id)) || record.pilotPhases.some(phase => typeof phase.label !== 'string' || !phase.label.trim())) fail(`Invalid phases: ${lesson.id}`);
  if (!record.stages || JSON.stringify(Object.keys(record.stages)) !== JSON.stringify(lesson.steps.map(step => step.id))) fail(`Invalid stage order: ${lesson.id}`);
  for (const step of lesson.steps) {
    const translated = record.stages[step.id];
    if (!translated || JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify([...stageFields].sort()) || stageFields.some(key => typeof translated[key] !== 'string' || !translated[key].trim())) fail(`Missing stage text: ${lesson.id}/${step.id}`);
  }
  return { lessonId: lesson.id, stageCount: lesson.steps.length, narrationKeys: lesson.steps.flatMap((_, i) => [narrationKey(lesson,i), narrationKey(lesson,i,'hint')]) };
}
export function validateCatalogue(lessons, records) {
  if (!Array.isArray(lessons) || !lessons.length || records.size !== lessons.length) fail('German catalogue is incomplete');
  const results = lessons.map(lesson => { const entry = records.get(lesson.id); if (!entry) fail(`Missing German lesson: ${lesson.id}`); return validateGermanLesson(lesson, entry.record, entry.source); });
  const keys = results.flatMap(r => r.narrationKeys);
  if (new Set(keys).size !== keys.length) fail('Duplicate narration key');
  return { locale: 'de-DE', status: 'assistant-draft-awaiting-native-human-review', lessons: results.length, stages: results.reduce((n, r) => n + r.stageCount, 0), narrationKeys: keys };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); if (args.length > 1 || (args.length && !['--progress', '--export-text'].includes(args[0]))) fail('Use --progress, --export-text or no arguments');
  const records = new Map(), missing = [];
  for (const lesson of LESSONS) {
    const stem = `../research/german-draft/${lesson.level}/${lesson.id}.de-DE`;
    const draft = new URL(`${stem}.mjs`, import.meta.url), source = new URL(`${stem}.source.json`, import.meta.url);
    if (!existsSync(draft) || !existsSync(source)) { missing.push(lesson.id); continue; }
    const record = (await import(draft.href)).default;
    const entry = { record, source: JSON.parse(readFileSync(source,'utf8')) };
    validateGermanLesson(lesson, entry.record, entry.source);
    records.set(lesson.id, entry);
  }
  if (args[0] === '--progress') console.log(JSON.stringify({ locale:'de-DE', drafted: records.size, total: LESSONS.length, stages: LESSONS.filter(l => records.has(l.id)).reduce((n,l) => n + l.steps.length,0), missing, releaseReady: false },null,2));
  else {
    const validated = validateCatalogue(LESSONS, records);
    if (args[0] === '--export-text') {
      const lessons = {}, texts = {};
      for (const lesson of LESSONS) {
        const record = records.get(lesson.id).record;
        lessons[lesson.id] = { ...Object.fromEntries(lessonFields.map(key => [key, record[key]])), pilotPhases: record.pilotPhases, steps: record.stages };
        for (const [i, step] of lesson.steps.entries()) {
          texts[narrationKey(lesson, i)] = record.stages[step.id].spoken;
          texts[narrationKey(lesson, i, 'hint')] = record.stages[step.id].hint;
        }
      }
      console.log(JSON.stringify({ ...validated, lessons, texts }, null, 2));
    } else console.log(JSON.stringify(validated,null,2));
  }
}
