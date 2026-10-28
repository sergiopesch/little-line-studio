// Offline checks for an editorial draft, not a release or provider plan.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
import sourceSpanish from '../src/spanish-lessons.es-419.json' with { type: 'json' };
import { FRENCH_UI } from '../src/french-ui.fr-FR.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const fail = (message) => { throw new Error(message); };
const checkKeys = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(message);
};

export function validateDraft({ catalogue, ui, pilot, lessons = LESSONS, spanish = sourceSpanish, sourceUI }) {
  if (catalogue.locale !== 'es-ES' || catalogue.status !== 'draft-adapted-from-es-419-awaiting-editorial-and-native-review') fail('Invalid catalogue identity or status');
  checkKeys(Object.keys(catalogue.lessons), lessons.map(({ id }) => id), 'Lesson catalogue does not match source');
  let stages = 0;
  for (const lesson of lessons) {
    const record = catalogue.lessons[lesson.id];
    if (record.sourceLessonSha256 !== hash(lesson) || record.sourceSpanishSha256 !== hash(spanish.lessons[lesson.id])) fail(`Source changed: ${lesson.id}`);
    const text = record.text;
    checkKeys(Object.keys(text), [...lessonFields, 'pilotPhases', 'steps'], `Unexpected lesson fields: ${lesson.id}`);
    for (const field of lessonFields) if (typeof text[field] !== 'string' || (lesson[field] && !text[field].trim())) fail(`Missing lesson text: ${lesson.id}/${field}`);
    checkKeys(text.pilotPhases.map(({ id }) => id), lesson.pilotPhases.map(({ id }) => id), `Phases changed: ${lesson.id}`);
    if (text.pilotPhases.some((phase) => Object.keys(phase).sort().join(',') !== 'id,label' || !phase.label?.trim())) fail(`Invalid phase: ${lesson.id}`);
    checkKeys(Object.keys(text.steps), lesson.steps.map(({ id }) => id), `Stages changed: ${lesson.id}`);
    for (const step of lesson.steps) {
      const translated = text.steps[step.id];
      checkKeys(Object.keys(translated).sort(), [...stepFields].sort(), `Unexpected stage fields: ${lesson.id}/${step.id}`);
      if (stepFields.some((key) => typeof translated[key] !== 'string' || !translated[key].trim())) fail(`Missing stage text: ${lesson.id}/${step.id}`);
      stages++;
    }
  }
  if (ui.locale !== 'es-ES' || ui.status !== 'draft-awaiting-editorial-and-native-review' || ui.sourceDictionarySha256 !== hash(sourceUI) || ui.sourceFrenchDictionarySha256 !== hash(FRENCH_UI)) fail('UI source or identity changed');
  checkKeys(Object.keys(ui.strings).sort(), [...new Set([...Object.keys(sourceUI), ...Object.keys(FRENCH_UI)])].sort(), 'UI keys do not match source');
  if (Object.values(ui.strings).some((value) => typeof value !== 'string' || !value.trim())) fail('Missing UI text');
  if (pilot.locale !== 'es-ES' || pilot.lessonId !== 'cat' || pilot.status !== 'text-only-pilot-no-audio-generated' || pilot.voice.id !== 'BkOojM1ZhtSAHgsAkMx2' || !pilot.sample?.trim()) fail('Pilot identity invalid');
  const seen = new Set();
  for (const clip of pilot.clips) {
    const [lesson, step, kind, ...extra] = clip.key.split('/');
    if (extra.length || lesson !== 'cat' || !['instruction', 'hint'].includes(kind) || seen.has(clip.key) || clip.text !== catalogue.lessons.cat.text.steps[step]?.[kind === 'instruction' ? 'spoken' : 'hint']) fail(`Pilot clip does not match source: ${clip.key}`);
    seen.add(clip.key);
  }
  if (pilot.clips.length !== 12) fail('Pilot selection must contain twelve lesson clips');
  return { lessons: lessons.length, stages, narrationKeys: stages * 2, uiStrings: Object.keys(ui.strings).length, pilotClips: pilot.clips.length + 1 };
}

export function readSourceUI() {
  const file = readFileSync(new URL('../src/i18n.jsx', import.meta.url), 'utf8');
  const literal = file.match(/const SPANISH = (\{[\s\S]*?\n\});/)?.[1];
  if (!literal) fail('Spanish source dictionary missing');
  return vm.runInNewContext(`(${literal})`);
}
export function readDraft() {
  const read = (name) => JSON.parse(readFileSync(new URL(`../research/spanish-spain-draft/${name}`, import.meta.url), 'utf8'));
  return { catalogue: read('lessons.es-ES.json'), ui: read('ui.es-ES.json'), pilot: read('cat-pilot.es-ES.json'), sourceUI: readSourceUI() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(validateDraft(readDraft()), null, 2));
}
