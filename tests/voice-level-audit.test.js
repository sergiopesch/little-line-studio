import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('voice audit flags silence, deduplicates clips, and rejects corrupt audio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-level-audit-'));
  try {
    const assets = join(dir, 'assets', 'narration');
    mkdirSync(assets, { recursive: true });
    const makeClip = (filter) => {
      const temporary = join(dir, `${Math.random()}.mp3`);
      execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', filter,
        '-t', '0.2', '-ac', '1', '-ar', '44100', '-y', temporary]);
      const bytes = readFileSync(temporary);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const src = `/narration/clip-${sha256}.mp3`;
      writeFileSync(join(assets, `clip-${sha256}.mp3`), bytes);
      return { src, sha256, bytes: bytes.length };
    };
    const tone = makeClip('sine=frequency=440');
    const silence = makeClip('anullsrc=channel_layout=mono:sample_rate=44100');
    writeFileSync(join(dir, 'narration-manifest.json'), JSON.stringify({ clips: { tone, reused: tone, silence } }));
    const audit = () => spawnSync('python3', ['scripts/audit-voice-levels.py', dir], { encoding: 'utf8' });
    const result = audit();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.assets, 2);
    assert.equal(report.narrationKeys, 3);
    assert.deepEqual(report.possibleSilence[0].keys, ['silence']);
    assert.equal(report.sampleAtOrAboveFullScale.length, 0);
    writeFileSync(join(assets, `clip-${tone.sha256}.mp3`), Buffer.alloc(tone.bytes));
    assert.notEqual(audit().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
