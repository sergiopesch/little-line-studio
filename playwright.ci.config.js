import { defineConfig } from "@playwright/test";
import local from "./playwright.config.js";

export default defineConfig({
  ...local,
  forbidOnly: true,
  // Each CI job owns one browser project and its full runner resources.
  workers: 1,
  reporter: [...local.reporter, ["json", { outputFile: "output/playwright/browser.json" }]],
});
