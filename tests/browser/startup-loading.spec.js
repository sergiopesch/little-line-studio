import { test, expect, audioSilent } from "./fixtures.js";

test("slow studio loading stays silent, can be canceled, and commits only the latest choice", async ({ page }) => {
  const studio = /\/(?:src\/App\.jsx|assets\/App-[^/]+\.js)(?:\?.*)?$/;
  const heavyRequests = [];
  page.on("request", request => {
    if (studio.test(request.url()) || /DemonstrationBoard|\/narration\/.*\.mp3/.test(request.url()))
      heavyRequests.push(request.url());
  });
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  let releaseGerman;
  const germanDelay = new Promise(resolve => { releaseGerman = resolve; });
  const german = /\/(?:src\/german-lessons\.js|assets\/german-lessons-[^/]+\.js)(?:\?.*)?$/;
  await page.route(german, async route => { await germanDelay; await route.continue(); });
  let waiting = false;
  await page.route(studio, async route => { waiting = true; await delay; await route.continue(); });
  try {
    await page.goto("/");
    const basic = page.getByRole("button", { name: /^Basic drawing 10 drawings Explore(?: Basic)?$/ });
    await expect(basic).toBeVisible();
    expect(heavyRequests, "home does not request the studio, board or recordings").toEqual([]);
    await basic.click();
    await expect.poll(() => waiting).toBe(true);
    await page.getByRole("button", { name: "English British", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Loading lessons…");
    await expect.poll(() => audioSilent(page)).toBe(true);
    await page.getByRole("button", { name: "Close dialog", exact: true }).click();
    await expect(basic).toBeFocused();
    const response = page.waitForResponse(response => studio.test(response.url()));
    release();
    await (await response).finished();
    await expect(page.locator(".home-page")).toBeVisible();
    await expect(page.locator(".catalogue-page")).toHaveCount(0);
    await expect(page.locator("audio")).toHaveCount(0);
    await page.getByRole("button", { name: /^Intermediate drawing 10 drawings Explore(?: Intermediate)?$/ }).click();
    await page.getByRole("button", { name: "Deutsch German", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Loading lessons…");
    await page.getByRole("button", { name: "English British", exact: true }).click();
    await expect(page.locator(".catalogue-page")).toBeVisible();
    const germanResponse = page.waitForResponse(response => german.test(response.url()));
    releaseGerman();
    await (await germanResponse).finished();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(page.getByRole("button", { name: "Intermediate", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => audioSilent(page)).toBe(true);
  } finally {
    release();
    releaseGerman();
  }
});
