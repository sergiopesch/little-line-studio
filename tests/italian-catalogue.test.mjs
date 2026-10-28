import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS } from '../src/lesson-catalogue.js';
import { validateCatalogue, validateRecord, loadCatalogue } from '../scripts/validate-italian-catalogue.mjs';
const machine = JSON.parse(readFileSync(new URL('../research/italian-draft/lessons.it-IT.json', import.meta.url), 'utf8'));
const records = loadCatalogue();

test('Italian inventory is source-linked across all 30 lessons and 730 stages', () => {
  assert.equal(machine.status, 'machine-translated-unreviewed');
  assert.deepEqual(validateCatalogue(LESSONS, records), { lessons: 30, stages: 730, statuses: {
    'machine-translated-unreviewed': 0, 'assistant-draft-awaiting-native-human-review': 0,
    'assistant-reviewed-awaiting-native-human-review': 30 } });
  assert.deepEqual(validateCatalogue(LESSONS, records, { requireAssistantReview: true }).lessons, 30);
  const unreviewed = structuredClone(records); unreviewed[0].status = 'machine-translated-unreviewed';
  assert.throws(() => validateCatalogue(LESSONS, unreviewed, { requireAssistantReview: true }), /Review status insufficient/);
});

test('coverage and each record reject source drift, missing text and reordered stages', () => {
  assert.throws(() => validateCatalogue(LESSONS, records.slice(1)), /coverage mismatch/);
  assert.throws(() => validateCatalogue(LESSONS, [...records.slice(0,-1), records[0]]), /Duplicate/);
  for (const source of LESSONS) {
    const record = structuredClone(records.find(r => r.lessonId === source.id));
    assert.throws(() => validateRecord({ ...source, strokes: [...source.strokes, { id: 'change' }] }, record), /hash mismatch/);
    delete record.steps[source.steps[0].id].hint;
    assert.throws(() => validateRecord(source, record), /Incomplete stage/);
  }
});

test('reviewed safety-critical guidance preserves the source constraints', () => {
  const byId = new Map(records.map(record => [record.lessonId, record]));
  assert.match(byId.get('fruit-bowl').steps['banana-upper-edge'].spoken, /curva continua/);
  assert.match(byId.get('robot').steps['robot-antenna-tip'].instruction, /vicino all’estremità/);
  assert.match(byId.get('house').parentNote, /casa immaginaria.*non c’è bisogno.*vera casa/);
  assert.match(byId.get('cactus').steps['cactus-left-spine'].spoken, /non abbiamo bisogno di toccare una pianta vera/);
  assert.match(byId.get('cup').steps['first-steam'].spoken, /non abbiamo bisogno di una bevanda calda vera/);
  assert.match(byId.get('tree-path').steps['landscape-sun'].spoken, /mai il Sole vero/);
  assert.match(byId.get('owl').parentNote, /ciuffi di piume, non orecchie/);
  assert.match(byId.get('sailboat').steps['boat-sun'].spoken, /non guardiamo il Sole vero/);
  assert.match(byId.get('sun').steps.notice.hint, /Non guardare mai direttamente il Sole vero/);
  assert.match(byId.get('sun').steps['sun-left-eye'].spoken, /Sole vero non ha un viso/);
  assert.match(byId.get('mushroom').parentNote, /non una guida per riconoscere funghi commestibili/);
  assert.match(byId.get('ladybird').parentNote, /senza trasformare.*prova di conteggio/);
  assert.match(byId.get('ice-cream').parentNote, /V è un unico movimento continuo/);
});
