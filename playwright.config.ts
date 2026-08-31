import { defineConfig, devices } from "@playwright/test";

const isWindows = process.platform === "win32";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30000,
  use: {
    baseURL: "http://localhost:4567",
    trace: "on-first-retry",
    viewport: { width: 1260, height: 820 },
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    {
      name: "msedge",
      use: {
        ...devices["Desktop Edge"],
        // On Windows use native Microsoft Edge / WebView2 runtime; fallback to chromium on other platforms
        channel: isWindows ? "msedge" : "chromium",
        viewport: { width: 1260, height: 820 },
      },
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1260, height: 820 },
      },
    },
  ],

  webServer: {
    command: "bun tests/e2e/fixtures/serve.ts",
    url: "http://localhost:4567",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
