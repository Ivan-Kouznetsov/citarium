import { test as baseTest, expect, Page } from "@playwright/test";

export type SupportedPlatform = "win32" | "darwin" | "linux";

/**
 * Returns whether the current host matches the target OS platform
 */
export function isHostPlatform(target: SupportedPlatform): boolean {
  return process.platform === target;
}

/**
 * Current host platform mapped to app platform identifier
 */
export const CURRENT_PLATFORM: "windows" | "mac" | "linux" =
  process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux";

export function getCurrentPlatform(): "windows" | "mac" | "linux" {
  return CURRENT_PLATFORM;
}

/**
 * Returns appropriate modifier key depending on OS:
 * 'Meta' (Cmd) on macOS, 'Control' (Ctrl) on Windows/Linux
 */
export function getOsModifierKey(): "Meta" | "Control" {
  return process.platform === "darwin" ? "Meta" : "Control";
}


/**
 * Skips test if not running on the specified host OS
 */
export function skipUnlessHost(platform: SupportedPlatform, reason?: string) {
  const current = process.platform;
  baseTest.skip(
    current !== platform,
    reason || `This test requires host platform ${platform} (current: ${current})`
  );
}

/**
 * Custom fixture extension providing platform helper methods to tests
 */
export const test = baseTest.extend<{
  openWithPlatform: (platform: "windows" | "mac" | "linux", queryParams?: Record<string, string>) => Promise<Page>;
}>({
  openWithPlatform: async ({ page }, use) => {
    await use(async (platform, queryParams = {}) => {
      const params = new URLSearchParams({ platform, ...queryParams });
      await page.goto(`/?${params.toString()}`);
      await page.waitForLoadState("domcontentloaded");
      return page;
    });
  },
});

export { expect };
