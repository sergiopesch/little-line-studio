import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertBrowserReport, assertRequiredJobs, browserMatrix } from "../scripts/browser-ci.mjs";
import local from "../playwright.config.js";
import ci from "../playwright.ci.config.js";

const project = "desktop-webkit";
function reports() {
  const result = { projectName: project, expectedStatus: "passed", status: "expected",
    results: [{ status: "passed", retry: 0 }] };
  const report = { errors: [], stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 },
    suites: [{ specs: [{ id: "parent-gate", tests: [structuredClone(result)] }],
      suites: [{ specs: [{ id: "narration-recovery", tests: [structuredClone(result)] }] }] }] };
  return { report, inventory: structuredClone(report) };
}

test("CI plans every real Playwright project and isolates workers without changing retries or timeouts", () => {
  for (const name of ["desktop-chromium", "small-screen-chromium", "desktop-firefox", "desktop-webkit", "small-screen-webkit"])
    assert.ok(local.projects.some(p => p.name === name), `Missing supported project: ${name}`);
  assert.deepEqual(browserMatrix().include, local.projects.map(p => ({ project: p.name, browser: p.use.browserName })));
  assert.deepEqual(ci.projects, local.projects);
  assert.equal(ci.workers, 1);
  assert.equal(ci.forbidOnly, true);
  for (const key of ["retries", "timeout", "expect", "testDir", "testIgnore", "webServer"])
    assert.deepEqual(ci[key], local[key], key);
  assert.equal(ci.retries, 0);
  assert.throws(() => browserMatrix([]));
  assert.throws(() => browserMatrix([local.projects[0], local.projects[0]]));
  assert.throws(() => browserMatrix([{ name: "unrecognized", use: { browserName: "unknown" } }]));
});

test("the required CI gate accepts only complete successful dependencies, never skips or cancellation", () => {
  const good = { plan: { result: "success" }, content: { result: "success" }, browsers: { result: "success" } };
  assert.doesNotThrow(() => assertRequiredJobs(good));
  for (const job of Object.keys(good)) {
    for (const result of ["failure", "cancelled", "skipped", "pending", "", undefined])
      assert.throws(() => assertRequiredJobs({ ...good, [job]: { result } }), new RegExp(job));
    const missing = { ...good }; delete missing[job];
    assert.throws(() => assertRequiredJobs(missing), /Every required job/);
  }
  assert.throws(() => assertRequiredJobs({ ...good, extra: { result: "success" } }));
});

test("the exact CI command fails closed for failed or missing dependency evidence", () => {
  const script = fileURLToPath(new URL("../scripts/browser-ci.mjs", import.meta.url));
  for (const needs of [{}, { plan: { result: "success" }, content: { result: "success" }, browsers: { result: "skipped" } }]) {
    const result = spawnSync(process.execPath, [script, "gate"], { env: { ...process.env, NEEDS_JSON: JSON.stringify(needs) }, encoding: "utf8" });
    assert.notEqual(result.status, 0);
  }
  const matrix = spawnSync(process.execPath, [script, "matrix"], { encoding: "utf8" });
  assert.equal(matrix.status, 0, matrix.stderr);
  assert.deepEqual(JSON.parse(matrix.stdout), browserMatrix());
});

test("browser evidence must cover the entire collected project exactly once", () => {
  const { report, inventory } = reports();
  assert.deepEqual(assertBrowserReport(report, inventory, project), { project, tests: 2, status: "passed" });
  const mutations = [
    r => { r.suites[0].suites = []; r.stats.expected = 1; },
    r => { r.suites[0].suites[0].specs[0].id = "unplanned"; },
    r => { r.suites[0].specs.push(structuredClone(r.suites[0].specs[0])); },
    r => { r.suites[0].specs[0].tests[0].projectName = "desktop-chromium"; },
    r => { r.suites = []; r.stats.expected = 0; },
    r => { r.errors.push({ message: "Collection failure" }); },
  ];
  for (const change of mutations) { const changed = structuredClone(report); change(changed); assert.throws(() => assertBrowserReport(changed, inventory, project)); }
});

test("skips, expected failures and retries cannot turn browser evidence green", () => {
  for (const field of ["skipped", "flaky", "unexpected"]) {
    const { report, inventory } = reports(); report.stats[field] = 1;
    assert.throws(() => assertBrowserReport(report, inventory, project));
  }
  for (const change of [
    t => { t.expectedStatus = "failed"; },
    t => { t.status = "skipped"; t.results = []; },
    t => { t.results[0].status = "failed"; },
    t => { t.results.push({ status: "passed", retry: 1 }); },
    t => { t.results[0].retry = 1; },
  ]) {
    const { report, inventory } = reports(); change(report.suites[0].specs[0].tests[0]);
    assert.throws(() => assertBrowserReport(report, inventory, project));
  }
});
