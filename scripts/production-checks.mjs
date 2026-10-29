import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { securityHeaders } from "../config/security.js";
import { sha256 } from "./release-metadata.mjs";
import narration from "../src/narration-index.json" with { type: "json" };

export function productionTarget(value, commit) {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Use a public HTTPS origin, without credentials, query or path (HTTP is allowed only on loopback).");
  if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("Provide the expected full Git commit SHA.");
  return { origin: url.origin, commit };
}

export function verifyRelease(release, commit) {
  assert.equal(release.schemaVersion, 1, "Unsupported release marker");
  assert.match(release.revision ?? "", /^[a-f0-9]{40}$/, "Invalid release identity");
  assert.equal(release.revision, commit, "The deployed commit differs from the requested commit");
  assert.equal(release.dirty, false, "The deployed build must identify a clean source revision");
  assert.match(release.indexSha256, /^[a-f0-9]{64}$/, "Missing build fingerprint");
  return release;
}

// Only readiness checks opt into these bounded, retriable propagation failures.
// Headers, malformed markers, private paths and media failures remain fatal.
export class ProductionPropagationError extends Error {}

export async function checkProductionHttp(target, fetcher = fetch, { propagation = false, signal } = {}) {
  const checks = [];
  const get = async (path, status, headers = {}, mayPropagate = false) => {
    let response;
    try {
      const timeout = AbortSignal.timeout(15000);
      response = await fetcher(new URL(path, target.origin), {
        redirect: "manual", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { "Cache-Control": "no-cache", ...headers },
      });
    } catch (error) {
      if (propagation && mayPropagate)
        throw new ProductionPropagationError("Release request failed or timed out", { cause: error });
      throw error;
    }
    if (propagation && mayPropagate && (response.status === 404 || response.status >= 500)) {
      await response.body?.cancel();
      throw new ProductionPropagationError(`Release request returned HTTP ${response.status}`);
    }
    assert.equal(response.status, status, `${path}: unexpected status (redirects and protected deployments are rejected)`);
    for (const [name, value] of Object.entries(securityHeaders))
      assert.equal(response.headers.get(name), value, `${path}: ${name}`);
    checks.push({ path: path.split("?")[0], status, securityHeaders: "passed" });
    return response;
  };
  const marker = await get(`/release.json?verification=${randomUUID()}`, 200, {}, true);
  assert.match(marker.headers.get("content-type") ?? "", /application\/json/);
  const candidate = await marker.json();
  // Validate even an older marker before deciding it is safe to wait.
  const release = verifyRelease(candidate, propagation ? candidate?.revision : target.commit);
  if (propagation && release.revision !== target.commit)
    throw new ProductionPropagationError(`Production still serves ${release.revision}`);
  const home = await get("/", 200, {}, true);
  const document = await home.text();
  if (propagation && sha256(document) !== release.indexSha256)
    throw new ProductionPropagationError("The HTML and release marker belong to different builds");
  assert.equal(sha256(document), release.indexSha256, "The HTML and release marker belong to different builds");
  const asset = document.match(/<script\b[^>]*\bsrc="(\/assets\/[^"?#]+\.js)"/)?.[1];
  assert.ok(asset, "Missing compiled application entry");
  const script = await get(asset, 200, {}, true);
  assert.match(script.headers.get("content-type") ?? "", /(?:javascript|ecmascript)/);
  await script.body?.cancel();
  for (const path of ["/.env.local", "/src/main.jsx", "/scripts/prepare-build.mjs", "/research/localization-pilot/cat.json", "/validated.json", "/missing-verification.mp3"])
    await (await get(path, 404)).body?.cancel();
  const clip = narration.sample;
  assert.match(clip, /^\/narration\/clip-[a-f0-9]{64}\.mp3$/);
  const audio = await get(clip, 206, { Range: "bytes=0-99" });
  assert.match(audio.headers.get("content-type") ?? "", /audio\/mpeg/);
  assert.match(audio.headers.get("content-range") ?? "", /^bytes 0-99\/[1-9]\d*$/);
  assert.equal((await audio.arrayBuffer()).byteLength, 100, "Audio range body length");
  return { release, checks };
}
