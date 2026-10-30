import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import projects from "../config/browser-projects.json" with { type: "json" };

export function browserMatrix(definitions = projects) {
  assert.ok(Array.isArray(definitions) && definitions.length > 0, "Browser projects are required");
  const names = new Set();
  return { include: definitions.map(({ name, use }) => {
    assert.ok(typeof name === "string" && /^[a-z][a-z0-9-]+$/.test(name) && !names.has(name), "Invalid or duplicate browser project");
    assert.ok(["chromium", "firefox", "webkit"].includes(use?.browserName), `Unknown browser: ${name}`);
    names.add(name);
    return { project: name, browser: use.browserName };
  }) };
}

export function assertRequiredJobs(needs, required = ["browsers", "content", "plan"]) {
  assert.deepEqual(Object.keys(needs).sort(), required.toSorted(), "Every required job must report a result");
  for (const [name, job] of Object.entries(needs)) assert.equal(job.result, "success", `${name} did not succeed`);
}

function cases(report, project) {
  assert.ok(Array.isArray(report.errors) && report.errors.length === 0, "Browser report contains errors");
  const found = new Map();
  function visit(suites) {
    assert.ok(Array.isArray(suites), "Missing browser suites");
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
        assert.equal(test.projectName, project, "Unexpected browser project");
        assert.equal(test.expectedStatus, "passed", "Skipped and expected-failure tests do not qualify");
        assert.ok(typeof spec.id === "string" && spec.id && !found.has(spec.id), "Missing or duplicate test identity");
        found.set(spec.id, test);
      }
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  assert.ok(found.size > 0, "The browser suite must not be empty");
  return found;
}

export function assertBrowserReport(report, inventory, project) {
  assert.ok(browserMatrix().include.some(item => item.project === project), "Unknown browser project");
  const planned = cases(inventory, project), actual = cases(report, project);
  assert.deepEqual([...actual.keys()].sort(), [...planned.keys()].sort(), "Browser coverage differs from the collected suite");
  assert.equal(report.stats?.expected, planned.size, "Every collected test must pass");
  for (const field of ["unexpected", "skipped", "flaky"]) assert.equal(report.stats[field], 0, `Browser ${field} checks do not qualify`);
  for (const result of actual.values()) {
    assert.equal(result.status, "expected", "Unexpected test outcome");
    assert.equal(result.results.length, 1, "Retries do not qualify");
    assert.equal(result.results[0].status, "passed", "The test did not pass");
    assert.equal(result.results[0].retry, 0, "Retries do not qualify");
  }
  return { project, tests: planned.size, status: "passed" };
}

export function runBrowserProject(project, {
  config = "playwright.ci.config.js", output, env = process.env,
} = {}) {
  assert.ok(browserMatrix().include.some(item => item.project === project), "Unknown browser project");
  const root = fileURLToPath(new URL("../", import.meta.url));
  output ??= path.join(root, "output/playwright");
  const reportFile = path.join(output, "browser.json");
  mkdirSync(output, { recursive: true });
  rmSync(reportFile, { force: true });
  const args = [path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", config, "--project", project, "--workers=1"];
  const listed = spawnSync(process.execPath, [...args, "--list", "--reporter=json"], { cwd: root, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(listed.status, 0, `Browser collection failed: ${listed.stderr || listed.error || listed.signal}`);
  const inventory = JSON.parse(listed.stdout);
  cases(inventory, project);
  writeFileSync(path.join(output, "inventory.json"), listed.stdout);
  const run = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  assert.equal(run.status, 0, `Browser execution failed: ${run.error || run.signal || run.status}`);
  return assertBrowserReport(JSON.parse(readFileSync(reportFile, "utf8")), inventory, project);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, project, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, "Unexpected browser CI arguments");
  if (command === "run" && project) console.log(JSON.stringify(runBrowserProject(project)));
  else if (command === "matrix" && !project) console.log(JSON.stringify(browserMatrix()));
  else if (command === "gate" && !project) assertRequiredJobs(JSON.parse(process.env.NEEDS_JSON ?? "null"));
  else throw new Error("Use matrix, gate, or run <browser-project>");
}
