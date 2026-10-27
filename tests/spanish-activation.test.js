import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Spanish activation verifies complete lessons, provenance and isolation from English", () => {
  const result = spawnSync("python3", ["tests/spanish-activation-fixtures.py"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
