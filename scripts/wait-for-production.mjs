import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { verifyRelease } from "./production-checks.mjs";

// Wait only for deployment propagation. Once the expected revision appears,
// the strict verifier still checks its HTML, headers, media and browser flows.
export async function waitForProduction(target, {
  timeoutMs = 600000, intervalMs = 10000, fetcher = fetch,
  now = Date.now, delay = sleep, log = console.log,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 900000 ||
      !Number.isInteger(intervalMs) || intervalMs < 1) throw new Error("Invalid deployment wait duration");
  const deadline = now() + timeoutMs;
  let last = "No release marker received", reported;
  while (now() < deadline) {
    let response;
    try {
      response = await fetcher(new URL(`/release.json?verification=${randomUUID()}`, target.origin), {
        redirect: "manual", headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - now()))),
      });
    } catch { last = "Release marker request failed or timed out"; }
    if (response) {
      if (response.status === 200) {
        const release = await response.json();
        if (release.revision === target.commit) return verifyRelease(release, target.commit);
        if (release.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(release.revision ?? ""))
          throw new Error("Production returned an invalid release identity");
        last = `Production still serves ${release.revision}`;
      } else {
        await response.body?.cancel();
        if (response.status !== 404 && response.status < 500)
          throw new Error(`Production returned HTTP ${response.status}; redirects and protected deployments are rejected`);
        last = `Release marker returned HTTP ${response.status}`;
      }
    }
    if (last !== reported) { log(`${last}; waiting for ${target.commit}`); reported = last; }
    const remaining = deadline - now();
    if (remaining > 0) await delay(Math.min(intervalMs, remaining));
  }
  throw new Error(`Timed out waiting for production commit ${target.commit}. ${last}`);
}
