import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { productionTarget, verifyRelease, checkProductionHttp } from "../scripts/production-checks.mjs";
import { releaseMetadata, sha256 } from "../scripts/release-metadata.mjs";
import { securityHeaders } from "../config/security.js";

const commit = "a".repeat(40);
const document = '<html><script type="module" src="/assets/index-fixture.js"></script></html>';
const marker = { schemaVersion: 1, revision: commit, dirty: false, indexSha256: sha256(document) };

test("production targets require an explicit revision and reject credentials, redirects to arbitrary paths and non-TLS remote hosts", () => {
  assert.deepEqual(productionTarget("https://example.test/", commit), { origin: "https://example.test", commit });
  assert.equal(productionTarget("http://127.0.0.1:1234", commit).origin, "http://127.0.0.1:1234");
  for (const url of ["https://user:secret@example.test", "https://example.test/path", "https://example.test/?token=secret", "https://example.test/#fragment", "http://example.test", "file:///tmp/page"])
    assert.throws(() => productionTarget(url, commit));
  for (const revision of [undefined, "main", "abc123", "x".repeat(40)]) assert.throws(() => productionTarget("https://example.test", revision));
  assert.throws(() => verifyRelease({ ...marker, revision: "b".repeat(40) }, commit));
  assert.throws(() => verifyRelease({ ...marker, dirty: true }, commit));
  assert.throws(() => verifyRelease({ ...marker, dirty: null }, commit));
});

test("release identity distinguishes clean Git, modified source and unidentified archives", t => {
  const root = mkdtempSync(path.join(tmpdir(), "little-line-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(releaseMetadata(root, document, {}), { ...marker, revision: null, dirty: null });
  assert.deepEqual(releaseMetadata(root, document, { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: commit }), marker);
  assert.throws(() => releaseMetadata(root, document, { VERCEL_GIT_COMMIT_SHA: "not-a-sha" }), /Invalid/);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init");
  git("config", "user.name", "Release fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(path.join(root, "source.txt"), "source");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  const head = git("rev-parse", "HEAD");
  assert.deepEqual(releaseMetadata(root, document, {}), { ...marker, revision: head });
  writeFileSync(path.join(root, "source.txt"), "modified");
  assert.equal(releaseMetadata(root, document, {}).dirty, true);
  assert.throws(() => releaseMetadata(root, document, { VERCEL_GIT_COMMIT_SHA: commit }), /differs/);
});

test("Vercel config reserialization preserves identity without accepting source or configuration changes", t => {
  const root = mkdtempSync(path.join(tmpdir(), "little-line-vercel-identity-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const config = { outputDirectory: "dist/client", headers: [{ source: "/", headers: [{ key: "Cache-Control", value: "no-cache" }] }] };
  const writeConfig = value => writeFileSync(path.join(root, "vercel.json"), value);
  git("init");
  git("config", "user.name", "Release fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeConfig(JSON.stringify(config, null, 2) + "\n");
  writeFileSync(path.join(root, "source.txt"), "source");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  const env = { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: git("rev-parse", "HEAD") };
  const dirty = () => releaseMetadata(root, document, env).dirty;

  writeConfig(JSON.stringify({ headers: config.headers, outputDirectory: config.outputDirectory }));
  assert.equal(dirty(), false, "formatting and object key order do not change Vercel configuration");
  assert.equal(releaseMetadata(root, document, {}).dirty, true, "local edits remain dirty");
  git("add", "vercel.json");
  assert.equal(dirty(), true, "staged config edits remain dirty");
  git("reset", "HEAD", "--", "vercel.json");
  writeFileSync(path.join(root, "source.txt"), "changed");
  assert.equal(dirty(), true, "other tracked changes remain dirty");
  writeFileSync(path.join(root, "source.txt"), "source");
  writeFileSync(path.join(root, "new-source.js"), "new source");
  assert.equal(dirty(), true, "untracked source remains dirty");
  rmSync(path.join(root, "new-source.js"));
  writeConfig(JSON.stringify({ ...config, outputDirectory: "." }));
  assert.equal(dirty(), true, "changed configuration values remain dirty");
  writeConfig("invalid JSON");
  assert.equal(dirty(), true, "unreadable configuration fails closed");
  rmSync(path.join(root, "vercel.json"));
  assert.equal(dirty(), true, "deleted configuration remains dirty");
});

function fixtureFetch(change = () => {}) {
  return async (url, options) => {
    assert.equal(options.redirect, "manual");
    const route = new URL(url).pathname;
    const headers = new Headers(securityHeaders);
    let status = 200, body;
    if (route === "/release.json") { body = JSON.stringify(marker); headers.set("Content-Type", "application/json"); }
    else if (route === "/") body = document;
    else if (route.startsWith("/assets/")) { body = "/* fixture */"; headers.set("Content-Type", "application/javascript"); }
    else if (route.startsWith("/narration/")) {
      assert.equal(options.headers.Range, "bytes=0-99");
      status = 206; body = new Uint8Array(100);
      headers.set("Content-Type", "audio/mpeg"); headers.set("Content-Range", "bytes 0-99/1000");
    } else { status = 404; body = "Not found"; }
    const response = { status, headers, body };
    change(route, response);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
}

test("production checks verify build identity, every header, compiled entry, private paths and exact audio ranges", async () => {
  const result = await checkProductionHttp(productionTarget("https://example.test", commit), fixtureFetch());
  assert.deepEqual(result.release, marker);
  assert.equal(result.checks.length, 10);
  assert.equal(result.checks.filter(c => c.status === 404).length, 6);
});

test("production checks reject stale HTML, exposed private paths, missing headers, redirects and false range support", async () => {
  const target = productionTarget("https://example.test", commit);
  for (const mutate of [
    (route, r) => { if (route === "/") r.body += "changed"; },
    (route, r) => { if (route === "/src/main.jsx") r.status = 200; },
    (route, r) => { if (route === "/") r.headers.delete("Content-Security-Policy"); },
    (route, r) => { if (route === "/release.json") r.status = 302; },
    (route, r) => { if (route === "/release.json") r.body = JSON.stringify({ ...marker, dirty: true }); },
    (route, r) => { if (route.startsWith("/narration/")) r.status = 200; },
    (route, r) => { if (route.startsWith("/narration/")) r.body = new Uint8Array(99); },
    (route, r) => { if (route.startsWith("/narration/")) r.headers.set("Content-Range", "bytes 1-100/1000"); },
  ]) await assert.rejects(checkProductionHttp(target, fixtureFetch(mutate)));
});
