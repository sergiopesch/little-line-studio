import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateNarrationDerivatives } from '../scripts/validate-narration-derivatives.mjs';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

test('offline short-speech mastering preserves duration, controls loudness and rejects tampered sources', { skip: !ffmpegAvailable }, () => {
  const result = spawnSync('python3', ['tests/short_narration_mastering_test.py'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('build validation binds mastered speech to unchanged text, source bytes and measured bounds', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'short-speech-provenance-'));
  try {
    mkdirSync(path.join(root, 'narration'));
    const asset = (text) => {
      const data = Buffer.from(text), sha256 = createHash('sha256').update(data).digest('hex');
      const src = `/narration/clip-${sha256}.mp3`;
      writeFileSync(path.join(root, src.slice(1)), data);
      return { src, sha256, bytes: data.length };
    };
    const source = { ...asset('original fixture'), provenance: 'verified-api-response', provider: 'ElevenLabs',
      model: 'eleven_v4', voiceId: 'voice', cacheKey: 'a'.repeat(64), text: 'A quiet hint.',
      generationSettings: { model_id: 'eleven_v4' }, duration: 2,
      encoding: { rate: 44100, channels: 1, bitrate: '128k', filter: 'loudnorm=I=-20:TP=-2:LRA=7' } };
    const graph = 'apad=whole_dur=4,loudnorm=I=-20.000:TP=-2.5:LRA=7,aresample=44100,atrim=end_sample=88200';
    const clip = { ...source, ...asset('mastered fixture'), provenance: 'verified-local-derivative', source,
      encoding: { ...source.encoding, filter: graph }, processing: {
        sourceSha256: source.sha256, rawSourceSha256: 'b'.repeat(64), ffmpegVersion: 'ffmpeg test fixture',
        recipe: { name: 'short-speech-loudness', version: 1 }, decodedSamples: 88200,
        filterGraph: graph, passes: [{ targetLufs: -20 }], before: { integratedLufs: -26 },
        decodedVerification: { integratedLufs: -20.2, truePeakDbtp: -2.8 },
      } };
    clip.processing.processingKey = createHash('sha256').update(JSON.stringify({
      ffmpegVersion: clip.processing.ffmpegVersion, filterGraph: graph, rawSourceSha256: 'b'.repeat(64),
      recipe: { name: 'short-speech-loudness', version: 1 }, sourceSha256: source.sha256,
    })).digest('hex');
    const validate = (value) => validateNarrationDerivatives({ clips: { hint: value } }, root);
    assert.doesNotThrow(() => validate(clip));
    assert.throws(() => validate({ ...clip, text: 'Changed words.' }), /Invalid local/);
    assert.throws(() => validate({ ...clip, duration: 1.7 }), /Invalid local/);
    const tooLoud = structuredClone(clip); tooLoud.processing.decodedVerification.truePeakDbtp = 0;
    assert.throws(() => validate(tooLoud), /Invalid local/);
    const tooQuiet = structuredClone(clip); tooQuiet.processing.decodedVerification.integratedLufs = -26;
    assert.throws(() => validate(tooQuiet), /Invalid local/);
    const wrongProcess = structuredClone(clip); wrongProcess.processing.processingKey = 'c'.repeat(64);
    assert.throws(() => validate(wrongProcess), /Invalid local/);
    writeFileSync(path.join(root, source.src.slice(1)), 'altered original');
    assert.throws(() => validate(clip), /Invalid local/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
