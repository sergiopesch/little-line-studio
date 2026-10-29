import test from "node:test";
import assert from "node:assert/strict";
import { waitForProduction } from "../scripts/wait-for-production.mjs";
import { sha256 } from "../scripts/release-metadata.mjs";
import { commit, document, marker, fixtureFetch } from "./helpers/production-http.mjs";

const target = { origin: "https://example.com", commit };
function clock(fetcher, timeoutMs = 30) {
  let time = 0;
  return { timeoutMs, intervalMs: 10, now: () => time,
    delay: async ms => { time += ms; }, fetcher, log() {} };
}
function sequence(changes) {
  let attempts = 0;
  const fetcher = fixtureFetch((route, response) => {
    if (route === "/release.json") attempts++;
    changes[attempts - 1]?.(route, response);
  });
  return { fetcher, attempts: () => attempts };
}
const old = (route, r) => {
  if (route === "/release.json") r.body = JSON.stringify({ ...marker, revision: "c".repeat(40) });
};
const staleHtml = (route, r) => { if (route === "/") r.body += "stale"; };

test("propagation requires two complete HTTP passes for the exact commit without credentials or redirects", async () => {
  const s = sequence([old]);
  const result = await waitForProduction(target, clock(async (url, options) => {
    assert.equal(url.origin, target.origin);
    assert.equal(options.redirect, "manual");
    assert.deepEqual(options.headers, url.pathname.startsWith("/narration/")
      ? { "Cache-Control": "no-cache", Range: "bytes=0-99" } : { "Cache-Control": "no-cache" });
    return s.fetcher(url, options);
  }));
  assert.deepEqual(result.release, marker);
  assert.equal(result.checks.length, 10);
  assert.deepEqual(result.readiness, { attempts: 3, stableSamples: 2, intervalMs: 10 });
});

test("new marker then old marker or stale HTML resets the consecutive readiness checks", async () => {
  for (const changes of [[undefined, old], [staleHtml], [undefined, staleHtml]]) {
    const s = sequence(changes);
    const result = await waitForProduction(target, clock(s.fetcher, 60));
    assert.equal(result.readiness.attempts, changes.length + 2);
    assert.deepEqual(result.release, marker);
  }
});

test("same-commit rebuilds must have a stable HTML fingerprint", async () => {
  const changed = document + "<!-- new build -->";
  const otherBuild = (route, r) => {
    if (route === "/release.json") r.body = JSON.stringify({ ...marker, indexSha256: sha256(changed) });
    if (route === "/") r.body = changed;
  };
  const s = sequence([otherBuild]);
  const result = await waitForProduction(target, clock(s.fetcher));
  assert.equal(result.readiness.attempts, 3);
  assert.deepEqual(result.release, marker);
});

test("missing release assets, temporary server errors and offline requests can recover within the deadline", async () => {
  for (const route of ["/release.json", "/", "/assets/index-fixture.js"]) {
    for (const status of [404, 503, "offline"]) {
      const s = sequence([(path, r) => {
        if (path !== route) return;
        if (status === "offline") throw new Error("offline");
        r.status = status;
      }]);
      assert.equal((await waitForProduction(target, clock(s.fetcher))).readiness.attempts, 3);
    }
  }
});

test("stuck deployments and one good sample never count as readiness", async () => {
  for (const change of [old, staleHtml,
    (route, r) => { if (route === "/release.json") r.status = 404; },
    (route, r) => { if (route === "/release.json") r.status = 503; },
    () => { throw new Error("offline"); }]) {
    const s = sequence([change, change, change]);
    await assert.rejects(waitForProduction(target, clock(s.fetcher)), /Timed out/);
    assert.equal(s.attempts(), 3);
  }
  const s = sequence([old, old]);
  await assert.rejects(waitForProduction(target, clock(s.fetcher)), /Timed out/);
  assert.equal(s.attempts(), 3);
});

test("security, invalid identity, private path and media failures fail immediately, including on old builds", async () => {
  for (const change of [
    (route, r) => { if (route === "/release.json") r.status = 302; },
    (route, r) => { if (route === "/release.json") r.status = 401; },
    ...[marker, { ...marker, revision: "c".repeat(40) }].flatMap(release => [
      (route, r) => { if (route === "/release.json") r.body = JSON.stringify({ ...release, dirty: true }); },
      (route, r) => { if (route === "/release.json") r.body = JSON.stringify({ ...release, indexSha256: "wrong" }); },
    ]),
    (route, r) => { if (route === "/release.json") r.body = JSON.stringify({ ...marker, revision: null }); },
    (route, r) => { if (route === "/release.json") r.body = "malformed JSON"; },
    (route, r) => { if (route === "/") r.headers.delete("Content-Security-Policy"); },
    (route, r) => { if (route === "/src/main.jsx") r.status = 200; },
    (route, r) => { if (route.startsWith("/narration/")) r.status = 503; },
    (route, r) => { if (route.startsWith("/narration/")) r.body = new Uint8Array(99); },
  ]) {
    const s = sequence([change]);
    await assert.rejects(waitForProduction(target, clock(s.fetcher)));
    assert.equal(s.attempts(), 1);
  }
});

test("a security failure after a good sample is not hidden by readiness retries", async () => {
  const s = sequence([undefined, (route, r) => { if (route === "/") r.headers.delete("Content-Security-Policy"); }]);
  await assert.rejects(waitForProduction(target, clock(s.fetcher)), /Content-Security-Policy/);
  assert.equal(s.attempts(), 2);
});

test("readiness cannot succeed at its deadline and rejects invalid wait settings before fetching", async () => {
  let time = 0;
  const s = sequence([undefined, (route) => { if (route.startsWith("/narration/")) time = 30; }]);
  const options = { ...clock(s.fetcher), now: () => time, delay: async ms => { time += ms; } };
  await assert.rejects(waitForProduction(target, options), /Timed out/);
  for (const timeoutMs of [0, -1, 900001, 1.5, NaN])
    await assert.rejects(waitForProduction(target, { timeoutMs, fetcher() { assert.fail("must not fetch"); } }), /Invalid/);
});
