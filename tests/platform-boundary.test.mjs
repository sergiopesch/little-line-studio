import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("family UI consumes the shared engine without shipping the agent workspace", async () => {
  const result = await build({
    entryPoints: ["src/App.jsx"], bundle: true, write: false, platform: "browser",
    format: "esm", jsx: "automatic", metafile: true, loader: { ".css": "empty" },
    logLevel: "silent",
  });
  const modules = Object.keys(result.metafile.inputs);
  assert.ok(modules.includes("src/core/lesson-engine.ts"));
  assert.ok(modules.includes("src/core/scripted-session.ts"));
  assert.equal(modules.some(path => /src\/agent\/|src\/core\/rehearsal\.ts|scripts\/agent-workspace/.test(path)), false);
});

test("the shared core and agent protocol have no browser, provider, network or filesystem dependency", async () => {
  const result = await build({
    entryPoints: ["src/agent/workspace.ts"], bundle: true, write: false,
    platform: "neutral", format: "esm", metafile: true, logLevel: "silent",
  });
  const modules = Object.keys(result.metafile.inputs);
  assert.ok(modules.includes("src/core/lesson-engine.ts"));
  assert.ok(modules.includes("src/core/scripted-session.ts"));
  assert.ok(modules.includes("src/demonstration-state.ts"));
  assert.ok(modules.every(path => path.startsWith("src/core/") || path.startsWith("src/agent/") ||
    path === "src/demonstration-state.js" || path === "src/demonstration-state.ts" || path === "src/narration-policy.js"));
  assert.deepEqual(Object.values(result.metafile.outputs).flatMap(output => output.imports), []);
});
