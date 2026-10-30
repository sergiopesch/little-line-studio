import { test, expect } from "./fixtures.js";
import { auditAccessibility, expectReflow, expectReachableControls, tabTo } from "./accessibility-helpers.js";

test("About is reachable by keyboard and returns to the drawing choices", async ({ page }, testInfo) => {
  await page.goto("/");
  const about = page.getByRole("link", { name: "About", exact: true });
  await expect(about).toBeVisible();
  await tabTo(page, about);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/about\/$/);
  await expect(page).toHaveTitle("About — Trazolino");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, I’m Sergio.");
  const portrait = page.getByRole("img", { name: "Sergio Peschiera", exact: true });
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate(image => image.complete && image.naturalWidth === 400 && image.naturalHeight === 400)).toBe(true);
  await expect(page.getByRole("link", { name: "More about me" })).toHaveAttribute("href", "https://www.sergiopesch.com/about");
  await expect(page.locator("audio, video, iframe, vite-error-overlay")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Why I’m building Trazolino" })).toBeVisible();
  await auditAccessibility(page, testInfo, "about");
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 256 }]) {
    await page.setViewportSize(viewport);
    await expectReflow(page);
    await expectReachableControls(page, page.locator("body"));
  }
  await page.getByRole("link", { name: "Let’s draw together" }).click();
  await expect(page.locator("#home-title")).toBeVisible();
  await page.getByRole("button", { name: /^Basic drawing 10 drawings Explore(?: Basic)?$/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("About remains readable without JavaScript and loads only local resources", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    const requests = [];
    page.on("request", request => requests.push({ url: request.url(), type: request.resourceType() }));
    const response = await page.goto("/about/");
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, I’m Sergio.");
    await expect(page.getByText("The lessons are prepared in advance", { exact: false })).toBeVisible();
    expect(requests.every(request => new URL(request.url).origin === new URL(baseURL).origin)).toBe(true);
    expect(requests.some(request => ["script", "media"].includes(request.type))).toBe(false);
    await page.getByRole("link", { name: "Back to drawing", exact: true }).click();
    await expect(page).toHaveURL(baseURL + "/");
  } finally {
    await context.close();
  }
});
