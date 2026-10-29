import { test, expect, enterLesson, audioSilent } from "./fixtures.js";

test("the music level falls beneath a Help hint and recovers without restarting", async ({ page }, testInfo) => {
  await enterLesson(page);
  const music = page.locator("audio").last();
  await expect.poll(() => page.locator("audio").evaluateAll(nodes => nodes.every(audio => !audio.paused && audio.currentTime > 2))).toBe(true);
  const teaching = await music.evaluate(audio => audio.volume);
  expect(teaching).toBeGreaterThan(0);
  // Help during an instruction is already ducked. Hold the first stage and
  // let its actual recording finish so this checks a real quiet-to-hint change.
  await page.getByRole("button", { name: "More time", exact: true }).click();
  await expect.poll(() => page.locator("audio").first().evaluate(audio => audio.paused), { timeout: 30000 }).toBe(true);
  await expect.poll(() => music.evaluate(audio => audio.volume)).toBeGreaterThan(teaching * 2);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const quiet = await music.evaluate(audio => ({ volume: audio.volume, time: audio.currentTime, source: audio.src }));
  await page.getByRole("button", { name: "Hear the hint", exact: true }).click();
  await expect.poll(() => page.locator("audio").first().evaluate(audio => !audio.paused && audio.currentTime > 0.2)).toBe(true);
  await expect.poll(() => music.evaluate(audio => audio.volume)).toBeLessThan(quiet.volume * 0.8);
  const hint = await music.evaluate(audio => ({ volume: audio.volume, time: audio.currentTime, source: audio.src, paused: audio.paused }));
  expect(hint.paused).toBe(false);
  expect(hint.source).toBe(quiet.source);
  expect(hint.time).toBeGreaterThan(quiet.time);
  await page.getByRole("button", { name: "Stop hint", exact: true }).click();
  await expect.poll(() => music.evaluate(audio => audio.volume)).toBeGreaterThan(hint.volume * 1.5);
  await testInfo.attach("music-transition", { body: JSON.stringify({ teaching, quiet, hint }), contentType: "application/json" });
});

test("Help preserves music; pause, settings and finish preserve family control", async ({ page }, testInfo) => {
  await enterLesson(page);
  await expect.poll(() => page.locator("audio").evaluateAll(nodes => nodes.every(audio => !audio.paused && audio.currentTime > 0.2))).toBe(true);
  const music = page.locator("audio").last();
  const source = await music.getAttribute("src");
  const beforeHelp = await music.evaluate(audio => audio.currentTime);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect.poll(() => page.locator("audio").first().evaluate(audio => audio.paused)).toBe(true);
  await expect.poll(() => music.evaluate((audio, previous) => !audio.paused && audio.currentTime > previous, beforeHelp)).toBe(true);
  await page.getByRole("button", { name: "Hear the hint", exact: true }).click();
  await expect.poll(() => page.locator("audio").first().evaluate(audio => !audio.paused && audio.currentTime > 0.2)).toBe(true);
  await expect(music).toHaveAttribute("src", source);
  expect(await music.evaluate(audio => audio.paused)).toBe(false);
  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "More time", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue lesson", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause lesson", exact: true }).click();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Continue together", exact: true })).toBeDisabled();
  await page.locator(".pause-modal input").check();
  await page.getByRole("button", { name: "Continue together", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue lesson", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Parent settings", exact: true }).click();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await page.getByRole("tab", { name: "Sound", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Drawing", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("switch", { name: "Use still demonstrations", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Show again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue lesson", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("lesson.png"), fullPage: true });
  await page.getByRole("button", { name: "Finish for now", exact: true }).click();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await page.getByRole("button", { name: "Keep drawing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue together", exact: true })).toBeDisabled();
});

test("hiding a Spanish lesson pauses immediately and requires the adult again", async ({ page }) => {
  await enterLesson(page, "Castellano Latinoamérica");
  await expect.poll(() => page.locator("audio").first().evaluate(audio => !audio.paused && audio.currentTime > 0.2)).toBe(true);
  const step = await page.locator(".instruction-meta .eyebrow").innerText();
  // Deterministic delivery of the browser lifecycle event; real device locking is a separate check.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".pause-modal")).toBeVisible();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await expect(page.locator(".pause-modal .primary")).toBeDisabled();
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.locator(".pause-modal .primary")).toBeDisabled();
  await page.locator(".pause-modal input").check();
  await page.locator(".pause-modal .primary").click();
  await expect(page.locator(".pause-modal")).toHaveCount(0);
  await expect(page.locator(".instruction-meta .eyebrow")).toHaveText(step);
});
