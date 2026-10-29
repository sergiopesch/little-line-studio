import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readDraft, validateDraft } from '../scripts/validate-spanish-spain-draft.mjs';
import { LESSONS } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import availability from '../src/narration-availability.es-ES.json' with { type: 'json' };
import { buildTextInventory } from '../scripts/plan-spanish-spain-offline.mjs';

test('Spain draft covers current teaching, UI and pilot and follows release availability', () => {
  assert.deepEqual(validateDraft(readDraft()), { lessons: 30, stages: 730, narrationKeys: 1460, uiStrings: 207, pilotClips: 13 });
  assert.equal(getLanguage('es-ES').ready, availability.lessons.length > 0);
});

test('draft checks reject stale sources, missing stages and mismatched pilot words', () => {
  const stale = readDraft();
  const changed = structuredClone(LESSONS); changed[0].steps[0].instruction += ' changed';
  assert.throws(() => validateDraft({ ...stale, lessons: changed }), /Source changed/);
  const missing = readDraft(); delete missing.catalogue.lessons.cat.text.steps.notice;
  assert.throws(() => validateDraft(missing), /Stages changed/);
  const pilot = readDraft(); pilot.pilot.clips[0].text += ' changed';
  assert.throws(() => validateDraft(pilot), /Pilot clip does not match/);
  const ui = readDraft(); delete ui.ui.strings[Object.keys(ui.ui.strings)[0]];
  assert.throws(() => validateDraft(ui), /UI keys/);
});

test('Spain dynamic copy preserves variable information', async () => {
  const { SPAIN_DYNAMIC: d } = await import('../research/spanish-spain-draft/dynamic.es-ES.js');
  assert.match(d.duration(7), /7 minutos/);
  assert.match(d.catalogueRange('Básico', 1, 6, 10), /1 al 6 de 10/);
  assert.match(d.boardAction('Gato', 3), /Gato.*3.*papel/);
  assert.equal(d.stepColour(2, 5), 'COLOREAR 2 DE 5');
});

test('Spain draft uses feminine agreement for wax crayons', () => {
  const { catalogue } = readDraft();
  const text = JSON.stringify(catalogue.lessons);
  assert.doesNotMatch(text, /\b(?:el|del|un|los|unos)\s+(?:solo\s+)?ceras?\b/i);
  assert.doesNotMatch(text, /\bcera\s+(?:más\s+)?(?:oscuro|claro)\b/i);
  assert.doesNotMatch(text, /\busad las ceras que tengan\b/i);
  assert.match(catalogue.lessons.ladybird.text.steps['colour-choice'].instruction, /una cera oscura/);
  assert.match(catalogue.lessons.cactus.text.steps['colour-choice'].hint, /una sola cera/);
});

test('offline text inventory covers the actual draft without authorizing generation', () => {
  const draft = readDraft();
  const plan = buildTextInventory(draft);
  assert.equal(plan.status, 'draft-not-approved-for-generation');
  assert.equal(plan.entries.length, 1461);
  assert.equal(new Set(plan.entries.map(({ key }) => key)).size, 1461);
  assert.equal(plan.entries.find(({ key }) => key === 'sun/notice/instruction').text,
    draft.catalogue.lessons.sun.text.steps.notice.spoken);
  assert.equal(plan.textInventorySha256, buildTextInventory(draft).textInventorySha256);
  const changed = structuredClone(draft);
  changed.catalogue.lessons.sun.text.steps.notice.spoken += ' Cambio.';
  assert.notEqual(plan.textInventorySha256, buildTextInventory(changed).textInventorySha256);
});

test('Spain copy preserves known source details and fixes regional agreement', () => {
  const { catalogue, ui } = readDraft();
  const all = JSON.stringify(catalogue.lessons);
  assert.doesNotMatch(all, /\b(?:se podéis|de el plátano|la plátano|una plátano|plátano amarilla)\b/i);
  assert.doesNotMatch(all, /\b(?:inventen|comiencen|traten|presenten|compárenla|pasto)\b/i);
  assert.match(catalogue.lessons.sun.text.steps.notice.hint, /Nunca mires directamente al Sol/);
  assert.match(catalogue.lessons.mushroom.text.parentNote, /no sirven para identificar setas comestibles/);
  assert.match(catalogue.lessons['fruit-bowl'].text.steps['banana-upper-edge'].spoken, /curva continua/);
  assert.match(catalogue.lessons.robot.text.steps['robot-antenna-tip'].hint, /cerca del extremo/);
  assert.match(ui.strings['Pick any level and a drawing that interests you.'], /os guste/);
});

test('Spain draft describes every stage and keeps dynamic progress in Spanish', async () => {
  const { demonstrationLabel, stageLabel, timelineEstimate } = await import('../research/spanish-spain-draft/dynamic.es-ES.js');
  const draft = readDraft();
  for (const original of LESSONS) {
    const lesson = { ...original, title: draft.catalogue.lessons[original.id].text.title };
    for (const [index, step] of lesson.steps.entries()) {
      assert.match(demonstrationLabel(lesson, index), /Dibuja en tu papel\./, `${lesson.id}/${step.id}`);
      assert.doesNotMatch(demonstrationLabel(lesson, index), /trazo 0\./, `${lesson.id}/${step.id}`);
      assert.ok(stageLabel(lesson, index), `${lesson.id}/${step.id}`);
    }
  }
  assert.equal(timelineEstimate({ estimateLabel: 'About 3 min left', remainingMs: 130000 }, () => 'bad'), 'Quedan unos 3 min');
  assert.equal(timelineEstimate({ estimateLabel: 'Paused · nothing moves ahead', remainingMs: 0 }, (s) => draft.ui.strings[s]), 'En pausa · nada avanza');
});

// This catches literal t() keys, while dynamic branches still need integration review.
test('Spain UI draft covers directly translated source labels', () => {
  const { ui } = readDraft();
  const keys = new Set();
  for (const file of readdirSync(new URL('../src', import.meta.url)).filter((name) => /\.(jsx|js)$/.test(name))) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")\s*\)/g)) keys.add(JSON.parse(match[1]));
  }
  assert.ok(keys.size >= 120);
  for (const key of keys) assert.ok(ui.strings[key]?.trim(), key);
});

test('Spain picker preserves its regional identity and follows release availability', async () => {
  const { SPAIN_LANGUAGE_DRAFT: language } = await import('../research/spanish-spain-draft/dynamic.es-ES.js');
  assert.deepEqual(language, { id: 'es-ES', name: 'Castellano', region: 'España', flag: '🇪🇸', ready: false });
  assert.deepEqual(getLanguage(language.id), { ...language, ready: availability.lessons.length > 0 });
});
