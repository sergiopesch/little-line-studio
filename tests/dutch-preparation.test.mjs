import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS } from '../src/lesson-catalogue.js';
import { getLanguage } from '../src/languages.js';
import { DUTCH_DYNAMIC } from '../research/dutch-draft/dynamic.nl-NL.js';
import { inspectDraft, validateLesson, validateUI } from '../scripts/verify-dutch-draft.mjs';

const lesson = LESSONS.find(({ id }) => id === 'cat');
const record = JSON.parse(readFileSync(new URL('../research/dutch-draft/basic/cat.nl-NL.json', import.meta.url)));
const ui = JSON.parse(readFileSync(new URL('../research/dutch-draft/ui.nl-NL.json', import.meta.url)));

test('Dutch stays unavailable and completeness is checked against the whole catalogue', () => {
  const result = inspectDraft();
  assert.equal(getLanguage('nl-NL').ready, false);
  assert.equal(result.lessons + result.missing.length, LESSONS.length);
  assert.equal(result.narrationKeys, result.stages * 2);
  assert.ok(result.lessons >= 10);
  if (result.missing.length) assert.throws(() => inspectDraft({ complete: true }), /incomplete/);
  else assert.equal(inspectDraft({ complete: true }).lessons, LESSONS.length);
});
test('pilot validates source, stage order and every localized field', () => {
  assert.equal(Object.keys(validateLesson(record, lesson)).length, lesson.steps.length * 2);
  const wrongSource = structuredClone(record); wrongSource.sourceLessonSha256 = '0'.repeat(64);
  assert.throws(() => validateLesson(wrongSource, lesson), /Source or geometry/);
  const changedLesson = structuredClone(lesson); changedLesson.strokes[0].points[0].x += 1;
  assert.throws(() => validateLesson(record, changedLesson), /Source or geometry/);
  const missingStage = structuredClone(record); delete missingStage.stages[lesson.steps[0].id];
  assert.throws(() => validateLesson(missingStage, lesson), /Stage mismatch/);
  const missingHint = structuredClone(record); missingHint.stages[lesson.steps[0].id].hint = '';
  assert.throws(() => validateLesson(missingHint, lesson), /Incomplete stage/);
});
test('Dutch UI draft covers the source keys and preserves variable content', () => {
  validateUI(ui);
  const incomplete = structuredClone(ui); delete incomplete.strings['Pause'];
  assert.throws(() => validateUI(incomplete), /incomplete/);
  assert.match(DUTCH_DYNAMIC.catalogueRange('Beginner', 1, 6), /1 tot en met 6 van 10/);
  assert.match(DUTCH_DYNAMIC.boardAction('Kat', 3), /Kat.*3/);
  assert.match(DUTCH_DYNAMIC.stepColour(2, 5), /2 VAN 5/);
  assert.match(DUTCH_DYNAMIC.duration(7), /7 minuten/);
});

test('Dutch source covers static translation call sites and accessibility helpers', async () => {
  const { readdirSync } = await import('node:fs');
  for (const filename of readdirSync('src').filter((name) => /\.(js|jsx)$/.test(name))) {
    const source = readFileSync(`src/${filename}`, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/g)) {
      const key = JSON.parse(match[1]);
      assert.ok(typeof ui.strings[key] === 'string' && ui.strings[key].trim(), `${filename}: ${key}`);
    }
  }
  const { demonstrationLabel, stageLabel, timelineEstimate } = await import('../research/dutch-draft/dynamic.nl-NL.js');
  assert.match(demonstrationLabel(lesson, 0), /papier/);
  assert.equal(stageLabel(lesson, 0), 'KIJKEN');
  const colourIndex = lesson.steps.findIndex(({ kind }) => kind === 'colour');
  assert.match(stageLabel(lesson, colourIndex), /KLEUREN 1 VAN/);
  assert.equal(timelineEstimate({ estimateLabel: 'About 3 min left', remainingMs: 130000 }, () => 'bad'), 'Nog ongeveer 3 min');
  assert.equal(timelineEstimate({ estimateLabel: 'Paused · nothing moves ahead', remainingMs: 0 }, (s) => ui.strings[s]), 'Gepauzeerd · er gaat niets verder');
});

