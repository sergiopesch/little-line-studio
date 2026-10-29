import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { LESSONS } from "../src/lesson-catalogue.js";
import { checkStartupBudget } from "../config/startup-budget.js";

const chunk = (fileName, { imports = [], modules = {}, code = "", isEntry = false } = {}) =>
  ({ type: "chunk", fileName, imports, modules, code, isEntry });

test("startup budget counts static shared chunks once and excludes lazy chunks", () => {
  const bundle = {
    "index.js": chunk("index.js", { isEntry: true, imports: ["shared.js"] }),
    "shared.js": chunk("shared.js", { imports: ["index.js"], code: "x".repeat(399_000) }),
    "lazy.js": chunk("lazy.js", { code: "x".repeat(500_000) }),
  };
  assert.equal(checkStartupBudget(bundle).chunks, 2);
  bundle["shared.js"].code += "x".repeat(2_000);
  assert.throws(() => checkStartupBudget(bundle), /exceeds budget/);
  bundle["shared.js"].code = "";
  bundle["shared.js"].modules["/project/src/narration-index.json"] = {};
  assert.throws(() => checkStartupBudget(bundle), /Lesson resources/);
  delete bundle["shared.js"];
  assert.throws(() => checkStartupBudget(bundle), /Missing startup chunk/);
  assert.throws(() => checkStartupBudget({}), /No application entry/);
});

test("the lightweight directory exactly follows authored identities, order and levels", () => {
  const directory = JSON.parse(readFileSync(new URL("../src/lesson-directory.json", import.meta.url)));
  assert.deepEqual(directory, LESSONS.map(({ id, level }) => ({ id, level })));
});

test("the real licensed entry keeps lesson data and the SDK behind dynamic imports", async () => {
  // Build the module graph without executing the SDK or using a licence key.
  // This runs in no-key CI as well as licensed builds; Vite enforces actual
  // emitted byte budgets separately on every deployment.
  const result = await build({ entryPoints: ["src/LessonEntry.jsx"], bundle: true, splitting: true,
    format: "esm", platform: "browser", jsx: "automatic", outdir: "graph", write: false,
    metafile: true, loader: { ".css": "empty", ".woff2": "empty" },
    logLevel: "silent", define: { "process.env.NODE_ENV": '"production"', __TLDRAW_LICENSE_INFO__: "null" },
  });
  const outputs = result.metafile.outputs;
  const root = Object.entries(outputs).find(([, output]) => output.entryPoint === "src/LessonEntry.jsx")[0];
  const seen = new Set();
  function visit(path) {
    if (seen.has(path)) return;
    seen.add(path);
    for (const item of outputs[path].imports)
      if (item.kind !== "dynamic-import" && !item.external) visit(item.path);
  }
  visit(root);
  const inputs = [...seen].flatMap(path => Object.keys(outputs[path].inputs));
  assert.ok(inputs.includes("src/StudioEntry.jsx"));
  assert.ok(inputs.includes("src/lesson-directory.json"));
  assert.equal(inputs.filter(path => /^(?:src\/(?:App\.jsx|Catalogue\.jsx|lesson-catalogue\.js|lessons\/|narration-(?:index|durations))|node_modules\/(?:@tldraw|tldraw)\/)/.test(path)).length, 0);
  assert.ok(Object.values(outputs).some(output => output.entryPoint === "src/App.jsx"));
});
