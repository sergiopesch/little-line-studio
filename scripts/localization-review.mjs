// Offline review packets from published text and assets. No provider requests.
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANGUAGES } from '../src/languages.js';
import { getLesson, narrationKey } from '../src/lesson-catalogue.js';
import { getLocale } from '../src/locale-registry.js';
import { releasedLessons } from '../src/narration-locales.js';
import { translate } from '../src/ui-translations.js';
import { UI_MESSAGE_SOURCES } from '../src/ui-message-sources.js';

const root = new URL('../', import.meta.url);
const readJSON = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error(message); };

export const loadPilot = locale => loadLessonReview(locale, 'cat');

export async function loadLessonReview(locale, lessonId, { metadata = new Map(), assets = new Map() } = {}) {
  const definition = getLocale(locale);
  if (!definition) fail(`Unknown locale: ${locale}`);
  const source = getLesson(lessonId);
  if (!source || !releasedLessons(locale).some(lesson => lesson.id === lessonId)) fail(`Unreleased lesson: ${locale}/${lessonId}`);
  const lesson = (await definition.loadText()).localizeLesson(source, locale);
  const suffix = definition.assetSuffix;
  const json = filename => {
    if (!metadata.has(filename)) metadata.set(filename, readJSON(filename));
    return metadata.get(filename);
  };
  const index = json(`src/narration-index${suffix}.json`);
  const durations = json(`src/narration-durations${suffix}.json`);
  const manifest = json(`src/narration-manifest${suffix}.json`);
  const checkAsset = clip => {
    if (!assets.has(clip.src)) {
      const bytes = readFileSync(new URL(`public${clip.src}`, root));
      assets.set(clip.src, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const actual = assets.get(clip.src);
    if (actual.bytes !== clip.bytes || actual.sha256 !== clip.sha256 || !clip.src.includes(clip.sha256))
      fail(`Changed recording: ${locale}/${clip.src}`);
  };
  const clips = lesson.steps.flatMap((step, i) => ['instruction', 'hint'].map(kind => {
    const key = narrationKey(lesson, i, kind);
    const clip = manifest.clips[key];
    // The lesson-duration index may omit hints; their measured duration remains in the manifest.
    if (!clip || !/^\/narration\/clip-[a-f0-9]{64}\.mp3$/.test(clip.src) || index[key] !== clip.src ||
        clip.text !== (kind === 'instruction' ? step.spoken : step.hint) ||
        !Number.isFinite(clip.duration) || clip.duration <= 0 ||
        ((kind === 'instruction' || Object.hasOwn(durations, key)) && Math.round(clip.duration * 1000) !== durations[key]) ||
        clip.voiceId !== definition.voiceId) fail(`Unmatched recording: ${locale}/${key}`);
    checkAsset(clip);
    return { key, src: clip.src, sha256: clip.sha256, bytes: clip.bytes, durationMs: Math.round(clip.duration * 1000), voiceId: clip.voiceId, text: clip.text };
  }));
  const messages = Object.entries(UI_MESSAGE_SOURCES).map(([id, source]) => ({ id, source, local: translate(locale, id) }));
  const musicClip = json('src/music-manifest.json').lessons[lesson.musicId];
  if (!musicClip || !/^\/music\/clip-[a-f0-9]{64}\.mp3$/.test(musicClip.src) ||
      json('src/lesson-music-index.json')[lesson.musicId] !== musicClip.src ||
      !Number.isFinite(musicClip.duration) || musicClip.duration <= 0) fail(`Unmatched music: ${lessonId}`);
  checkAsset(musicClip);
  const music = { src: musicClip.src, sha256: musicClip.sha256, bytes: musicClip.bytes, durationMs: Math.round(musicClip.duration * 1000) };
  return { locale, source, lesson, clips, messages, music };
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
  if (record) verifyPilot(packet, record);
  const identity = pilotIdentity(packet);
  const { locale, source, lesson, clips } = packet;
  const lines = [`# ${source.title} localization review — ${locale}`, '',
    'Native-speaker review and human listening: pending. This extraction does not approve wording, pronunciation or audio quality.', '',
    `Source fingerprint: ${identity.sourceSha256}`, `Localized fingerprint: ${identity.localizedSha256}`, `Audio fingerprint: ${identity.audioSha256}`, `Interface fingerprint: ${identity.interfaceSha256}`, '',
    '## Editorial assessment', '', record?.assessment ?? 'No new assistant assessment is recorded in this workflow. The source catalogue retains its existing editorial provenance.', '',
    '### Follow-ups (proposals, not published edits)', ''];
  for (const note of record?.followUps ?? []) lines.push(`- **${note.stageId}:** ${note.reason} Proposal: ${note.proposal}`);
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
  lines.push('## Music and in-app listening', '',
    `[Listen to the lesson music](https://little-line-studio.vercel.app${packet.music.src}) — ${packet.music.durationMs} ms; SHA-256 ${packet.music.sha256}`, '',
    'Audition the actual app as well as individual clips: instruction → quiet practice → Help → spoken hint → Stop hint → return; check music continuity and a comfortable voice/music balance. Then test Pause, resume, mute, tab hiding/device locking and a full music loop. Record the physical device, OS/browser, speaker/headphones and volume setting.', '',
    'Check keyboard navigation, visible focus, large text, reduced motion and a screen reader. With an adult and child, observe comprehension, optional details, time to draw and the freedom to stop. Do not record identifying child data.', '');
  lines.push('## Reviewer response', '',
    'Record locale, stage/message ID, current wording, proposed wording, reason, recording hash, reviewer role/name and date. Keep text review, pronunciation listening and in-app voice/music testing separate. A packet or changed fingerprint alone does not establish approval.', '');
  return lines.join('\n');
}

export function reviewForm(packet) {
  return { schemaVersion: 1, locale: packet.locale, lessonId: packet.lesson.id,
    identity: { ...pilotIdentity(packet), musicSha256: packet.music.sha256 },
    reviews: ['editorial', 'native-language', 'device-audio', 'accessibility', 'family'].map(type => ({
      type, status: 'pending', reviewer: '', date: '', deviceAndSetup: '', observations: '', issues: [],
    })) };
}

export function verifyReviewIdentity(packet, form) {
  if (form?.schemaVersion !== 1 || form.locale !== packet.locale || form.lessonId !== packet.lesson.id ||
      !isDeepStrictEqual(form.identity, reviewForm(packet).identity))
    fail('Stale or mismatched review form; review the changed text, recordings, music or controls again');
  // This checks identity only. It cannot certify a person's qualifications or listening.
  return true;
}

export async function writeReviewPackets({ output = fileURLToPath(new URL('output/localization-review/', root)) } = {}) {
  const evidence = readJSON('research/localization-pilot/cat.json');
  const contexts = readJSON('docs/localization/message-context.json');
  if (fingerprint(Object.keys(evidence.locales).sort()) !== fingerprint(LANGUAGES.map(l => l.id).sort())) fail('Pilot locale coverage changed');
  // Validate every locale before creating a new packet directory.
  const packets = [];
  const cache = { metadata: new Map(), assets: new Map() };
  for (const { id } of LANGUAGES) {
    for (const lesson of releasedLessons(id)) {
      const packet = await loadLessonReview(id, lesson.id, cache);
      const record = lesson.id === 'cat' ? evidence.locales[id] : null;
      packets.push({ packet, record, content: renderPacket(packet, record, contexts) });
    }
  }
  mkdirSync(output, { recursive: true });
  const destination = mkdtempSync(path.join(path.resolve(output), 'catalogue-'));
  const entries = [];
  for (const { packet, record, content } of packets) {
    const base = `${packet.locale}/${packet.lesson.id}`;
    mkdirSync(path.join(destination, packet.locale), { recursive: true });
    writeFileSync(path.join(destination, `${base}.md`), content);
    writeFileSync(path.join(destination, `${base}.review.json`), JSON.stringify(reviewForm(packet), null, 2) + '\n');
    entries.push({ locale: packet.locale, lessonId: packet.lesson.id, title: packet.lesson.title, level: packet.lesson.level,
      stages: packet.lesson.steps.length, recordings: packet.clips.length, packet: `${base}.md`, form: `${base}.review.json`,
      assistantAssessment: record ? 'recorded-cat-pilot' : 'not-recorded-in-this-workflow',
      nativeReview: 'pending', humanListening: 'pending', followUps: record?.followUps ?? [], identity: reviewForm(packet).identity });
  }
  writeFileSync(path.join(destination, 'catalogue.json'), JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n');
  writeFileSync(path.join(destination, 'README.md'), '# Complete catalogue review packets\n\nExtraction and asset checks only; native-speaker review and human listening remain pending. Review forms are identity-bound worksheets, not approval certificates. Preserve this directory when recording feedback; later runs create a separate directory.\n\n' +
    entries.map(e => `- [${e.locale} · ${e.level} · ${e.title}](${e.packet}) — [review form](${e.form})`).join('\n') + '\n');
  return { locales: LANGUAGES.length, packets: entries.length, recordingReferences: entries.reduce((n, e) => n + e.recordings, 0), output: destination };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { output: { type: 'string' } } });
  console.log(JSON.stringify(await writeReviewPackets(values), null, 2));
}
