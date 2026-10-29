#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { productionTarget, checkProductionHttp } from "./production-checks.mjs";
import { sourceIdentity } from "./release-metadata.mjs";
import { waitForProduction } from "./wait-for-production.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: {
  url: { type: "string" }, commit: { type: "string" }, output: { type: "string" }, wait: { type: "string" }, help: { type: "boolean" },
} });
if (values.help) {
  console.log("npm run verify:production -- --url https://trazolino.org --commit <full SHA> [--wait <1-900 seconds>] [--output <report parent directory>]");
} else {
  const target = productionTarget(values.url, values.commit);
  if (values.wait !== undefined && (!/^\d+$/.test(values.wait) || Number(values.wait) < 1 || Number(values.wait) > 900))
    throw new Error("--wait must be between 1 and 900 seconds");
  const parent = path.resolve(values.output ?? path.join(root, "output/production-verification"));
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(path.join(parent, `${target.commit.slice(0, 12)}-`));
  const report = { schemaVersion: 1, ...target, verifier: sourceIdentity(root, {}), startedAt: new Date().toISOString(), status: "failed" };
  try {
    if (values.wait) report.waitedForRelease = await waitForProduction(target, { timeoutMs: Number(values.wait) * 1000 });
    report.before = await checkProductionHttp(target);
    console.log(`Verified release ${target.commit}; checking all browser projects.`);
    const exit = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.production.config.js"], {
        cwd: root, stdio: "inherit", env: { ...process.env, LLS_PRODUCTION_URL: target.origin, LLS_PRODUCTION_OUTPUT: output },
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const browser = JSON.parse(await readFile(path.join(output, "browser.json"), "utf8"));
    report.browser = { ...exit, stats: browser.stats, projects: browser.config.projects.map(p => p.name) };
    assert.equal(exit.code, 0, "Browser verification failed; inspect browser.json and failure traces");
    assert.ok(browser.stats.expected > 0 && browser.stats.unexpected === 0 && browser.stats.flaky === 0 && browser.stats.skipped === 0,
      "All selected production checks must pass without skips or retries");
    report.after = await checkProductionHttp(target);
    assert.deepEqual(report.after.release, report.before.release, "The deployment changed during verification");
    report.status = "passed";
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(path.join(output, "summary.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`Production verification ${report.status}: ${path.join(output, "summary.json")}`);
    if (report.error) console.error(report.error);
  }
}
