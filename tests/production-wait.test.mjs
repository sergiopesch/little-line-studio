import test from "node:test";
import assert from "node:assert/strict";
import { waitForProduction } from "../scripts/wait-for-production.mjs";

const target = { origin: "https://example.com", commit: "a".repeat(40) };
const release = { schemaVersion: 1, revision: target.commit, dirty: false, indexSha256: "b".repeat(64) };
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
function clock(fetcher) {
  let time = 0;
  return { timeoutMs: 30, intervalMs: 10, now: () => time,
    delay: async ms => { time += ms; }, fetcher, log() {} };
}

test("deployment propagation waits for the exact commit without following redirects or sending credentials", async () => {
  let count = 0;
  const result = await waitForProduction(target, clock(async (url, options) => {
    assert.equal(url.origin, target.origin);
    assert.equal(options.redirect, "manual");
    assert.deepEqual(options.headers, { "Cache-Control": "no-cache" });
    return json(++count === 1 ? { ...release, revision: "c".repeat(40) } : release);
  }));
  assert.deepEqual(result, release);
  assert.equal(count, 2);
});

test("failed or stuck deployments time out instead of accepting an older release", async () => {
  for (const response of [() => json({ ...release, revision: "c".repeat(40) }),
    () => new Response(null, { status: 404 }), () => new Response(null, { status: 503 }),
    () => { throw new Error("offline"); }]) {
    let calls = 0;
    await assert.rejects(waitForProduction(target, clock(async () => { calls++; return response(); })), /Timed out/);
    assert.equal(calls, 3);
  }
});

test("protected, redirected, unidentified and dirty deployments fail immediately", async () => {
  for (const response of [() => new Response(null, { status: 302 }), () => new Response(null, { status: 401 }),
    () => json({ ...release, dirty: true }), () => json({ ...release, revision: null }),
    () => json({ ...release, indexSha256: "wrong" })]) {
    let calls = 0;
    await assert.rejects(waitForProduction(target, clock(async () => { calls++; return response(); })));
    assert.equal(calls, 1);
  }
});
