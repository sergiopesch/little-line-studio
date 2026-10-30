import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertProductionEvidence, assertReadiness, assertSameRelease, productionRunContext } from "../scripts/production-ci.mjs";
import { browserMatrix } from "../scripts/browser-ci.mjs";
import { sha256 } from "../scripts/release-metadata.mjs";
import { commit, marker } from "./helpers/production-http.mjs";

const env = { RELEASE_COMMIT: commit, PRODUCTION_URL: "https://example.test", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" };
const context = productionRunContext(env);
const needs = { readiness: { result: "success" }, browsers: { result: "success" } };
const verifier = { revision: commit, dirty: false };
function evidence() {
  const record = { schemaVersion: 1, ...context, verifier, status: "passed" };
  const baseline = { ...record, kind: "readiness", projects: browserMatrix().include,
    before: { release: marker, readiness: { stableSamples: 2, intervalMs: 10000 } } };
  const bundles = baseline.projects.map(({ project }) => {
    const browser = { config: { workers: 1 }, errors: [],
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
      suites: [{ specs: [{ id: "family-controls", tests: [{ projectName: project, expectedStatus: "passed", status: "expected",
        results: [{ status: "passed", retry: 0 }] }] }] }] };
    const summary = { ...structuredClone(record), kind: "browser", project,
      readinessDigest: sha256(JSON.stringify(baseline)),
      before: { release: structuredClone(marker) }, after: { release: structuredClone(marker) },
      browser: { project, tests: 1, status: "passed" } };
    return { summary, browser, inventory: structuredClone(browser) };
  });
  return { baseline, bundles };
}

test("production CI requires an explicit release, origin, workflow run and attempt", () => {
  assert.deepEqual(context, { origin: env.PRODUCTION_URL, commit, runId: "123", attempt: "1" });
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"])
    for (const value of [undefined, "", "0", "-1", "1.5", "../other"])
      assert.throws(() => productionRunContext({ ...env, [key]: value }));
  assert.throws(() => productionRunContext({ ...env, RELEASE_COMMIT: "main" }));
  assert.throws(() => productionRunContext({ ...env, PRODUCTION_URL: "https://user:secret@example.test" }));
});

test("readiness evidence must identify the same clean source and full browser plan with two stable samples", () => {
  const { baseline } = evidence();
  assert.doesNotThrow(() => assertReadiness(baseline, context));
  for (const mutate of [
    r => { r.status = "running"; }, r => { r.kind = "browser"; }, r => { r.schemaVersion = 2; },
    r => { r.commit = "b".repeat(40); }, r => { r.origin = "https://another.test"; },
    r => { r.runId = "124"; }, r => { r.attempt = "2"; },
    r => { r.verifier.dirty = true; }, r => { r.verifier.dirty = null; },
    r => { r.verifier.revision = "b".repeat(40); }, r => { r.projects.pop(); },
    r => { r.before.release.indexSha256 = "invalid"; }, r => { r.before.release.dirty = true; },
    r => { r.before.readiness.stableSamples = 1; }, r => { r.before.readiness.intervalMs = 1; },
  ]) { const changed = structuredClone(baseline); mutate(changed); assert.throws(() => assertReadiness(changed, context)); }
});

test("production aggregation requires every browser exactly once and every dependency to succeed", () => {
  const { baseline, bundles } = evidence();
  assert.equal(assertProductionEvidence(baseline, bundles, context, needs).length, 5);
  for (const job of Object.keys(needs)) {
    for (const result of ["failure", "cancelled", "skipped", undefined])
      assert.throws(() => assertProductionEvidence(baseline, bundles, context, { ...needs, [job]: { result } }));
    const missing = { ...needs }; delete missing[job];
    assert.throws(() => assertProductionEvidence(baseline, bundles, context, missing));
  }
  for (const incomplete of [[], bundles.slice(1), [...bundles, bundles[0]], [bundles[0], ...bundles.slice(0, 4)]])
    assert.throws(() => assertProductionEvidence(baseline, incomplete, context, needs), /exactly once/);
});

test("mixed runs, attempts, baselines and same-commit rebuilds cannot qualify as one production pass", () => {
  for (const mutate of [
    r => { r.runId = "124"; }, r => { r.attempt = "2"; }, r => { r.status = "failed"; },
    r => { r.verifier.dirty = true; }, r => { r.origin = "https://another.test"; },
    r => { r.readinessDigest = "0".repeat(64); },
    r => { r.before.release.indexSha256 = "0".repeat(64); },
    r => { r.after.release.indexSha256 = "0".repeat(64); },
    r => { r.after.release.revision = "b".repeat(40); },
  ]) {
    const { baseline, bundles } = evidence(); mutate(bundles[2].summary);
    assert.throws(() => assertProductionEvidence(baseline, bundles, context, needs));
  }
  const { baseline } = evidence();
  assert.throws(() => assertSameRelease({ release: { ...marker, indexSha256: "0".repeat(64) } }, baseline));
  assert.doesNotThrow(() => assertSameRelease({ release: marker }, baseline));
});

test("a passing browser summary cannot hide missing, retried or skipped tests", () => {
  for (const mutate of [
    b => { b.browser.suites = []; },
    b => { b.inventory.suites[0].specs[0].id = "another-test"; },
    b => { b.browser.stats.skipped = 1; },
    b => { b.browser.suites[0].specs[0].tests[0].results[0].retry = 1; },
    b => { b.browser.config.workers = 2; },
    b => { b.summary.browser.tests = 99; },
  ]) {
    const { baseline, bundles } = evidence(); mutate(bundles[1]);
    assert.throws(() => assertProductionEvidence(baseline, bundles, context, needs));
  }
});

test("the real prepare command rejects the wrong verifier before HTTP and replaces a stale pass with failure evidence", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "trazolino-production-ci-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "readiness.json");
  writeFileSync(file, JSON.stringify(evidence().baseline));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/production-ci.mjs", import.meta.url)), "prepare"], {
    env: { ...process.env, ...env, PRODUCTION_EVIDENCE_DIR: directory }, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(readFileSync(file));
  assert.equal(report.status, "failed");
  assert.match(report.error, /Verifier must be the clean deployed revision/);
  assert.equal(report.before, undefined, "No HTTP readiness call may run with the wrong verifier");
});
