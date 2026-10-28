import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Scottish narration offline planning and verification', () => {
  const result = spawnSync('python3', ['tests/scotland_narration_test.py'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
