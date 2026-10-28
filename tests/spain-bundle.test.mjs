import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Spain staging verifies audio, receipts, source identity and full decode offline', () => {
  const result = spawnSync('python3', ['tests/spain_bundle_fixture.py'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
