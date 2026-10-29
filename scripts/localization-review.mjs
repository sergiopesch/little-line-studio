// Offline review packets from published text and assets. No provider requests.
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANGUAGES } from '../src/languages.js';
import { getLesson, narrationKey } from '../src/lesson-catalogue.js';
import { translate } from '../src/ui-translations.js';
import { UI_MESSAGE_SOURCES } from '../src/ui-message-sources.js';

const root = new URL('../', import.meta.url);
const readJSON = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textModules = {
  'es-419': '../src/spanish-lessons.js', 'es-ES': '../src/spanish-spain-lessons.js',
  'fr-FR': '../src/french-lessons.js', 'de-DE': '../src/german-lessons.js',
  'it-IT': '../src/italian-lessons.js', 'nl-NL': '../src/dutch-lessons.js',
};
const fail = message => { throw new Error(message); };

export async function loadPilot(locale) {
  if (!LANGUAGES.some(language => language.id === locale)) fail(`Unknown locale: ${locale}`);
  if (!Object.hasOwn(textModules, locale) && !['en-GB', 'en-IE', 'en-GB-x-scotland'].includes(locale))
    fail(`Missing text adapter: ${locale}`);
  const source = getLesson('cat');
  const lesson = Object.hasOwn(textModules, locale)
    ? (await import(textModules[locale])).localizeLesson(source, locale) : source;
  const suffix = locale === 'en-GB' ? '' : `.${locale}`;
  const index = readJSON(`src/narration-index${suffix}.json`);
  const durations = readJSON(`src/narration-durations${suffix}.json`);
  const manifest = readJSON(`src/narration-manifest${suffix}.json`);
  const clips = lesson.steps.flatMap((step, i) => ['instruction', 'hint'].map(kind => {
    const key = narrationKey(lesson, i, kind);
    const clip = manifest.clips[key];
    // The lesson-duration index may omit hints; their measured duration remains in the manifest.
    if (!clip || !/^\/narration\/clip-[a-f0-9]{64}\.mp3$/.test(clip.src) || index[key] !== clip.src ||
        clip.text !== (kind === 'instruction' ? step.spoken : step.hint) ||
        !Number.isFinite(clip.duration) || clip.duration <= 0 ||
        ((kind === 'instruction' || Object.hasOwn(durations, key)) && Math.round(clip.duration * 1000) !== durations[key]) ||
        typeof clip.voiceId !== 'string' || !clip.voiceId) fail(`Unmatched recording: ${locale}/${key}`);
    const bytes = readFileSync(new URL(`public${clip.src}`, root));
    if (bytes.length !== clip.bytes || createHash('sha256').update(bytes).digest('hex') !== clip.sha256)
      fail(`Changed recording: ${locale}/${key}`);
    return { key, src: clip.src, sha256: clip.sha256, bytes: clip.bytes, durationMs: Math.round(clip.duration * 1000), voiceId: clip.voiceId, text: clip.text };
  }));
  const messages = Object.entries(UI_MESSAGE_SOURCES).map(([id, source]) => ({ id, source, local: translate(locale, id) }));
  return { locale, source, lesson, clips, messages };
}

export function pilotIdentity({ source, lesson, clips, messages }) {
  return { sourceSha256: fingerprint(source), localizedSha256: fingerprint(lesson), audioSha256: fingerprint(clips), interfaceSha256: fingerprint(messages), stageIds: lesson.steps.map(step => step.id) };
}

export function verifyPilot(packet, record) {
  const identity = pilotIdentity(packet);
  if (!record || record.locale !== packet.locale || record.reviewType !== 'assistant-text-only') fail(`Missing text assessment: ${packet.locale}`);
  for (const [field, value] of Object.entries(identity)) {
    if (JSON.stringify(record[field]) !== JSON.stringify(value)) fail(`Stale ${field}: ${packet.locale}; inspect changed material before updating evidence`);
  }
  if (record.nativeReview !== 'pending' || record.humanListening !== 'pending') fail(`Human review needs separately recorded evidence: ${packet.locale}`);
  if (!record.assessment?.trim() || !Array.isArray(record.followUps)) fail(`Incomplete assessment: ${packet.locale}`);
  for (const note of record.followUps) {
    if (!identity.stageIds.includes(note.stageId) || !note.reason?.trim() || !note.proposal?.trim()) fail(`Unanchored follow-up: ${packet.locale}`);
  }
  return identity;
}

