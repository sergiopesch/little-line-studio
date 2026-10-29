import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LANGUAGES } from '../src/languages.js';
import { loadPilot, verifyPilot, renderPacket, writeReviewPackets, reviewForm, verifyReviewIdentity } from '../scripts/localization-review.mjs';
import evidence from '../research/localization-pilot/cat.json' with { type: 'json' };
import contexts from '../docs/localization/message-context.json' with { type: 'json' };

test('all selectable locales have a complete, current Cat text assessment and guide', async () => {
  assert.equal(evidence.lessonId, 'cat');
  assert.deepEqual(Object.keys(evidence.locales).sort(), LANGUAGES.map(l => l.id).sort());
  for (const { id } of LANGUAGES) {
    const packet = await loadPilot(id);
    const record = evidence.locales[id];
    verifyPilot(packet, record);
    assert.equal(packet.lesson.steps.length, 21, id);
    assert.equal(packet.clips.length, 42, id);
    assert.equal(new Set(packet.clips.map(c => c.key)).size, 42, id);
    const guide = readFileSync(new URL(`../docs/localization/${id}.md`, import.meta.url), 'utf8');
    assert.ok(guide.includes(id));
    assert.match(guide, /Native-speaker review and human listening remain pending/);
    const rendered = renderPacket(packet, record, contexts);
    for (const step of packet.lesson.steps) {
      for (const field of ['title', 'instruction', 'spoken', 'hint', 'notice']) assert.ok(rendered.includes(step[field]), `${id}: ${step.id}/${field}`);
    }
    for (const clip of packet.clips) assert.ok(rendered.includes(clip.sha256), `${id}: ${clip.key}`);
    assert.equal((rendered.match(/\[Listen:/g) ?? []).length, 42);
    for (const message of Object.keys(contexts)) assert.ok(rendered.includes(message));
  }
});

test('all released lesson packets retain separate reviews and preserve existing feedback', async t => {
  const output = mkdtempSync(path.join(tmpdir(), 'lls-review-packets-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const first = await writeReviewPackets({ output });
  assert.equal(first.packets, 270);
  assert.equal(first.recordingReferences, 13140);
  const catalogue = JSON.parse(readFileSync(path.join(first.output, 'catalogue.json')));
  for (const entry of catalogue.entries) {
    const content = readFileSync(path.join(first.output, entry.packet), 'utf8');
    assert.equal((content.match(/\[Listen:/g) ?? []).length, entry.recordings);
    assert.match(content, /Listen to the lesson music/);
    assert.match(content, /device locking/);
    assert.equal(entry.nativeReview, 'pending');
    assert.equal(entry.humanListening, 'pending');
    if (entry.lessonId !== 'cat') assert.equal(entry.assistantAssessment, 'not-recorded-in-this-workflow');
  }
  const feedback = path.join(first.output, 'nl-NL/cat.review.json');
  writeFileSync(feedback, 'Reviewer work in progress');
  const second = await writeReviewPackets({ output });
  assert.notEqual(first.output, second.output);
  assert.equal(readFileSync(feedback, 'utf8'), 'Reviewer work in progress');
});

test('review worksheets bind feedback to exact wording, recordings, controls and music', async () => {
  const packet = await loadPilot('de-DE');
  const form = reviewForm(packet);
  assert.equal(verifyReviewIdentity(packet, form), true);
  assert.ok(form.reviews.every(review => review.status === 'pending' && !review.reviewer));
  for (const field of ['locale', 'lessonId', 'identity']) {
    assert.throws(() => verifyReviewIdentity(packet, { ...form, [field]: null }), /Stale/);
  }
  const changed = structuredClone(packet);
  changed.music.sha256 = '0'.repeat(64);
  assert.throws(() => verifyReviewIdentity(changed, form), /Stale/);
  changed.music = packet.music;
  changed.lesson.steps[0].spoken += ' Changed.';
  assert.throws(() => verifyReviewIdentity(changed, form), /Stale/);
});

test('pilot evidence goes stale after source, localized wording or recording changes', async () => {
  const packet = await loadPilot('es-ES');
  const record = evidence.locales['es-ES'];
  for (const field of ['source', 'lesson', 'clips', 'messages']) {
    const changed = structuredClone(packet);
    if (field === 'clips') changed.clips[0].sha256 = '0'.repeat(64);
    else if (field === 'messages') changed.messages[0].local += ' Changed.';
    else changed[field].steps[0].spoken += ' Changed.';
    assert.throws(() => verifyPilot(changed, record), /Stale/, field);
  }
  const missing = structuredClone(record); missing.stageIds.pop();
  assert.throws(() => verifyPilot(packet, missing), /Stale stageIds/);
  const wrongLocale = { ...record, locale: 'es-419' };
  assert.throws(() => verifyPilot(packet, wrongLocale), /Missing text assessment/);
});

test('automated packet generation cannot promote pending human review or unanchored feedback', async () => {
  const packet = await loadPilot('nl-NL');
  const record = evidence.locales['nl-NL'];
  assert.throws(() => verifyPilot(packet, { ...record, nativeReview: 'approved' }), /separately recorded evidence/);
  assert.throws(() => verifyPilot(packet, { ...record, humanListening: 'approved' }), /separately recorded evidence/);
  assert.throws(() => verifyPilot(packet, { ...record, followUps: [{ stageId: 'missing', reason: 'test', proposal: 'test' }] }), /Unanchored/);
  await assert.rejects(loadPilot('constructor'), /Unknown locale/);
});
