import { test as base, expect } from "@playwright/test";
import { expectedBlockedDiagnostic } from "./console-policy.js";

export const test = base.extend({
  cleanConsole: [async ({ page }, use, testInfo) => {
    const errors = [], consoleErrors = [];
    await page.addInitScript(() => {
      window.__llsTestPolicyViolations = [];
      document.addEventListener("securitypolicyviolation", event => {
        let url;
        try { url = new URL(event.blockedURI); } catch { return; }
        window.__llsTestPolicyViolations.push({ origin: url.origin, pathname: url.pathname,
          directive: event.effectiveDirective, disposition: event.disposition });
      });
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await use();
    const violations = await page.evaluate(() => window.__llsTestPolicyViolations ?? []);
    const expected = consoleErrors.filter(message => expectedBlockedDiagnostic(message, violations));
    errors.push(...consoleErrors.filter(message => !expectedBlockedDiagnostic(message, violations)));
    if (expected.length) await testInfo.attach("blocked-optional-diagnostic", {
      body: JSON.stringify({ count: expected.length, violations }), contentType: "application/json",
    });
    expect(errors, "unexpected browser errors").toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function enterLesson(page, language = "English British") {
  await page.goto("/");
  await page.getByRole("button", { name: /^Basic drawing 10 drawings Explore(?: Basic)?$/ }).click();
  await page.getByRole("button", { name: language, exact: true }).click();
  await page.locator("button.drawing-choice").first().click();
  await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
  await page.locator(".entry-supervision input").check();
  await page.locator(".entry-confirmation-actions .primary").click();
  await expect(page.locator(".demonstration-board")).toBeVisible();
}

export const audioSilent = page => page.locator("audio").evaluateAll(nodes => nodes.every(audio => audio.paused));