export function renderPacket(packet, record, contexts) {
  verifyPilot(packet, record);
  const { locale, source, lesson, clips } = packet;
  const lines = [`# Cat localization review — ${locale}`, '',
    'Assistant text assessment only. Native-speaker review and human listening: pending.', '',
    `Source fingerprint: ${record.sourceSha256}`, `Localized fingerprint: ${record.localizedSha256}`, `Audio fingerprint: ${record.audioSha256}`, `Interface fingerprint: ${record.interfaceSha256}`, '',
    '## Editorial assessment', '', record.assessment, '', '### Follow-ups (proposals, not published edits)', ''];
  for (const note of record.followUps) lines.push(`- **${note.stageId}:** ${note.reason} Proposal: ${note.proposal}`);
  lines.push('', '## Lesson context', '');
  for (const field of ['title', 'invitation', 'objective', 'parentNote', 'simplify', 'transfer', 'colouringLabel', 'pilotPhases']) {
    const format = value => typeof value === 'string' ? value : JSON.stringify(value);
    lines.push(`### ${field}`, '', `Source: ${format(source[field])}`, '', `Local: ${format(lesson[field])}`, '');
  }
  for (const [i, step] of lesson.steps.entries()) {
    lines.push(`## ${i + 1}. ${step.id}`, '', `Kind: ${step.kind}; optional: ${Boolean(step.canSkip)}; practice: ${step.quietMs ?? 0} ms.`, '');
    for (const field of ['title', 'instruction', 'spoken', 'hint', 'notice']) {
      lines.push(`**${field} — source:** ${source.steps[i][field]}`, '', `**${field} — local:** ${step[field]}`, '');
    }
    for (const clip of clips.filter(clip => clip.key.startsWith(`${lesson.id}/${step.id}/`))) {
      lines.push(`[Listen: ${clip.key}](https://little-line-studio.vercel.app${clip.src}) — ${clip.durationMs} ms; voice ${clip.voiceId}; SHA-256 ${clip.sha256}`, '');
    }
  }
  lines.push('## Interface message context', '');
  for (const { id, source: sourceText, local } of packet.messages) {
    const context = contexts[id];
    lines.push(`### ${id}`, '', `Source: ${sourceText}`, '', `Local: ${local}`, '',
      `Audience: ${context.audience}. ${context.intent} ${context.constraint}`, '');
  }
  lines.push('## Reviewer response', '',
    'Record locale, stage/message ID, current wording, proposed wording, reason, recording hash, reviewer role/name and date. Keep text review, pronunciation listening and in-app voice/music testing separate. A packet or changed fingerprint alone does not establish approval.', '');
  return lines.join('\n');
}

export async function writeReviewPackets() {
  const evidence = readJSON('research/localization-pilot/cat.json');
  const contexts = readJSON('docs/localization/message-context.json');
  if (fingerprint(Object.keys(evidence.locales).sort()) !== fingerprint(LANGUAGES.map(l => l.id).sort())) fail('Pilot locale coverage changed');
  // Validate every locale before replacing any packet.
  const packets = [];
  for (const { id } of LANGUAGES) {
    const packet = await loadPilot(id);
    packets.push([id, renderPacket(packet, evidence.locales[id], contexts)]);
  }
  const output = new URL('output/localization-review/', root);
  mkdirSync(output, { recursive: true });
  for (const [locale, content] of packets) writeFileSync(new URL(`${locale}.md`, output), content);
  writeFileSync(new URL('README.md', output), '# Cat review packets\n\nAssistant text assessment; native-speaker review and human listening pending.\n\n' + packets.map(([id]) => `- [${id}](${id}.md)`).join('\n') + '\n');
  return { locales: packets.length, stagesPerLocale: getLesson('cat').steps.length, output: fileURLToPath(output) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) fail('Usage: node scripts/localization-review.mjs');
  console.log(JSON.stringify(await writeReviewPackets(), null, 2));
}
