import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('French staging validates an offline audio and receipt fixture without provider access', () => {
  const result = spawnSync('python3', ['tests/french_bundle_fixture.py'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
