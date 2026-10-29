import { defineConfig } from "@playwright/test";
import local from "./playwright.config.js";

if (!process.env.LLS_PRODUCTION_URL || !process.env.LLS_PRODUCTION_OUTPUT)
  throw new Error("Use npm run verify:production -- --url <origin> --commit <full SHA>.");

export default defineConfig({
  ...local,
  forbidOnly: true,
  // Production recovery targets compiled chunks; local import-failure tests
  // remain in the development suite.
  testMatch: ["accessibility.spec.js", "catalogues.spec.js", "family-controls.spec.js", "drawing-renderer.spec.js", "production-recovery.spec.js", "startup-loading.spec.js"],
  testIgnore: [],
  outputDir: `${process.env.LLS_PRODUCTION_OUTPUT}/artifacts`,
  reporter: [["list"], ["json", { outputFile: `${process.env.LLS_PRODUCTION_OUTPUT}/browser.json` }]],
  use: { ...local.use, baseURL: process.env.LLS_PRODUCTION_URL },
  webServer: undefined,
});
