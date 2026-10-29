import AxeBuilder from "@axe-core/playwright";
import { expect } from "./fixtures.js";

export async function auditAccessibility(page, testInfo, state) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  await testInfo.attach(`accessibility-${state}`, {
    body: JSON.stringify({ state, engine: result.testEngine, url: result.url,
      violations: result.violations, incomplete: result.incomplete }), contentType: "application/json",
  });
  expect(result.violations, `${state}: automatically detectable accessibility issues`).toEqual([]);
}

export async function expectReflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal page scrolling").toBe(true);
  const dialog = page.locator("dialog[open]");
  if (await dialog.count())
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), "no horizontal dialog scrolling").toBe(true);
}

// Visibility alone does not detect labels painting over another card or controls
// hidden under a fixed footer. Check their actual painted text and hit target.
export async function expectReachableControls(page, scope) {
  // Keep element identities: the SDK's responsive watermark can disappear after
  // a resize, shifting every later nth() locator in a live visibility query.
  const controls = await scope.locator("button:visible, input:visible, summary:visible, a:visible").elementHandles();
  try {
    for (const control of controls) {
      if (!await control.isVisible()) continue;
      try {
        await control.scrollIntoViewIfNeeded({ timeout: 5000 });
      } catch (error) {
        if (!await control.isVisible()) continue;
        throw error;
      }
      const result = await control.evaluate(node => {
        if (!node.isConnected || !node.checkVisibility()) return null;
        const target = node.matches('input[type="checkbox"], input[type="radio"]') ? node.closest("label") ?? node : node;
        const box = target.getBoundingClientRect();
        const x = Math.max(0, Math.min(innerWidth - 1, box.x + box.width / 2));
        const y = Math.max(0, Math.min(innerHeight - 1, box.y + box.height / 2));
        const hit = document.elementFromPoint(x, y);
        const clipped = [];
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        for (let text; (text = walker.nextNode());) {
          const parent = text.parentElement;
          const style = getComputedStyle(parent);
          if (!text.textContent.trim() || !parent.checkVisibility() || parseFloat(style.fontSize) === 0 || parent.closest("svg")) continue;
          const range = document.createRange();
          range.selectNodeContents(text);
          for (const rect of range.getClientRects()) {
            if (rect.width && rect.height && (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 2 || rect.bottom > box.bottom + 2))
              clipped.push(text.textContent.trim());
          }
        }
        return { label: node.getAttribute("aria-label") || node.textContent.trim(), clipped,
          reachable: Boolean(hit && target.contains(hit)), width: box.width, height: box.height };
      });
      if (!result) continue;
      expect(result.clipped, `${result.label}: text remains within its control`).toEqual([]);
      expect(result.reachable, `${result.label}: control is reachable after scrolling`).toBe(true);
      expect(result.width, `${result.label}: minimum target width`).toBeGreaterThanOrEqual(24);
      expect(result.height, `${result.label}: minimum target height`).toBeGreaterThanOrEqual(24);
    }
  } finally {
    await Promise.all(controls.map(control => control.dispose()));
  }
}

export async function tabTo(page, target) {
  await expect(target).toBeVisible();
  // Firefox can leave Tab at browser chrome rather than wrapping the page.
  // Move backwards to controls before the current element in document order.
  const key = await target.evaluate(node =>
    node.compareDocumentPosition(document.activeElement) & Node.DOCUMENT_POSITION_FOLLOWING)
    ? "Shift+Tab" : "Tab";
  for (let i = 0; i < 45; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target, "reachable using Tab without programmatic focus").toBeFocused();
}
