import { test, expect } from "@playwright/test";
import { audioSilent } from "./fixtures.js";

test("a failed compiled studio download retries from the language picker without starting audio", async ({ page }) => {
  const studio = "**/assets/App-*.js";
  let blocked = 0;
  await page.route(studio, route => { blocked++; return route.abort("failed"); });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
  await page.getByRole("button", { name: "English British", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(blocked).toBeGreaterThan(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator("audio")).toHaveCount(0);
  await page.unroute(studio);
  await page.getByRole("button", { name: "English British", exact: true }).click();
  await expect(page.locator(".catalogue-page")).toBeVisible();
  await expect.poll(() => audioSilent(page)).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a failed compiled drawing download pauses and recovers after a supervised restart", async ({ page }) => {
  const board = "**/assets/DemonstrationBoard-*.js";
  let blocked = 0;
  await page.route(board, route => { blocked++; return route.abort("failed"); });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
  await page.getByRole("button", { name: "Nederlands Dutch", exact: true }).click();
  await page.locator("button.drawing-choice").first().click();
  await page.locator(".entry-supervision input").check();
  await page.locator(".entry-confirmation-actions .primary").click();
  await expect(page.locator(".pause-modal")).toBeVisible();
  expect(blocked, "the compiled board request was actually interrupted").toBeGreaterThan(0);
  await expect.poll(() => audioSilent(page)).toBe(true);
  await expect(page.locator(".pause-modal .primary")).toBeDisabled();
  await page.locator(".pause-modal input").check();
  await page.locator(".pause-modal .primary").click();
  await expect(page.locator(".demonstration-unavailable")).toContainText("De tekendemonstratie is niet beschikbaar.");
  await page.unroute(board);
  await page.locator(".session-strip button").first().click();
  await page.locator(".finished-actions .quiet-button").first().click();
  await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
  await page.locator(".entry-supervision input").check();
  await page.locator(".entry-confirmation-actions .primary").click();
  await expect(page.locator(".demonstration-board")).toBeVisible();
  await expect(page.locator(".demonstration-unavailable")).toHaveCount(0);
});

test("a failed compiled language download retries without changing language early", async ({ page }) => {
  const languageModule = "**/assets/german-lessons-*.js";
  let blocked = 0;
  await page.route(languageModule, route => { blocked++; return route.abort("failed"); });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
  await page.getByRole("button", { name: "Deutsch German", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(blocked, "the compiled language request was actually interrupted").toBeGreaterThan(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await page.unroute(languageModule);
  await page.getByRole("button", { name: "Deutsch German", exact: true }).click();
  await expect(page.locator(".catalogue-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