test('Sun draft preserves the explicit real-sun safety warning and optional features', () => {
  const sun = LESSONS.find(({ id }) => id === 'sun');
  const draft = JSON.parse(readFileSync(new URL('../research/dutch-draft/basic/sun.nl-NL.json', import.meta.url)));
  assert.equal(Object.keys(validateLesson(draft, sun)).length, sun.steps.length * 2);
  assert.match(draft.stages.notice.hint, /Kijk nooit rechtstreeks naar de echte zon/);
  assert.match(draft.stages['sun-left-eye'].spoken, /echte zon heeft geen gezicht/);
  for (const id of ['lower-left-ray', 'lower-right-ray', 'sun-left-eye', 'sun-right-eye', 'sun-smile'])
    assert.match(`${draft.stages[id].instruction} ${draft.stages[id].spoken} ${draft.stages[id].hint}`, /mag|als je wilt|keuze/);
});

test('Rainbow draft preserves open colour choice and optional detail', () => {
  const rainbow = LESSONS.find(({ id }) => id === 'rainbow');
  const draft = JSON.parse(readFileSync(new URL('../research/dutch-draft/basic/rainbow.nl-NL.json', import.meta.url)));
  assert.equal(Object.keys(validateLesson(draft, rainbow)).length, rainbow.steps.length * 2);
  assert.match(draft.parentNote, /niet nodig/);
  assert.match(draft.stages['colour-choice'].spoken, /minder kleuren/);
  assert.match(draft.stages['right-cloud'].spoken, /laat deze wolk weg/);
});

test('Balloon draft retains optional bow, pattern and independent colour choice', () => {
  const balloon = LESSONS.find(({ id }) => id === 'balloon');
  const draft = JSON.parse(readFileSync(new URL('../research/dutch-draft/basic/balloon.nl-NL.json', import.meta.url)));
  assert.equal(Object.keys(validateLesson(draft, balloon)).length, balloon.steps.length * 2);
  assert.match(draft.stages['left-bow-loop'].spoken, /kiest/);
  assert.match(draft.stages['upper-dot'].spoken, /weglaten/);
  assert.match(draft.stages['colour-bow'].spoken, /overslaan/);
  assert.match(draft.parentNote, /geen deadline/);
});

test('Flower draft keeps optional petals and independent drawing choices', () => {
  const flower = LESSONS.find(({ id }) => id === 'flower');
  const draft = JSON.parse(readFileSync(new URL('../research/dutch-draft/basic/flower.nl-NL.json', import.meta.url)));
  assert.equal(Object.keys(validateLesson(draft, flower)).length, flower.steps.length * 2);
  assert.match(draft.stages['upper-right-petal'].spoken, /openlaten/);
  assert.match(draft.stages['lower-left-petal'].instruction, /sla het over/);
  assert.match(draft.parentNote, /niet op symmetrie/);
});

test('Apple draft allows an oval, optional leaf and independent colours', () => {
  const apple = LESSONS.find(({ id }) => id === 'apple');
  const draft = JSON.parse(readFileSync(new URL('../research/dutch-draft/basic/apple.nl-NL.json', import.meta.url)));
  assert.equal(Object.keys(validateLesson(draft, apple)).length, apple.steps.length * 2);
  assert.match(draft.parentNote, /eenvoudiger ovaal/);
  assert.match(draft.stages['leaf-vein'].spoken, /laat je dit detail weg/);
  assert.match(draft.stages['colour-apple-leaf'].hint, /overslaan/);
});

test('Basic drafts preserve safety, optionality and shape relationships', () => {
  const load = (id) => JSON.parse(readFileSync(new URL(`../research/dutch-draft/basic/${id}.nl-NL.json`, import.meta.url)));
  for (const id of ['fish', 'ladybird', 'ice-cream', 'mushroom']) {
    const source = LESSONS.find((item) => item.id === id);
    assert.equal(Object.keys(validateLesson(load(id), source)).length, source.steps.length * 2);
  }
  assert.match(load('mushroom').parentNote, /geen manier om eetbare paddenstoelen te herkennen/);
  assert.match(load('ice-cream').parentNote, /doorlopende V is één beweging/);
  assert.match(load('fish').stages['upper-fin'].instruction, /als je wilt/);
  assert.match(load('ladybird').parentNote, /geen fouten/);
});

