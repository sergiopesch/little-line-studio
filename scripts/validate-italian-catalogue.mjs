// Offline review inventory only. This module cannot enable a locale or produce audio.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LESSONS } from '../src/lesson-catalogue.js';
const lessonFields = ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel'];
const stepFields = ['title', 'instruction', 'spoken', 'hint', 'notice'];
const statuses = ['machine-translated-unreviewed', 'assistant-draft-awaiting-native-human-review', 'assistant-reviewed-awaiting-native-human-review'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error(message); };
export function validateRecord(source, record, { requireAssistantReview = false } = {}) {
  if (!record || record.locale !== 'it-IT' || record.lessonId !== source.id ||
      record.sourceLessonSha256 !== hash(source)) fail(`Identity or source/geometry hash mismatch: ${source.id}`);
  if (!statuses.includes(record.status) || (requireAssistantReview && record.status !== 'assistant-reviewed-awaiting-native-human-review'))
    fail(`Review status insufficient: ${source.id}`);
  if (record.level !== undefined && record.level !== source.level) fail(`Wrong level: ${source.id}`);
  for (const field of lessonFields) {
    if (typeof record[field] !== 'string' || (source[field] && !record[field].trim())) fail(`Missing lesson field: ${source.id}/${field}`);
  }
  if (!Array.isArray(record.pilotPhases) || record.pilotPhases.length !== source.pilotPhases.length ||
      record.pilotPhases.some((p, i) => p?.id !== source.pilotPhases[i].id || typeof p.label !== 'string' || !p.label.trim()))
    fail(`Phase mismatch: ${source.id}`);
  if (!record.steps || JSON.stringify(Object.keys(record.steps)) !== JSON.stringify(source.steps.map(s => s.id))) fail(`Stage mismatch: ${source.id}`);
  for (const step of source.steps) {
    const text = record.steps[step.id];
    if (!text || JSON.stringify(Object.keys(text).sort()) !== JSON.stringify([...stepFields].sort()) ||
        stepFields.some(field => typeof text[field] !== 'string' || !text[field].trim())) fail(`Incomplete stage: ${source.id}/${step.id}`);
  }
  return true;
}
export function validateCatalogue(sources, records, options = {}) {
  const ids = new Set();
  for (const record of records) {
    if (!record || ids.has(record.lessonId)) fail(`Duplicate or invalid lesson: ${record?.lessonId}`);
    ids.add(record.lessonId);
  }
  if (records.length !== sources.length || sources.some(s => !ids.has(s.id))) fail('Catalogue coverage mismatch');
  const byId = new Map(records.map(r => [r.lessonId, r]));
  for (const source of sources) validateRecord(source, byId.get(source.id), options);
  return { lessons: sources.length, stages: sources.reduce((n,s) => n + s.steps.length, 0),
    statuses: Object.fromEntries(statuses.map(status => [status, records.filter(r => r.status === status).length])) };
}
// Machine text is retained unchanged as evidence. Separate assistant-reviewed
// records override individual lessons only after their source identities pass.
export function loadCatalogue(sources = LESSONS) {
  const cat = JSON.parse(readFileSync(new URL('../research/italian-pilot/cat.it-IT.json', import.meta.url), 'utf8'));
  const machine = JSON.parse(readFileSync(new URL('../research/italian-draft/lessons.it-IT.json', import.meta.url), 'utf8'));
  if (machine.locale !== 'it-IT' || machine.status !== 'machine-translated-unreviewed' || !Array.isArray(machine.lessons)) fail('Invalid machine draft wrapper');
  const base = [cat, ...machine.lessons];
  validateCatalogue(sources, base);
  if (machine.lessons.some(record => record.status !== 'machine-translated-unreviewed')) fail('Machine draft status changed');
  const byId = new Map(sources.map(source => [source.id, source]));
  const reviewed = new Map();
  for (const level of ['basic', 'intermediate', 'expert']) {
    const dir = new URL(`../research/italian-reviewed/${level}/`, import.meta.url);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.it-IT.json')) fail(`Unexpected review file: ${file}`);
      const record = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
      const source = byId.get(record.lessonId);
      if (!source || source.id === 'cat' || source.level !== level || file !== `${source.id}.it-IT.json` || reviewed.has(source.id) ||
          record.status !== 'assistant-reviewed-awaiting-native-human-review') fail(`Invalid reviewed identity: ${file}`);
      validateRecord(source, record, { requireAssistantReview: true });
      reviewed.set(source.id, record);
    }
  }
  return base.map(record => reviewed.get(record.lessonId) ?? record);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--require-assistant-review') || args.length > 1) fail('Use no arguments or --require-assistant-review');
  console.log(JSON.stringify(validateCatalogue(LESSONS, loadCatalogue(), { requireAssistantReview: args.length > 0 })));
}
