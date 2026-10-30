import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertBrowserReport, assertRequiredJobs, browserMatrix, runBrowserProject } from "./browser-ci.mjs";
import { checkProductionHttp, productionTarget, verifyRelease } from "./production-checks.mjs";
import { sha256, sourceIdentity } from "./release-metadata.mjs";
import { waitForProduction } from "./wait-for-production.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(process.env.PRODUCTION_EVIDENCE_DIR ?? path.join(root, "output/production-verification"));
const projects = browserMatrix().include;
const digest = record => sha256(JSON.stringify(record));
const readJson = async file => JSON.parse(await readFile(file, "utf8"));

export function productionRunContext(env) {
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"])
    assert.match(env[key] ?? "", /^[1-9]\d*$/, `Missing or invalid ${key}`);
  return { ...productionTarget(env.PRODUCTION_URL, env.RELEASE_COMMIT),
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT };
}

function assertVerifier(verifier, context) {
  assert.deepEqual(verifier, { revision: context.commit, dirty: false }, "Verifier must be the clean deployed revision");
}

function assertRecord(record, context, kind) {
  assert.equal(record.schemaVersion, 1, "Unsupported production evidence");
  assert.equal(record.kind, kind, "Wrong evidence kind");
  assert.equal(record.status, "passed", "Incomplete or failed production evidence");
  for (const key of ["origin", "commit", "runId", "attempt"])
    assert.equal(record[key], context[key], `Production evidence ${key} differs`);
  assertVerifier(record.verifier, context);
}

export function assertReadiness(baseline, context) {
  assertRecord(baseline, context, "readiness");
  assert.deepEqual(baseline.projects, projects, "Production browser plan differs");
  verifyRelease(baseline.before.release, context.commit);
  assert.equal(baseline.before.readiness.stableSamples, 2, "Two stable HTTP samples are required");
  assert.equal(baseline.before.readiness.intervalMs, 10000, "Readiness samples must be ten seconds apart");
}

export function assertSameRelease(http, baseline) {
  assert.deepEqual(http.release, baseline.before.release, "The deployment changed during production verification");
}

export function assertProductionEvidence(baseline, bundles, context, needs) {
  assertRequiredJobs(needs, ["readiness", "browsers"]);
  assertReadiness(baseline, context);
  assert.deepEqual(bundles.map(b => b.summary.project).sort(), projects.map(p => p.project).sort(),
    "Every production browser project must report exactly once");
  return bundles.map(({ summary, browser, inventory }) => {
    assertRecord(summary, context, "browser");
    assert.equal(summary.readinessDigest, digest(baseline), "Browser used different readiness evidence");
    assertSameRelease(summary.before, baseline);
    assertSameRelease(summary.after, baseline);
    assert.equal(browser.config.workers, 1, "Production browsers must run in isolation");
    const result = assertBrowserReport(browser, inventory, summary.project);
    assert.deepEqual(summary.browser, result, "Browser summary differs from its complete report");
    return result;
  });
}

// Write a non-passing record before starting, so interruption cannot retain an old pass.
async function recordRun(file, context, kind, work) {
  const report = { schemaVersion: 1, kind, ...context, verifier: sourceIdentity(root, {}),
    startedAt: new Date().toISOString(), status: "running" };
  await mkdir(path.dirname(file), { recursive: true });
  const save = () => writeFile(file, JSON.stringify(report, null, 2) + "\n");
  await save();
  try {
    assertVerifier(report.verifier, context);
    await work(report);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    await save();
    console.log(`Production ${kind} ${report.status}: ${file}`);
    if (report.error) console.error(report.error);
  }
}

async function main(command, project) {
  const context = productionRunContext(process.env);
  const baselineFile = path.join(output, "readiness.json");
  if (command === "prepare" && !project) {
    await recordRun(baselineFile, context, "readiness", async report => {
      report.projects = projects;
      report.before = await waitForProduction(context);
    });
  } else if (command === "run" && projects.some(p => p.project === project)) {
    const directory = path.join(output, project);
    await recordRun(path.join(directory, "summary.json"), context, "browser", async report => {
      report.project = project;
      const baseline = await readJson(baselineFile);
      assertReadiness(baseline, context);
      report.readinessDigest = digest(baseline);
      report.before = await checkProductionHttp(context);
      assertSameRelease(report.before, baseline);
      report.browser = runBrowserProject(project, { config: "playwright.production.config.js", output: directory,
        env: { ...process.env, LLS_PRODUCTION_URL: context.origin, LLS_PRODUCTION_OUTPUT: directory } });
      report.after = await checkProductionHttp(context);
      assertSameRelease(report.after, baseline);
    });
  } else if (command === "finish" && !project) {
    await recordRun(path.join(output, "summary.json"), context, "production", async report => {
      const needs = JSON.parse(process.env.NEEDS_JSON ?? "null");
      assertRequiredJobs(needs, ["readiness", "browsers"]);
      const baseline = await readJson(baselineFile);
      const directory = path.join(output, "browsers");
      const expected = projects.map(p => `production-browser-${context.attempt}-${p.project}`).sort();
      assert.deepEqual((await readdir(directory)).sort(), expected, "Missing or unexpected production artifacts");
      const bundles = await Promise.all(expected.map(async name => {
        const read = file => readJson(path.join(directory, name, file));
        const [summary, browser, inventory] = await Promise.all([read("summary.json"), read("browser.json"), read("inventory.json")]);
        return { summary, browser, inventory };
      }));
      report.browsers = assertProductionEvidence(baseline, bundles, context, needs);
      report.before = baseline.before;
      report.readinessDigest = digest(baseline);
      report.after = await checkProductionHttp(context);
      assertSameRelease(report.after, baseline);
    });
  } else throw new Error("Use prepare, run <browser-project>, or finish");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv.length <= 4, "Unexpected production CI arguments");
  await main(...process.argv.slice(2));
}
