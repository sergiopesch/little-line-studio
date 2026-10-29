import { test, expect } from "@playwright/test";
import { enterLesson, audioSilent } from "./fixtures.js";

test("a failed board pauses safely and loads after restarting the lesson", async ({ page }) => {
  await page.goto("/");
  const boardModule = "**/src/DemonstrationBoard.jsx";
  await page.route(boardModule, route => route.abort("failed"));
  await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
  await page.getByRole("button", { name: "Nederlands Dutch", exact: true }).click();
  await page.locator("button.drawing-choice").first().click();
  await page.locator(".entry-supervision input").check();
  await page.locator(".entry-confirmation-actions .primary").click();
  await expect(page.locator(".pause-modal")).toBeVisible();
  await expect.poll(() => page.locator("audio").evaluateAll(nodes => nodes.every(audio => audio.paused))).toBe(true);
  await expect(page.locator(".pause-modal .primary")).toBeDisabled();
  await page.locator(".pause-modal input[type=checkbox]").check();
  await page.locator(".pause-modal .primary").click();
  await expect(page.locator(".ready-button")).toBeEnabled();
  await expect(page.locator(".demonstration-unavailable")).toContainText("De tekendemonstratie is niet beschikbaar.");
  await expect(page.locator(".demonstration-unavailable")).toContainText("Jullie kunnen samen verder met de geschreven aanwijzingen.");

  await page.unroute(boardModule);
  await page.locator(".session-strip button").first().click();
  await page.locator(".finished-actions .quiet-button").first().click();
  await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
  await page.locator(".entry-supervision input").check();
  await page.locator(".entry-confirmation-actions .primary").click();
  await expect(page.locator(".demonstration-board")).toBeVisible();
  await expect(page.locator(".demonstration-unavailable")).toHaveCount(0);
  await expect(page.locator(".pause-modal")).toHaveCount(0);
});

test("failed narration pauses and permits supervised written instructions", async ({ page }) => {
  await page.route("**/narration/*.mp3", route => route.abort("failed"));
  await enterLesson(page, "Castellano Latinoamérica");
  await expect(page.locator(".pause-modal .quiet-button")).toBeVisible();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await expect(page.locator(".pause-modal .quiet-button")).toBeDisabled();
  await page.locator(".pause-modal input").check();
  await page.locator(".pause-modal .quiet-button").click();
  await expect(page.locator(".pause-modal")).toHaveCount(0);
  await expect(page.locator(".ready-button")).toBeEnabled();
  expect(await page.locator("audio").first().evaluate(audio => audio.paused)).toBe(true);
});

test("a failed language download can be retried without changing language early", async ({ page }) => {
  await page.goto("/");
  const module = "**/src/german-lessons.js";
  await page.route(module, route => route.abort("failed"));
  await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
  await page.getByRole("button", { name: "Deutsch German", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await page.unroute(module);
  await page.getByRole("button", { name: "Deutsch German", exact: true }).click();
  await expect(page.locator(".catalogue-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
