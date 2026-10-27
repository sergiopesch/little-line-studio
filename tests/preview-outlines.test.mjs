import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("catalogue pressure outlines match the current lessons and drawing SDK", () => {
  const script = fileURLToPath(new URL("../scripts/generate-preview-outlines.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--check"], {
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
