import { test, expect } from "./fixtures/platform-helpers";

test.describe("UI Widgets Presence and Initial State", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Header and Segmented Workspace Navigation Tabs are present and functional", async ({ page }) => {
    // Header & Workspace Tabs
    const header = page.locator(".app-header");
    await expect(header).toBeVisible();

    const refsTab = page.locator("#tab-btn-refs");
    const bibTab = page.locator("#tab-btn-bib");

    await expect(refsTab).toBeVisible();
    await expect(refsTab).toHaveClass(/active/);
    await expect(bibTab).toBeVisible();
    await expect(page.locator("#tab-btn-overview")).toHaveCount(0);

    // Default workspace is references
    await expect(page.locator("#workspace-references")).toBeVisible();
    await expect(page.locator("#workspace-bibliography")).not.toBeVisible();
    await expect(page.locator("#workspace-overview")).toHaveCount(0);

    // Switch to Bibliography
    await bibTab.click();
    await expect(bibTab).toHaveClass(/active/);
    await expect(refsTab).not.toHaveClass(/active/);
    await expect(page.locator("#workspace-bibliography")).toBeVisible();
    await expect(page.locator("#workspace-references")).not.toBeVisible();

    // Switch back to References
    await refsTab.click();
    await expect(refsTab).toHaveClass(/active/);
    await expect(page.locator("#workspace-references")).toBeVisible();
  });

  test("References Workspace: Sidebar master list controls and filters are present", async ({ page }) => {
    const sidebar = page.locator(".sidebar-panel");
    await expect(sidebar).toBeVisible();

    // Search and Add button
    const searchInput = page.locator("#search-input");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", /Search authors/);

    const addBtn = sidebar.locator("button", { hasText: "+ Add" });
    await expect(addBtn).toBeVisible();

    // Filter dropdowns
    const filterStatus = page.locator("#filter-status");
    await expect(filterStatus).toBeVisible();
    await expect(filterStatus.locator("option")).toHaveText([
      "All Statuses",
      "To Read",
      "Reading",
      "Annotated",
      "Key Source",
      "Review Later",
      "Archived",
    ]);

    const filterTag = page.locator("#filter-tag");
    await expect(filterTag).toBeVisible();

    const sortSelect = page.locator("#sort-select");
    await expect(sortSelect).toBeVisible();

    // Citation list container
    const citationList = page.locator("#citation-list");
    await expect(citationList).toBeVisible();
  });

  test("References Workspace: Detail Panel sub-tabs and action buttons are present", async ({ page }) => {
    const subTabRef = page.locator("#sub-tab-ref");
    const subTabAnnot = page.locator("#sub-tab-annot");
    await expect(subTabRef).toBeVisible();
    await expect(subTabRef).toHaveClass(/active/);
    await expect(subTabAnnot).toBeVisible();

    // Duplicate & Delete buttons
    await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

    // Sub-tab toggling
    await subTabAnnot.click();
    await expect(subTabAnnot).toHaveClass(/active/);
    await expect(page.locator("#sub-content-annot")).toBeVisible();
    await expect(page.locator("#sub-content-ref")).not.toBeVisible();

    await subTabRef.click();
    await expect(subTabRef).toHaveClass(/active/);
    await expect(page.locator("#sub-content-ref")).toBeVisible();
    await expect(page.locator("#sub-content-annot")).not.toBeVisible();
  });

  test("References Workspace: Live APA 7 Preview Card is present with copy actions", async ({ page }) => {
    const previewCard = page.locator(".preview-card");
    await expect(previewCard).toBeVisible();
    await expect(page.locator(".preview-card-title")).toHaveText("APA 7th Edition Live Reference Preview");

    await expect(page.locator("#preview-reference")).toBeVisible();
    await expect(page.locator("#preview-intext")).toBeVisible();

    await expect(page.getByRole("button", { name: "Copy Reference" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy In-Text" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy BibTeX" })).toBeVisible();
  });

  test("References Workspace: All reference form fields are present", async ({ page }) => {
    await expect(page.locator("#form-entry-type")).toBeVisible();
    await expect(page.locator("#form-authors")).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Authors..." })).toBeVisible();
    await expect(page.locator("#form-editors")).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Editors..." })).toBeVisible();
    await expect(page.locator("#form-title")).toBeVisible();
    await expect(page.locator("#form-year")).toBeVisible();
    await expect(page.locator("#form-date")).toBeVisible();
    await expect(page.locator("#form-container-title")).toBeVisible();
    await expect(page.locator("#form-volume")).toBeVisible();
    await expect(page.locator("#form-issue")).toBeVisible();
    await expect(page.locator("#form-pages")).toBeVisible();
    await expect(page.locator("#form-publisher")).toBeVisible();
    await expect(page.locator("#form-institution")).toBeVisible();
    await expect(page.locator("#form-doi")).toBeVisible();
    await expect(page.locator("#form-url")).toBeVisible();
    await expect(page.locator("#form-edition")).toBeVisible();
    await expect(page.locator("#form-report-number")).toBeVisible();
  });

  test("Annotations Workspace: All metadata, evaluation textareas, and quotes table are present", async ({ page }) => {
    await page.locator("#sub-tab-annot").click();

    await expect(page.locator("#annot-status")).toBeVisible();
    await expect(page.locator("#annot-rating")).toBeVisible();
    await expect(page.locator("#annot-tags")).toBeVisible();

    await expect(page.locator("#annot-summary")).toBeVisible();
    await expect(page.locator("#annot-evaluation")).toBeVisible();
    await expect(page.locator("#annot-relevance")).toBeVisible();
    await expect(page.locator("#annot-notes")).toBeVisible();

    await expect(page.getByRole("button", { name: "+ Add Idea" })).toBeVisible();
    await expect(page.locator("#sub-content-annot .ideas-table")).toBeVisible();
  });

  test("Compiled Bibliography Workspace: Format selector, copy button, and output textarea are present", async ({ page }) => {
    await page.locator("#tab-btn-bib").click();

    const formatSelect = page.locator("#bib-view-format");
    await expect(formatSelect).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Formatted Text" })).toBeVisible();

    const output = page.locator("#compiled-bibliography-text");
    await expect(output).toBeVisible();
    await expect(output).toHaveAttribute("readonly", "");
  });
});
