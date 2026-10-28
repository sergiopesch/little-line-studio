import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("multilingual runner rejects changed or incomplete paid plans before dispatch", () => {
  const result = spawnSync("python3", ["tests/multilingual_runner_test.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
