import { test, expect } from "./fixtures/platform-helpers";

test.describe("Desktop Context Menu and Debug Mode", () => {
  test("Right-clicking an input field opens desktop editing context menu", async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator("#search-input");
    await searchInput.fill("Sample search query");

    // Right click on the search input
    await searchInput.click({ button: "right" });

    // Verify desktop context menu is displayed
    const contextMenu = page.locator("#app-context-menu");
    await expect(contextMenu).toBeVisible();

    // Verify editing items are present
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Undo" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Redo" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Cut" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Copy" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Paste" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Select All" })).toBeVisible();

    // Test Select All action
    await contextMenu.locator(".context-menu-item", { hasText: "Select All" }).click();
    await expect(contextMenu).not.toBeVisible();
  });

  test("Right-clicking a citation card opens citation action context menu and supports duplication", async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    // Load example project so citations exist
    await page.evaluate(() => window.app.loadExampleProject());
    await page.waitForTimeout(200);

    const firstCitation = page.locator(".citation-item").first();
    await expect(firstCitation).toBeVisible();

    // Right click on citation item
    await firstCitation.click({ button: "right" });

    const contextMenu = page.locator("#app-context-menu");
    await expect(contextMenu).toBeVisible();

    // Verify citation actions
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Edit Reference" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Copy APA 7 Citation" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Copy BibTeX Entry" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Duplicate Reference" })).toBeVisible();
    await expect(contextMenu.locator(".context-menu-item", { hasText: "Delete Reference" })).toBeVisible();

    const initialCount = await page.locator(".citation-item").count();

    // Click Duplicate Reference
    await contextMenu.locator(".context-menu-item", { hasText: "Duplicate Reference" }).click();
    await expect(contextMenu).not.toBeVisible();

    // Verify duplicate citation was added
    const newCount = await page.locator(".citation-item").count();
    expect(newCount).toBe(initialCount + 1);
  });

  test("Right-clicking blank canvas / general background does not show any context menu", async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    // Right click on the header background
    const header = page.locator(".app-header");
    await header.click({ button: "right" });

    // Context menu should not be rendered
    const contextMenu = page.locator("#app-context-menu");
    await expect(contextMenu).not.toBeVisible();
  });

  test("Dismisses context menu on Escape and click outside", async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator("#search-input");
    await searchInput.click({ button: "right" });

    const contextMenu = page.locator("#app-context-menu");
    await expect(contextMenu).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");
    await expect(contextMenu).not.toBeVisible();

    // Reopen and click outside
    await searchInput.click({ button: "right" });
    await expect(contextMenu).toBeVisible();

    await page.locator(".app-header").click();
    await expect(contextMenu).not.toBeVisible();
  });

  test("Debug flag (?debug=1) suppresses custom desktop context menu and allows browser default", async ({ page }) => {
    await page.goto("/?platform=windows&debug=1");
    await page.waitForLoadState("domcontentloaded");

    // Check debug property
    const isDebug = await page.evaluate(() => window.app.isDebugMode);
    expect(isDebug).toBe(true);

    const searchInput = page.locator("#search-input");
    await searchInput.click({ button: "right" });

    // Custom desktop context menu should NOT be rendered
    const contextMenu = page.locator("#app-context-menu");
    await expect(contextMenu).not.toBeVisible();
  });
});