test('all thirty Dutch lessons export exactly the source-linked text without changing geometry', async () => {
  const { exportDutchDraft } = await import('../scripts/export-dutch-draft.mjs');
  const runtime = JSON.parse(readFileSync(new URL('../src/dutch-lessons.nl-NL.json', import.meta.url)));
  const exported = exportDutchDraft();
  assert.deepEqual(runtime, exported);
  assert.equal(Object.keys(runtime.lessons).length, 30);
  assert.equal(inspectDraft({ complete: true }).stages, 730);
  const { localizeLesson, localizedLessonTitle } = await import('../src/dutch-lessons.js');
  for (const source of LESSONS) {
    const localized = localizeLesson(source, 'nl-NL');
    assert.equal(localized.strokes, source.strokes);
    assert.deepEqual(localized.steps.map(({ id }) => id), source.steps.map(({ id }) => id));
    assert.equal(localizedLessonTitle(source, 'nl-NL'), runtime.lessons[source.id].title);
    assert.equal(localizeLesson(source, 'en-GB'), source);
  }
  assert.throws(() => localizeLesson(lesson, 'nl-NL', { locale: 'nl-NL', reviewStatus: 'assistant-draft-awaiting-native-human-review', lessons: {} }), /does not match/);
  const missing = structuredClone(runtime); delete missing.lessons.cat.steps.notice.hint;
  assert.throws(() => localizeLesson(lesson, 'nl-NL', missing), /missing teaching text/);
});

test('Dutch text inventory is complete, deterministic, and cannot authorize generation', async () => {
  const { cataloguePlan } = await import('../scripts/plan-dutch-catalogue.mjs');
  const first = cataloguePlan(), second = cataloguePlan();
  assert.deepEqual(first, second);
  assert.equal(first.keyCount, 1461);
  assert.equal(first.status, 'text-review-only');
  assert.equal(first.providerPermission, 'pending');
  assert.equal(first.productionPlanApproval, 'pending');
  assert.equal(first.budgetApproval, 'pending');
  assert.equal(first.voice.id, 'DiUBVrSFwkMaPz4XqWvR');
  assert.equal(first.voice.selection, 'voice-library-preview');
  assert.match(first.textPlanSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.entries['cat/notice/instruction'], record.stages.notice.spoken);
});

test('geometry-specific Dutch wording and safety remain explicit', () => {
  const load = (level, id) => JSON.parse(readFileSync(new URL(`../research/dutch-draft/${level}/${id}.nl-NL.json`, import.meta.url)));
  assert.match(load('intermediate', 'robot').stages['robot-antenna-tip'].hint, /vlak bij/);
  assert.match(load('expert', 'fruit-bowl').stages['banana-upper-edge'].spoken, /één lange boog/);
  assert.match(load('expert', 'fruit-bowl').stages['banana-lower-edge'].spoken, /til op/);
  assert.match(load('intermediate', 'sailboat').stages['boat-sun'].spoken, /niet naar de echte zon/);
  assert.match(load('expert', 'tree-path').stages['landscape-sun'].spoken, /nooit de echte zon/);
  assert.match(load('intermediate', 'cactus').stages['cactus-left-spine'].spoken, /geen echte plant aan te raken/);
  const robot = LESSONS.find(({ id }) => id === 'robot');
  const antenna = robot.strokes.find(({ id }) => id === 'robot-antenna').points.at(-1);
  const tip = robot.strokes.find(({ id }) => id === 'robot-antenna-tip').points;
  const distance = Math.min(...tip.map(({ x, y }) => Math.hypot(x - antenna.x, y - antenna.y)));
  assert.ok(distance > 0.5 && distance < 1.5);
  const bowl = LESSONS.find(({ id }) => id === 'fruit-bowl');
  assert.equal(bowl.strokes.find(({ id }) => id === 'banana-upper-edge').parts, undefined);
  assert.equal(bowl.strokes.find(({ id }) => id === 'banana-lower-edge').parts.length, 2);
});

test('representative pilot uses only current Cat text and remains a review plan', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/plan-dutch-pilot.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const pilot = JSON.parse(result.stdout);
  const source = inspectDraft({ complete: true }).texts;
  assert.equal(pilot.clips.length, 14);
  assert.equal(pilot.voice.id, 'DiUBVrSFwkMaPz4XqWvR');
  assert.equal(pilot.voice.selection, 'voice-library-preview');
  assert.equal(pilot.providerPermission, 'pending');
  assert.equal(pilot.generatedAudioListening, 'not-started');
  for (const clip of pilot.clips) assert.equal(clip.text, source[clip.key]);
});
