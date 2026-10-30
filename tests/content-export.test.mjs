import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { LESSONS } from '../src/lesson-catalogue.js';
import dutch from '../src/dutch-lessons.nl-NL.json' with { type: 'json' };
import { compileCatalogue, regionalExport } from '../scripts/localization/export.ts';
import { writeExportFiles } from '../scripts/localization/write.ts';

const repository = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'trazolino-export-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['src', 'scripts', 'research', 'package.json']) cpSync(path.join(repository, name), path.join(root, name), { recursive: true });
  return root;
}
function run(root, script, ...args) {
  return spawnSync(process.execPath, [`scripts/export-${script}.mjs`, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

test('a malformed German UI cannot write any German or Italian output', (t) => {
  const root = fixture(t);
  const outputs = ['german-lessons.de-DE.json', 'german-ui.de-DE.json', 'narration-sample.de-DE.txt',
    'italian-lessons.it-IT.json', 'italian-ui.it-IT.json', 'narration-sample.it-IT.txt'];
  const before = outputs.map(name => readFileSync(path.join(root, 'src', name)));
  const file = path.join(root, 'research/german-draft/ui.de-DE.json');
  const ui = JSON.parse(readFileSync(file, 'utf8'));
  ui.strings[Object.keys(ui.strings)[0]] = 42;
  writeFileSync(file, JSON.stringify(ui));
  const result = run(root, 'german-italian', '--write');
  assert.notEqual(result.status, 0, 'Malformed UI text must reject the export');
  assert.match(result.stderr, /de-DE\/UI.*missing text/);
  assert.equal(result.stdout, '');
  for (const [i, name] of outputs.entries()) assert.deepEqual(readFileSync(path.join(root, 'src', name)), before[i], name);
});

test('all six locale write paths preserve every committed catalogue, UI and sample byte', (t) => {
  const root = fixture(t);
  const names = readdirSync(path.join(root, 'src')).filter(name => /(?:-lessons\.[\w-]+\.json|-ui\.[\w-]+\.json|^narration-sample\..*\.txt)$/.test(name));
  const before = new Map(names.map(name => [name, readFileSync(path.join(root, 'src', name))]));
  for (const [script, flag] of [['reviewed-spanish', '--write-catalogue'], ['reviewed-french', '--write-catalogue'],
    ['spain-lessons', '--write'], ['german-italian', '--write'], ['dutch-draft', '--write-catalogue']]) {
    const result = run(root, script, flag);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }
  for (const [name, bytes] of before) assert.deepEqual(readFileSync(path.join(root, 'src', name)), bytes, name);
  assert.equal(readdirSync(path.join(root, 'src')).some(name => name.endsWith('.tmp')), false);
});

test('a stale late French source rejects the export before replacing the runtime catalogue', (t) => {
  const root = fixture(t), lesson = LESSONS.at(-1);
  const destination = path.join(root, 'src/french-lessons.fr-FR.json'), before = readFileSync(destination);
  const file = path.join(root, `research/french-reviewed/${lesson.level}/${lesson.id}.fr-FR.json`);
  const data = JSON.parse(readFileSync(file, 'utf8')); data.sourceLessonSha256 = '0'.repeat(64);
  writeFileSync(file, JSON.stringify(data));
  const result = run(root, 'reviewed-french', '--write-catalogue');
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(`English lesson or geometry changed: ${lesson.id}`));
  assert.equal(result.stdout, '');
  assert.deepEqual(readFileSync(destination), before);
});

const draft = () => ({ ...dutch, lessons: { cat: structuredClone(dutch.lessons.cat) } });
const source = [LESSONS.find(lesson => lesson.id === 'cat')];
const compile = input => compileCatalogue(input, 'nl-NL', 'assistant-draft-awaiting-native-human-review', source);

test('the export compiler rejects missing coverage, stage changes and non-text authority', () => {
  const mutations = [
    data => { data.locale = 'de-DE'; },
    data => { data.reviewStatus = 'approved'; },
    data => { delete data.lessons.cat; },
    data => { data.lessons.extra = structuredClone(data.lessons.cat); },
    data => { delete data.lessons.cat.steps.notice; },
    data => { data.lessons.cat.steps = Object.fromEntries(Object.entries(data.lessons.cat.steps).reverse()); },
    data => { data.lessons.cat.musicId = 'different'; },
    data => { data.lessons.cat.steps.notice.quietMs = 0; },
    data => { data.lessons.cat.steps.notice.spoken = () => 'Untrusted'; },
    data => { data.lessons.cat.pilotPhases[0].id = 'assessment'; },
    data => { data.lessons.cat.pilotPhases[0].timing = 0; },
  ];
  for (const mutate of mutations) {
    const data = draft(); mutate(data);
    assert.throws(() => compile(data));
  }
  assert.throws(() => compileCatalogue(draft(), 'nl-NL', 'approved', source), /pending review status/);
});

test('exported wording is owned immutable text and retains local sentences and review provenance', () => {
  const input = draft(), output = compile(input);
  assert.deepEqual(output, input);
  input.lessons.cat.steps.notice.spoken = 'Changed after validation';
  assert.equal(output.lessons.cat.steps.notice.spoken, dutch.lessons.cat.steps.notice.spoken);
  assert.throws(() => { output.lessons.cat.steps.notice.spoken = 'Mutation'; }, TypeError);
  assert.equal(output.reviewStatus, dutch.reviewStatus);
});

test('regional output rejects malformed UI and sample text before serialization', () => {
  const catalogue = compile(draft());
  for (const invalid of [{ strings: {}, sample: 'Hello' }, { strings: { Begin: 42 }, sample: 'Hello' },
    { strings: { Begin: ' ' }, sample: 'Hello' }, { strings: { Begin: 'Start' }, sample: null }])
    assert.throws(() => regionalExport(catalogue, invalid), /UI|sample/);
});

test('a staging failure leaves all existing outputs intact and removes owned temporary files', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'trazolino-staging-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'catalogue.json'); writeFileSync(destination, 'original');
  assert.throws(() => writeExportFiles([
    { destination: pathToFileURL(destination), contents: 'replacement' },
    { destination: pathToFileURL(path.join(root, 'missing/ui.json')), contents: 'replacement' },
  ]), { code: 'ENOENT' });
  assert.equal(readFileSync(destination, 'utf8'), 'original');
  assert.deepEqual(readdirSync(root), ['catalogue.json']);
});

test('duplicate destinations and unserialized content fail before opening any output', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'trazolino-write-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const destination = pathToFileURL(path.join(root, 'catalogue.json'));
  assert.throws(() => writeExportFiles([{ destination, contents: '{}' }, { destination, contents: '{}' }]), /Duplicate/);
  assert.throws(() => writeExportFiles([{ destination, contents: '{}' },
    { destination: pathToFileURL(path.join(root, 'ui.json')), contents: {} }]), /serialized text/);
  assert.deepEqual(readdirSync(root), []);
});
