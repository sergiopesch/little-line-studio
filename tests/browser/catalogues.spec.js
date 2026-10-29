import { test, expect } from "./fixtures.js";
import { UI_DICTIONARIES } from "../../src/ui-translations.js";

for (const [name, locale, setupTitle] of [
  ["English British", "en-GB", "Ready to draw together?"],
  ["English Irish", "en-IE", "Ready to draw together?"],
  ["English Scottish", "en-GB-x-scotland", "Ready to draw together?"],
  ["Castellano Latinoamérica", "es-419", "¿Listos para dibujar juntos?"],
  ["Castellano España", "es-ES", "¿Listos para dibujar juntos?"],
  ["Français French", "fr-FR", "Prêts à dessiner ensemble ?"],
  ["Deutsch German", "de-DE", "Bereit, gemeinsam zu zeichnen?"],
  ["Italiano Italian", "it-IT", "Pronti a disegnare insieme?"],
  ["Nederlands Dutch", "nl-NL", "Klaar om samen te tekenen?"],
]) {
  test(`${name}: all collections and a real voice sample`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".home-page")).toBeVisible();
    await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".catalogue-page")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    for (let level = 0; level < 3; level++) {
      await page.locator(".level-tabs button").nth(level).click();
      const labels = [];
      for (let index = 0; index < 3; index++) {
        await expect(page.locator(".drawing-choice--preparing")).toHaveCount(0);
        await expect(page.locator("button.drawing-choice")).toHaveCount(index < 2 ? 4 : 2);
        labels.push(...await page.locator("button.drawing-choice").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label"))));
        if (index < 2) await page.locator(".catalogue-pagination button").last().click();
      }
      expect(new Set(labels).size).toBe(10);
      await expect(page.locator(".catalogue-pagination button").last()).toBeDisabled();
    }
    await page.locator(".level-tabs button").first().click();
    await page.locator("button.drawing-choice").first().click();
    await expect(page.getByRole("heading", { name: setupTitle, exact: true })).toBeVisible();
    await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
    await page.locator("details.entry-sound summary").click();
    await page.locator(".entry-sound-check").first().click();
    await expect.poll(() => page.locator("audio").first().evaluate(audio => !audio.paused && audio.currentTime > 0.2 && audio.duration > 0)).toBe(true);
    await expect(page.locator(".entry-sound-check").first()).toHaveText(UI_DICTIONARIES[locale]?.["setup.stopVoicePreview"] ?? "Stop voice check");
    await page.locator(".entry-sound-check").first().click();
    await expect.poll(() => page.locator("audio").first().evaluate(audio => audio.paused)).toBe(true);
    await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
