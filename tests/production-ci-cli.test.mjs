import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, renameSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { browserMatrix } from "../scripts/browser-ci.mjs";
import { sha256 } from "../scripts/release-metadata.mjs";
import { document, marker, fixtureFetch } from "./helpers/production-http.mjs";

test("the real production CI commands bind isolated fixture reports to one stable release and fail closed on aggregation faults", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "trazolino-production-driver-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Match the workflow's sparse checkout: no installed dependencies or application bundle.
  for (const file of [".gitignore", "scripts/production-ci.mjs", "scripts/browser-ci.mjs", "scripts/production-checks.mjs",
    "scripts/release-metadata.mjs", "scripts/wait-for-production.mjs", "config/browser-projects.json", "config/security.js", "src/narration-index.json"]) {
    const destination = path.join(root, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), destination);
  }
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init"); git("add", ".");
  git("-c", "user.name=Verification fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  const revision = git("rev-parse", "HEAD");
  // This is a process/HTTP/artifact integration fixture, not browser or media evidence.
  const cli = path.join(root, "node_modules/@playwright/test/cli.js");
  mkdirSync(path.dirname(cli), { recursive: true });
  writeFileSync(cli, `
    const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
    assert.ok(process.argv.includes('--workers=1'));
    const project = process.argv[process.argv.indexOf('--project') + 1];
    const report = {config:{workers:1},errors:[],stats:{expected:1,skipped:0,unexpected:0,flaky:0},
      suites:[{specs:[{id:'fixture',tests:[{projectName:project,expectedStatus:'passed',status:'expected',results:[{status:'passed',retry:0}]}]}]}]};
    if(process.argv.includes('--list')) console.log(JSON.stringify(report));
    else fs.writeFileSync(path.join(process.env.LLS_PRODUCTION_OUTPUT,'browser.json'),JSON.stringify(report));
  `);

  let rebuilt = false, requests = 0;
  const fetcher = fixtureFetch((route, response) => {
    const html = rebuilt ? document + "<!-- rebuilt -->" : document;
    if (route === "/release.json") response.body = JSON.stringify({ ...marker, revision, indexSha256: sha256(html) });
    if (route === "/") response.body = html;
  });
  const server = createServer(async (request, response) => {
    requests++;
    try {
      const result = await fetcher(new URL(request.url, "http://fixture.test"), {
        redirect: "manual", headers: { Range: request.headers.range },
      });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) { response.writeHead(500); response.end(error.message); }
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const output = path.join(root, "output/evidence");
  const env = { ...process.env, RELEASE_COMMIT: revision, PRODUCTION_URL: `http://127.0.0.1:${server.address().port}`,
    GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", PRODUCTION_EVIDENCE_DIR: output,
    NEEDS_JSON: JSON.stringify({ readiness: { result: "success" }, browsers: { result: "success" } }) };
  const run = (args, overrides = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/production-ci.mjs"), ...args], {
      cwd: root, env: { ...env, ...overrides }, timeout: 25000,
    });
    let log = "";
    child.stdout.on("data", chunk => { log += chunk; });
    child.stderr.on("data", chunk => { log += chunk; });
    child.once("error", reject);
    child.once("exit", code => resolve({ code, log }));
  });
  const check = async (args, expected = 0, overrides) => {
    const result = await run(args, overrides);
    assert.equal(result.code, expected, result.log);
  };
  const read = file => JSON.parse(readFileSync(path.join(output, file)));
  await check(["prepare"]);
  assert.equal(read("readiness.json").before.readiness.stableSamples, 2);
  for (const { project } of browserMatrix().include) {
    await check(["run", project]);
    cpSync(path.join(output, project), path.join(output, "browsers", `production-browser-1-${project}`), { recursive: true });
  }
  await check(["finish"]);
  assert.equal(read("summary.json").browsers.length, 5);
  assert.equal(git("status", "--porcelain"), "", "Downloaded evidence must not dirty the verifier checkout");

  const beforeFailedJob = requests;
  await check(["finish"], 1, { NEEDS_JSON: JSON.stringify({ readiness: { result: "success" }, browsers: { result: "skipped" } }) });
  assert.equal(requests, beforeFailedJob, "Failed dependencies must stop before the final HTTP check");
  assert.equal(read("summary.json").status, "failed");

  const directory = path.join(output, "browsers/production-browser-1-desktop-chromium"), moved = path.join(output, "missing-browser");
  renameSync(directory, moved);
  await check(["finish"], 1);
  assert.match(read("summary.json").error, /Missing or unexpected production artifacts/);
  renameSync(moved, directory);

  rebuilt = true;
  await check(["finish"], 1);
  assert.match(read("summary.json").error, /deployment changed/);
  await check(["run", "desktop-chromium"], 1);
  assert.match(read("desktop-chromium/summary.json").error, /deployment changed/);
});
