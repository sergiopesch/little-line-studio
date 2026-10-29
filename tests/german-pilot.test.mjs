import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLesson } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { releasedLessons } from '../src/narration-locales.js';
import draft from '../research/german-draft/basic/cat.de-DE.mjs';
import { validateGermanPilot } from '../scripts/validate-german-pilot.mjs';
import SPANISH_UI from '../src/spanish-ui.es-419.json' with { type: 'json' };

const lesson = getLesson('cat');
const source = JSON.parse(readFileSync(new URL('../research/german-draft/basic/cat.de-DE.source.json', import.meta.url), 'utf8'));
test('German pilot matches every source stage and remains included in the demo catalogue', () => {
  const result = validateGermanPilot(lesson, draft, source);
  assert.equal(result.stages, lesson.steps.length);
  assert.equal(new Set(result.narrationKeys).size, lesson.steps.length * 2);
  assert.equal(getLanguage('de-DE').ready, true);
  assert.ok(releasedLessons('de-DE').some(item => item.id === 'cat'));
});
test('German pilot rejects source drift, stage omissions and unreviewed status changes', () => {
  assert.throws(() => validateGermanPilot({ ...lesson, title: 'Changed' }, draft, source), /source or geometry changed/);
  const missing = structuredClone(draft); delete missing.stages['round-head'];
  assert.throws(() => validateGermanPilot(lesson, missing, source), /stage order/);
  const empty = structuredClone(draft); empty.stages['round-head'].hint = '';
  assert.throws(() => validateGermanPilot(lesson, empty, source), /Missing stage text/);
  const status = structuredClone(draft); status.status = 'ready';
  assert.throws(() => validateGermanPilot(lesson, status, source), /review status/);
});

test('draft German UI covers the established source keys and preserves dynamic arguments', async () => {
  const { FRENCH_UI } = await import('../src/french-ui.fr-FR.js');
  const { FRENCH_DYNAMIC } = await import('../src/french-dynamic.fr-FR.js');
  const { GERMAN_DYNAMIC } = await import('../research/german-draft/dynamic.de-DE.js');
  const ui = JSON.parse(readFileSync(new URL('../research/german-draft/ui.de-DE.json', import.meta.url), 'utf8'));
  assert.equal(ui.locale, 'de-DE');
  assert.equal(ui.status, 'assistant-draft-awaiting-native-human-review');
  assert.deepEqual(Object.keys(ui.strings).sort(), Object.keys(FRENCH_UI).sort());
  const sourceKeys = Object.keys(SPANISH_UI);
  for (const key of sourceKeys) assert.ok(Object.hasOwn(ui.strings, key), key);
  for (const [key, value] of Object.entries(ui.strings)) assert.ok(typeof value === 'string' && value.trim(), key);
  assert.deepEqual(Object.keys(GERMAN_DYNAMIC).sort(), Object.keys(FRENCH_DYNAMIC).sort());
  assert.match(GERMAN_DYNAMIC.catalogueRange('Anfänger', 1, 6, 10), /1 bis 6 von 10/);
  assert.match(GERMAN_DYNAMIC.duration(7), /7 Minuten/);
  assert.match(GERMAN_DYNAMIC.boardAction('Katze', 3), /Katze.*3/);
  assert.match(GERMAN_DYNAMIC.stepColour(2, 5), /2 VON 5/);
  assert.ok(ui.strings[' and optional colours'].startsWith(' '));
});
