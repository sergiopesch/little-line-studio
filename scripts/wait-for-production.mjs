import { setTimeout as sleep } from "node:timers/promises";
import { checkProductionHttp, ProductionPropagationError } from "./production-checks.mjs";

// Two consecutive, identical builds must pass the entire HTTP gate. A marker
// alone can reach an edge before its matching HTML. Any transient resets this
// streak; security failures never enter the retry loop.
export async function waitForProduction(target, {
  timeoutMs = 600000, intervalMs = 10000, fetcher = fetch,
  now = Date.now, delay = sleep, log = console.log,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 900000 ||
      !Number.isInteger(intervalMs) || intervalMs < 1) throw new Error("Invalid deployment wait duration");
  const deadline = now() + timeoutMs;
  let last = "No release received", reported, previous = null, attempts = 0;
  while (now() < deadline) {
    attempts++;
    try {
      const result = await checkProductionHttp(target, fetcher, {
        propagation: true, signal: AbortSignal.timeout(Math.max(1, deadline - now())),
      });
      if (now() >= deadline) break;
      if (previous?.release.indexSha256 === result.release.indexSha256)
        return { ...result, readiness: { attempts, stableSamples: 2, intervalMs } };
      previous = result;
      last = "Expected release passed HTTP checks; confirming stability";
    } catch (error) {
      if (!(error instanceof ProductionPropagationError)) throw error;
      previous = null;
      last = error.message;
    }
    if (last !== reported) { log(`${last}; waiting for ${target.commit}`); reported = last; }
    const remaining = deadline - now();
    if (remaining > 0) await delay(Math.min(intervalMs, remaining));
  }
  throw new Error(`Timed out waiting for production commit ${target.commit}. ${last}`);
}
