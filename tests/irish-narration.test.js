import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Irish narration offline source, identity and fail-closed validation contracts', () => {
  const result = spawnSync('python3', ['tests/irish-narration-test.py'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
