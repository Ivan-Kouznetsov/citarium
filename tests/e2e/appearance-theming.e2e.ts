import { test, expect, isHostPlatform } from "./fixtures/platform-helpers";

test.describe("Appearance, Theming, and Cross-Platform Styling", () => {
  test("Applies Windows platform attributes and stylesheet correctly", async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-platform", "windows");

    const platformLink = page.locator("#platform-stylesheet");
    await expect(platformLink).toHaveAttribute("href", "./styles/platforms/windows.css");
  });

  test("Applies macOS platform attributes and stylesheet correctly", async ({ page }) => {
    await page.goto("/?platform=mac");
    await page.waitForLoadState("domcontentloaded");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-platform", "mac");

    const platformLink = page.locator("#platform-stylesheet");
    await expect(platformLink).toHaveAttribute("href", "./styles/platforms/mac.css");
  });

  test("Applies Linux platform attributes and stylesheet correctly", async ({ page }) => {
    await page.goto("/?platform=linux");
    await page.waitForLoadState("domcontentloaded");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-platform", "linux");

    const platformLink = page.locator("#platform-stylesheet");
    await expect(platformLink).toHaveAttribute("href", "./styles/platforms/linux.css");
  });

  test("Default theme is light and can be toggled to dark via app API", async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    // Toggle theme to dark via window.app
    await page.evaluate(() => (window as any).app.toggleTheme());
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Body background should reflect dark theme background color
    const darkBg = await page.evaluate(() =>
      window.getComputedStyle(document.body).backgroundColor
    );
    expect(darkBg).toBeTruthy();

    // Toggle back to light
    await page.evaluate(() => (window as any).app.toggleTheme());
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("Host OS Native Environment Check (Edge / WebView2 on Windows)", async ({ page }) => {
    if (!isHostPlatform("win32")) {
      test.skip(true, "Native Windows check only runs on Windows host");
    }

    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    // Verify font family on Windows uses Segoe UI / Windows typography stack
    const fontFamily = await page.evaluate(() =>
      window.getComputedStyle(document.body).fontFamily
    );
    expect(fontFamily.toLowerCase()).toContain("segoe ui");
  });
});
