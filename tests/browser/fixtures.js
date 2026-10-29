import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  cleanConsole: [async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await use();
    expect(errors, "unexpected browser errors").toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function enterLesson(page, language = "English British") {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Basic drawing: 10 drawings", exact: true }).click();
  await page.getByRole("button", { name: language, exact: true }).click();
  await page.locator("button.drawing-choice").first().click();
  await expect(page.locator(".entry-confirmation-actions .primary")).toBeDisabled();
  await page.locator(".entry-supervision input").check();
  await page.locator(".entry-confirmation-actions .primary").click();
  await expect(page.locator(".demonstration-board")).toBeVisible();
}

export const audioSilent = page => page.locator("audio").evaluateAll(nodes => nodes.every(audio => audio.paused));
