// Export authored text and a hash of each complete lesson, including geometry.
// This does not contact translation or generation services.
import { createHash } from 'node:crypto';
import { LESSONS } from '../src/lesson-catalogue.js';
const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const pick = (obj, fields) => Object.fromEntries(fields.map(k => [k, obj[k] ?? '']));
const records = LESSONS.map(lesson => ({
  locale: 'it-IT', lessonId: lesson.id, level: lesson.level,
  sourceLessonSha256: createHash('sha256').update(JSON.stringify(lesson)).digest('hex'),
  ...pick(lesson, lessonFields), pilotPhases: lesson.pilotPhases.map(({ id, label }) => ({ id, label })),
  steps: Object.fromEntries(lesson.steps.map(s => [s.id, pick(s, stepFields)])),
}));
process.stdout.write(JSON.stringify(records));
