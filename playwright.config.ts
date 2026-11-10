import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://localhost:8787",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (process.env.CI ? undefined : "/usr/bin/chromium"),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  workers: 1,
  reporter: "list",
});
