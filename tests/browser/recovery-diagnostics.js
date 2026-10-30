import { test as base, expect } from "@playwright/test";
import { UNEXPECTED_DELAY_MS } from "../../src/scripted-session.js";

// Test-only, bounded diagnostics. No application instrumentation or network log.
export const test = base.extend({
  recoveryDiagnostics: [async ({ page }, use, testInfo) => {
    await page.addInitScript(({ delayThreshold }) => {
      const events = [];
      const record = (kind, detail = {}) => {
        events.push({ atMs: Math.round(performance.now()), kind, ...detail,
          hidden: document.hidden,
          pauseDialog: Boolean(document.querySelector(".pause-modal")),
          supervised: document.querySelector(".pause-modal input")?.checked ?? null,
          notice: document.querySelector(".toast")?.textContent?.slice(0, 160) ?? null,
          audio: [...document.querySelectorAll("audio")].map(audio => ({ paused: audio.paused,
            readyState: audio.readyState, networkState: audio.networkState, error: audio.error?.code ?? null })),
        });
        if (events.length > 100) events.shift();
      };
      window.__trazolinoRecoveryDiagnostics = () => {
        record("capture");
        return events;
      };
      document.addEventListener("visibilitychange", () => record("visibility"));
      for (const kind of ["focus", "blur"]) window.addEventListener(kind, () => record(kind));
      for (const kind of ["play", "pause", "ended", "error", "waiting", "stalled", "abort"])
        document.addEventListener(kind, event => {
          if (event.target instanceof HTMLMediaElement) record(`media:${kind}`);
        }, true);
      document.addEventListener("click", event => {
        const control = event.target instanceof Element && event.target.closest("button,input");
        if (!control) return;
        const detail = { control: control.tagName, classes: control.className, type: control.getAttribute("type") };
        record("click", detail);
        setTimeout(() => record("after-click", detail), 0);
      }, true);
      let last = performance.now();
      setInterval(() => {
        const now = performance.now(), elapsedMs = now - last;
        last = now;
        if (elapsedMs > delayThreshold) record("delayed-task", { elapsedMs: Math.round(elapsedMs) });
      }, 250);
      record("installed");
    }, { delayThreshold: UNEXPECTED_DELAY_MS });
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      const events = await page.evaluate(() => window.__trazolinoRecoveryDiagnostics?.() ?? [])
        .catch(() => [{ kind: "page-unavailable" }]);
      await testInfo.attach("recovery-lifecycle", { body: JSON.stringify(events), contentType: "application/json" });
    }
  }, { auto: true }],
});
export { expect };
