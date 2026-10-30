import { defineConfig } from "@playwright/test";
import projects from "./config/browser-projects.json" with { type: "json" };

export default defineConfig({
  testDir: "./tests/browser",
  testIgnore: "production-recovery.spec.js",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: "output/playwright/results",
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5186",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects,
  // A dedicated server avoids accidentally testing another checkout or the no-key build.
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5186 --strictPort",
    url: "http://127.0.0.1:5186",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
