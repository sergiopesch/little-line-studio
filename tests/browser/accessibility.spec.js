import { test, expect, audioSilent } from "./fixtures.js";
import { LANGUAGES } from "../../src/languages.js";
import { translate } from "../../src/ui-translations.js";
import { auditAccessibility, expectReflow, expectReachableControls, tabTo } from "./accessibility-helpers.js";

const basic = page => page.getByRole("button", { name: /^Basic drawing 10 drawings Explore(?: Basic)?$/ });

for (const language of LANGUAGES) {
  test(`${language.id}: accessible names and controls survive zoom and landscape`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const t = text => translate(language.id, text);
    // 320 x 256 CSS pixels is the reflow equivalent of 1280 x 1024 at 400%.
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto("/");
    await basic(page).click();
    await page.getByRole("button", { name: `${language.name} ${language.region}`, exact: true }).click();
    const catalogue = page.locator(".catalogue-page");
    await expect(catalogue).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", language.id);
    await expectReflow(page);
    await expectReachableControls(page, catalogue);
    await auditAccessibility(page, testInfo, "catalogue");
    await page.locator(".drawing-choice").first().click();
    await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
    await page.locator(".entry-sound summary").click();
    await expectReflow(page);
    await expectReachableControls(page, page.locator("main"));
    await auditAccessibility(page, testInfo, "adult-setup");
    // Use the real opt-outs. Accessibility scanning must not start narration.
    await page.locator(".entry-sound-choice input").first().uncheck();
    await page.locator(".entry-sound-choice input").last().uncheck();
    await page.locator(".entry-supervision input").check();
    await page.locator(".entry-confirmation-actions .primary").click();
    await expect(page.locator(".demonstration-board")).toBeVisible();
    await page.getByRole("button", { name: t("lesson.moreTime"), exact: true }).click();
    await expect.poll(() => audioSilent(page)).toBe(true);
    // Desktop exposes the full text labels; compact layouts use the same names.
    await page.setViewportSize({ width: 1280, height: 900 });
    await auditAccessibility(page, testInfo, "lesson");
    for (const viewport of [{ width: 640, height: 512 }, { width: 320, height: 256 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await expectReflow(page);
      for (const control of await page.locator(".topbar button, .lesson-toolbar button, .listen-button, .session-strip button").all())
        await expect(control, "lesson controls remain available after resizing").toBeVisible();
      await expect.poll(() => page.locator(".demonstration-board").evaluate(node => node.getBoundingClientRect().height), { message: "board retains useful drawing space" }).toBeGreaterThanOrEqual(120);
      await expectReachableControls(page, page.locator("main"));
    }
    await page.setViewportSize({ width: 320, height: 256 });
    const help = page.getByRole("button", { name: t("Help"), exact: true });
    await help.click();
    await expectReflow(page);
    await expectReachableControls(page, page.getByRole("dialog"));
    await auditAccessibility(page, testInfo, "help");
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
    const settings = page.getByRole("button", { name: `${t("Grown-ups")}: ${t("Parent settings")}`, exact: true });
    await settings.click();
    const dialog = page.getByRole("dialog");
    await expectReachableControls(page, dialog);
    await expectReflow(page);
    await auditAccessibility(page, testInfo, "settings-sound");
    await page.getByRole("tab", { name: t("Drawing"), exact: true }).click();
    await expectReachableControls(page, dialog);
    await expectReflow(page);
    await auditAccessibility(page, testInfo, "settings-drawing");
    await page.keyboard.press("Escape");
    await expect(settings).toBeFocused();
    await expect.poll(() => audioSilent(page)).toBe(true);
  });
}

test("homepage, information dialogs and language picker pass automated accessibility checks", async ({ page }, testInfo) => {
  await page.goto("/");
  await auditAccessibility(page, testInfo, "home");
  for (const name of ["How it works", "For grown-ups"]) {
    await page.getByRole("button", { name, exact: true }).filter({ visible: true }).click();
    await auditAccessibility(page, testInfo, name);
    await page.keyboard.press("Escape");
  }
  await basic(page).click();
  await auditAccessibility(page, testInfo, "language-picker");
});

// Verify native keyboard behavior in a fresh context without scanner instrumentation.
test("keyboard-only entry, lesson and dialogs preserve family control", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(page).toHaveTitle(/Little Line Studio/);
  await expect(page.locator("#home-title")).toBeFocused();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  for (const name of ["How it works", "For grown-ups"]) {
    const opener = page.getByRole("button", { name, exact: true }).filter({ visible: true });
    await tabTo(page, opener);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading").first()).toBeFocused();
    await tabTo(page, dialog.getByRole("button", { name: "Close dialog", exact: true }));
    await page.keyboard.press("Shift+Tab");
    // Native dialogs may allow focus into browser chrome. They must never
    // let Tab activate the inert page behind the dialog.
    expect(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement.closest("dialog"))), "background controls stay inert").toBe(true);
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  }
  await tabTo(page, basic(page));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose your language", exact: true })).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "English British", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.locator("#catalogue-title")).toBeFocused();
  await tabTo(page, page.locator("button.drawing-choice").first());
  await page.keyboard.press("Enter");
  await expect(page.locator("#setup-title")).toBeFocused();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
  await tabTo(page, page.locator(".entry-supervision input"));
  await page.keyboard.press("Space");
  await expect(page.locator(".entry-confirmation-actions .primary")).toBeEnabled();
  await tabTo(page, page.locator(".entry-sound summary"));
  await page.keyboard.press("Enter");
  for (const input of await page.locator(".entry-sound-choice input").all()) {
    await tabTo(page, input);
    await page.keyboard.press("Space");
    await expect(input).not.toBeChecked();
  }
  await tabTo(page, page.locator(".entry-confirmation-actions .primary"));
  await page.keyboard.press("Enter");
  await expect(page.locator(".demonstration-board")).toBeVisible();
  await expect(page.locator(".instruction h1")).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "More time", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Continue lesson", exact: true })).toBeVisible();
  const help = page.getByRole("button", { name: "Help", exact: true });
  await tabTo(page, help);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByRole("heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  const settings = page.getByRole("button", { name: "Grown-ups: Parent settings", exact: true });
  await tabTo(page, settings);
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("tab", { name: "Sound", exact: true }));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Drawing", exact: true })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Drawing", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Sound", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Drawing", exact: true })).toBeFocused();
  await tabTo(page, page.getByRole("switch", { name: "Use still demonstrations", exact: true }));
  await page.keyboard.press("Space");
  await expect(page.getByRole("switch", { name: "Use still demonstrations", exact: true })).toHaveAttribute("aria-checked", "true");
  await tabTo(page, page.getByRole("button", { name: "Done", exact: true }));
  await page.keyboard.press("Enter");
  await expect(settings).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "Pause: Pause lesson", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Continue together", exact: true })).toBeDisabled();
  await tabTo(page, page.locator(".pause-modal input"));
  await page.keyboard.press("Space");
  await tabTo(page, page.getByRole("button", { name: "Continue together", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Continue lesson", exact: true })).toBeVisible();
  await expect.poll(() => audioSilent(page)).toBe(true);
});
