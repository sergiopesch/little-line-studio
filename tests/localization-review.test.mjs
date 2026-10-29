import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../src/languages.js';
import { loadPilot, verifyPilot, renderPacket } from '../scripts/localization-review.mjs';
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
