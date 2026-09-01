import { test, expect } from "./fixtures/platform-helpers";

test.describe("In-App Modals and Interactive Dialogs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Manage Contributors Modal: Adding individual and organization authors, reordering, and applying", async ({ page }) => {
    // Add a citation first so we have a selected citation
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();

    // Open Authors modal
    await page.getByRole("button", { name: "Manage Authors..." }).click();
    const modal = page.locator("#modal-authors");
    await expect(modal).toHaveClass(/active/);

    // 1. Add individual author
    await page.locator("#author-first").fill("Jane");
    await page.locator("#author-middle").fill("M.");
    await page.locator("#author-last").fill("Goodall");
    await modal.getByRole("button", { name: "+ Add" }).click();

    // 2. Add organization author
    await page.locator("#author-is-org").check();
    await page.locator("#author-org-name").fill("Jane Goodall Institute");
    await modal.getByRole("button", { name: "+ Add" }).click();

    // Verify 2 entries in modal table
    const rows = modal.locator("#authors-table-body tr");
    await expect(rows).toHaveCount(2);

    // Reorder authors (Select 2nd, Move Up)
    await rows.nth(1).click();
    await modal.getByRole("button", { name: "Up", exact: true }).click();

    // Apply & Close
    await modal.getByRole("button", { name: "Apply & Close" }).click();
    await expect(modal).not.toHaveClass(/active/);

    // Verify authors input in main form updated
    const authorsVal = await page.locator("#form-authors").inputValue();
    expect(authorsVal).toContain("Jane Goodall Institute");
    expect(authorsVal).toContain("Jane Goodall");
  });

  test("BibTeX Import Modal: Parse preview and import citations", async ({ page }) => {
    // Open import modal
    await page.evaluate(() => window.app?.openImportDialog());
    const modal = page.locator("#modal-import");
    await expect(modal).toHaveClass(/active/);

    // Paste sample BibTeX entry
    const bibtexSnippet = `@article{turner2021feline,
  author = {Turner, Dennis C. and Bateson, Patrick},
  title = {The Domestic Cat: The Biology of its Behaviour},
  journal = {Cambridge University Press},
  year = {2021},
  volume = {3},
  pages = {120--135}
}`;
    await page.locator("#import-bibtex-text").fill(bibtexSnippet);

    // Click Preview
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.locator("#import-summary-label")).toHaveText("Found 1 citation(s) ready to import.");

    // Click Import into Project
    await page.getByRole("button", { name: "Import into Project" }).click();
    await expect(modal).not.toHaveClass(/active/);

    // Verify citation appears in citation list
    const citationItem = page.locator("#citation-list .citation-item", { hasText: "Turner" });
    await expect(citationItem).toBeVisible();
  });

  test("Quote / Idea Modal: Add new quote entry to Annotation Studio ideas table", async ({ page }) => {
    // Add citation and navigate to Annotation Studio
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#sub-tab-annot").click();

    // Click + Add Idea
    await page.getByRole("button", { name: "+ Add Idea" }).click();
    const modal = page.locator("#modal-quote");
    await expect(modal).toHaveClass(/active/);

    // Fill quote dialog
    await page.locator("#quote-modal-text").fill("Cats display complex socio-cognitive problem-solving behaviors.");
    await page.locator("#quote-modal-loc-type").selectOption("Page");
    await page.locator("#quote-modal-page").fill("142");
    await page.locator("#quote-modal-notes").fill("Supports behavioral complexity section.");

    // Save Idea
    await page.getByRole("button", { name: "Save Idea" }).click();
    await expect(modal).not.toHaveClass(/active/);

    // Verify quote in ideas table
    const tableBody = page.locator("#ideas-table-body");
    await expect(tableBody).toContainText("Cats display complex socio-cognitive problem-solving behaviors.");
    await expect(tableBody).toContainText("Page 142");
  });

  test("APA 7 Quick Guide Modal: Opens and displays reference rules", async ({ page }) => {
    await page.evaluate(() => window.app?.openGuideDialog());
    const modal = page.locator("#modal-guide");
    await expect(modal).toHaveClass(/active/);
    await expect(modal.locator(".modal-title")).toHaveText("APA 7th Edition Quick Reference Guide");

    // Close guide modal
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toHaveClass(/active/);
  });
});
