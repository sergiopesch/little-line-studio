import { test, expect, enterLesson } from "./fixtures.js";

const drawing = page => page.locator(".demonstration-board [data-shape-type='draw']");
const snapshot = page => drawing(page).evaluateAll(nodes => nodes.map(node => ({
  id: node.getAttribute("data-shape-id"),
  transform: node.style.transform,
  opacity: getComputedStyle(node).opacity,
  paths: [...node.querySelectorAll("path")].map(path => path.getAttribute("d")),
})));
const visibleCount = page => drawing(page).evaluateAll(nodes => nodes.filter(node => Number(getComputedStyle(node).opacity) > 0).length);

test("native drawing stays read-only and still replay preserves the current mark without revealing future marks", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLesson(page);
  await page.getByRole("button", { name: "More time", exact: true }).click();
  const board = page.locator(".demonstration-board");
  await expect.poll(() => visibleCount(page)).toBeGreaterThan(100);
  const reference = await snapshot(page);
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Delete");
  await expect.poll(() => snapshot(page)).toEqual(reference);
  expect(await board.locator("pattern[id*='crayon']").count()).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("reference.png"), fullPage: true });

  await page.getByRole("button", { name: "Ready for next", exact: true }).click();
  await page.getByRole("button", { name: "More time", exact: true }).click();
  await expect.poll(() => visibleCount(page)).toBe(1);
  const current = await snapshot(page);
  await page.getByRole("button", { name: "Show again", exact: true }).click();
  await expect.poll(() => snapshot(page)).toEqual(current);
  await expect.poll(() => visibleCount(page)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("current-mark.png"), fullPage: true });
});
