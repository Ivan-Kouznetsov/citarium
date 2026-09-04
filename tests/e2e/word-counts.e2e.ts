import { test, expect } from "./fixtures/platform-helpers";

test.describe("Live Word Counts per Source and Project Totals", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Initial state: Word count elements are present and display default counts", async ({ page }) => {
    // Sidebar summary bar
    const sidebarWordCount = page.locator("#sidebar-word-count");
    await expect(sidebarWordCount).toBeVisible();
    await expect(sidebarWordCount).toHaveText("0 words total · 0 sources");

    // Add a citation
    await page.locator(".sidebar-search-row button").click();

    // Sidebar citation item word count badge
    const citationItemBadge = page.locator(".citation-item .badge-word-count").first();
    await expect(citationItemBadge).toBeVisible();
    await expect(citationItemBadge).toHaveText("0 words");

    // Switch to Annotations sub-tab
    await page.locator("#sub-tab-annot").click();
    const annotCounter = page.locator("#annot-source-word-counter");
    await expect(annotCounter).toBeVisible();
    await expect(annotCounter).toHaveText("0 words");
  });

  test("Live editing: typing into annotation summary updates per-source counter and totals immediately", async ({ page }) => {
    // Add a citation first
    await page.locator(".sidebar-search-row button").click();

    // Switch to Annotations sub-tab
    await page.locator("#sub-tab-annot").click();

    const annotCounter = page.locator("#annot-source-word-counter");
    const sidebarTotal = page.locator("#sidebar-word-count");
    const activeCitationBadge = page.locator(".citation-item.selected .badge-word-count");

    // Type a specific 7-word phrase into summary
    const summaryInput = page.locator("#annot-summary");
    await summaryInput.fill("Cats are remarkably social and affectionate companions.");
    // "Cats are remarkably social and affectionate companions." = 7 words
    await expect(annotCounter).toHaveText("7 words");
    await expect(activeCitationBadge).toHaveText("7 words");
    await expect(sidebarTotal).toContainText("7 words total · 1 source");

    // Add text to Critical Evaluation
    const evalInput = page.locator("#annot-evaluation");
    await evalInput.fill("Methodology is sound and robust.");
    // "Methodology is sound and robust." (5 words) + "Evaluation:" prefix (1 word) + summary (7 words) = 13 words
    await expect(annotCounter).toHaveText("13 words");
    await expect(activeCitationBadge).toHaveText("13 words");
    await expect(sidebarTotal).toContainText("13 words total · 1 source");
  });

  test("Adding a new citation starts with 0 words and increments total as it is edited", async ({ page }) => {
    // Add a new citation
    await page.locator(".sidebar-search-row button").click();

    // The newly created citation is selected
    await page.locator("#sub-tab-annot").click();
    const annotCounter = page.locator("#annot-source-word-counter");
    await expect(annotCounter).toHaveText("0 words");

    // Add summary notes
    await page.locator("#annot-summary").fill("Preliminary research notes for upcoming chapter.");
    await expect(annotCounter).toHaveText("6 words");
    await expect(page.locator(".citation-item.selected .badge-word-count")).toHaveText("6 words");
  });

  test("Compiled Bibliography workspace displays the total word count", async ({ page }) => {
    // Add citation with some annotation
    await page.locator(".sidebar-search-row button").click();
    await page.locator("#sub-tab-annot").click();
    await page.locator("#annot-summary").fill("Sample summary text for test.");

    // Switch to Bibliography workspace
    await page.locator("#tab-btn-bib").click();
    await expect(page.locator("#workspace-bibliography")).toBeVisible();

    const bibWordCount = page.locator("#bib-total-word-count");
    await expect(bibWordCount).toBeVisible();
    await expect(bibWordCount).toContainText(/Total:\s+5\s+words/);
  });
});
