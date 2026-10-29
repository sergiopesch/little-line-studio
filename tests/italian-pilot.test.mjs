import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LESSONS } from '../src/lesson-catalogue.js';
import { validatePilot, makePilotPlan } from '../scripts/italian-pilot.mjs';
const source = LESSONS.find(l => l.id === 'cat');
const draft = JSON.parse(readFileSync(new URL('../research/italian-pilot/cat.it-IT.json', import.meta.url), 'utf8'));

test('Italian Cat draft is source-linked and covers all phases and stages', () => {
  assert.equal(validatePilot(source, draft), true);
  assert.equal(Object.keys(draft.steps).length, 21);
  assert.throws(() => validatePilot({ ...source, title: 'Changed source' }, draft), /source changed/);
  const missing = structuredClone(draft); delete missing.steps['left-ear'].hint;
  assert.throws(() => validatePilot(source, missing), /Incomplete stage/);
  const mismatched = structuredClone(draft); mismatched.pilotPhases[0].id = 'different';
  assert.throws(() => validatePilot(source, mismatched), /Phase mismatch/);
});

test('Italian audition plan binds selected voice and exact current draft without generating audio', () => {
  const plan = makePilotPlan(source, draft);
  assert.equal(plan.voiceId, 'wOXFTxgu7FQDBb1dsL7I');
  assert.equal(plan.locale, 'it-IT');
  assert.equal(plan.status, 'draft-not-approved-for-generation');
  assert.equal(plan.clipCount, 13);
  assert.equal(plan.clips.filter(c => c.kind === 'hint').length, 2);
  assert.equal(new Set(plan.clips.map(c => c.key)).size, plan.clipCount);
  const changed = structuredClone(draft); changed.steps.notice.spoken += ' Un’altra frase.';
  assert.notEqual(makePilotPlan(source, changed).draftSha256, plan.draftSha256);
});

test('Italian UI draft covers the established static dictionary and dynamic placeholders', async () => {
  const ui = JSON.parse(readFileSync(new URL('../research/italian-pilot/ui.it-IT.json', import.meta.url), 'utf8'));
  const dynamic = JSON.parse(readFileSync(new URL('../research/italian-pilot/dynamic.it-IT.json', import.meta.url), 'utf8'));
  const { FRENCH_UI } = await import('../src/french-ui.fr-FR.js');
  const { FRENCH_DYNAMIC } = await import('../src/french-dynamic.fr-FR.js');
  assert.equal(ui.status, 'assistant-draft-awaiting-native-human-review');
  assert.deepEqual(Object.keys(ui.strings).sort(), Object.keys(FRENCH_UI).sort());
  for (const text of Object.values(ui.strings)) assert.ok(typeof text === 'string' && text.trim());
  for (const file of readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter(name => /\.[jt]sx?$/.test(name))) {
    const content = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    for (const match of content.matchAll(/\bt\(\s*"([^"\n]+)"\s*\)/g)) assert.ok(ui.strings[match[1]], `${file}: ${match[1]}`);
  }
  assert.deepEqual(Object.keys(dynamic.templates).sort(), Object.keys(FRENCH_DYNAMIC).sort());
  const parameters = { levelExplore: ['level', 'count'], catalogueRange: ['level', 'first', 'last', 'total'], drawTitle: ['title'],
    pageCount: ['page', 'total'], duration: ['minutes'], remaining: ['minutes'], together: ['elapsed'],
    preview: ['title'], boardColour: ['title'], boardReference: ['title'], boardAction: ['title', 'action'],
    stepColour: ['index', 'total'], stepDrawing: ['index', 'total'], stepGeneric: ['index', 'total'] };
  for (const [key, placeholders] of Object.entries(parameters)) {
    for (const placeholder of placeholders) assert.ok(dynamic.templates[key].includes(`{${placeholder}}`), `${key}: ${placeholder}`);
  }
});

test('Italian dynamic labels retain stage identities and time estimates', async () => {
  const { ITALIAN_DYNAMIC, stageLabel, demonstrationLabel, timelineEstimate } = await import('../research/italian-pilot/dynamic.it-IT.mjs');
  assert.match(ITALIAN_DYNAMIC.catalogueRange('Principiante', 1, 6, 10), /1 a 6 di 10/);
  assert.match(ITALIAN_DYNAMIC.duration(7), /7 minuti/);
  assert.match(ITALIAN_DYNAMIC.boardAction('Gatto', 3), /Gatto.*3/);
  assert.equal(stageLabel(source, 0), 'GUARDA');
  const firstColour = source.steps.findIndex(part => part.kind === 'colour');
  assert.match(stageLabel(source, firstColour), /COLORA 1 DI/);
  assert.match(demonstrationLabel({ ...source, title: 'Gatto' }, 0), /sul tuo foglio/);
  assert.equal(timelineEstimate({ estimateLabel: 'About 3 min left', remainingMs: 130000 }, () => 'incorrect'), 'Circa 3 min rimanenti');
  assert.equal(timelineEstimate({ estimateLabel: 'Paused · nothing moves ahead' }, () => 'In pausa'), 'In pausa');
  for (const lesson of LESSONS) for (let index = 0; index < lesson.steps.length; index++) {
    assert.ok(stageLabel(lesson, index), `${lesson.id}/${index}`);
    assert.ok(demonstrationLabel(lesson, index), `${lesson.id}/${index}`);
  }
});
