import { test, expect } from "./fixtures/platform-helpers";
import { resolve } from "path";
import { writeFileSync, unlinkSync } from "fs";

const EXAMPLE_FILE = resolve(process.cwd(), "examples/feline_behavior_annotated_bibliography.json");

test.describe("File Operations, In-Depth UI Editing, and Full Roundtrip Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Comprehensive Lifecycle: Load -> Edit -> Add -> Save -> Reload Roundtrip", async ({ page }) => {
    // 1. LOAD: Open Project using File Chooser
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.evaluate(() => (window as any).app.openProjectFileDialog());
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(EXAMPLE_FILE);

    // Assert initial state loaded
    await expect(page).toHaveTitle(/Domestic Feline/);
    const initialCitationCount = await page.locator("#citation-list .citation-item").count();
    expect(initialCitationCount).toBeGreaterThanOrEqual(1);

    // 2. EDIT: Select first citation and modify reference fields
    await page.locator("#form-title").fill("Feline Attachment Patterns: Revised Edition");
    await page.locator("#form-year").fill("2025");
    await page.locator("#form-doi").fill("10.1016/j.cub.2025.01.001");
    await page.locator("#form-url").fill("https://doi.org/10.1016/j.cub.2025.01.001");

    // Edit Annotation details
    await page.locator("#sub-tab-annot").click();
    await page.locator("#annot-status").selectOption("Key Source");
    await page.locator("#annot-rating").selectOption("5");
    await page.locator("#annot-tags").fill("attachment, feline cognition, revised 2025");
    await page.locator("#annot-summary").fill("Groundbreaking revised synthesis on socio-cognitive attachment styles.");
    await page.locator("#annot-evaluation").fill("Exceptional methodology with robust behavioral testing.");

    // Add a new quote
    await page.getByRole("button", { name: "+ Add Idea" }).click();
    await page.locator("#quote-modal-text").fill("Cats form distinct and stable secure attachments with primary handlers.");
    await page.locator("#quote-modal-loc-type").selectOption("Page");
    await page.locator("#quote-modal-page").fill("78");
    await page.locator("#quote-modal-notes").fill("Central empirical finding");
    await page.getByRole("button", { name: "Save Idea" }).click();

    // 3. ADD: Create a brand new citation
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#sub-tab-ref").click();
    await page.locator("#form-entry-type").selectOption("book");
    await page.locator("#form-authors").fill("Smith, John; Taylor, Alex");
    await page.locator("#form-title").fill("Advanced Domestic Feline Neuroethology");
    await page.locator("#form-year").fill("2026");
    await page.locator("#form-publisher").fill("Oxford University Press");

    // Verify unsaved dirty badge
    await expect(page).toHaveTitle(/• \(unsaved\)/);

    // 4. SAVE: Mock saveTextFileWithDialog / showSaveFilePicker to capture the saved serialized JSON
    let capturedSavedJson: string = "";
    await page.evaluate(() => {
      (window as any).showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async (content: string) => {
            (window as any).__savedJsonData = content;
          },
          close: async () => {},
        }),
      });
    });

    await page.evaluate(() => (window as any).app.saveProjectToFile());

    capturedSavedJson = await page.evaluate(() => (window as any).__savedJsonData);
    expect(capturedSavedJson).toBeTruthy();

    const parsedSaved = JSON.parse(capturedSavedJson);
    expect(parsedSaved.citations.length).toBe(initialCitationCount + 1);

    // Verify dirty state cleared
    await expect(page).not.toHaveTitle(/• \(unsaved\)/);

    // 5. RELOAD ROUNDTRIP: Create a temporary file or feed saved JSON back into file chooser
    const tempSavedPath = resolve(process.cwd(), "examples/temp_roundtrip_saved.json");
    writeFileSync(tempSavedPath, capturedSavedJson, "utf-8");

    try {
      // Clear project first
      await page.evaluate(() => (window as any).app.newProject());
      await expect(page).toHaveTitle(/^New Writing Project — Citarium$/);

      // Reload the saved file
      const reloadChooserPromise = page.waitForEvent("filechooser");
      await page.evaluate(() => (window as any).app.openProjectFileDialog());
      const reloadChooser = await reloadChooserPromise;
      await reloadChooser.setFiles(tempSavedPath);

      // Verify all edits and additions persisted completely in UI
      const reloadedCount = await page.locator("#citation-list .citation-item").count();
      expect(reloadedCount).toBe(initialCitationCount + 1);

      // Check newly added book citation
      const newCitationItem = page.locator("#citation-list .citation-item", {
        hasText: "Advanced Domestic Feline Neuroethology",
      });
      await expect(newCitationItem).toBeVisible();
      await newCitationItem.click();

      await expect(page.locator("#form-title")).toHaveValue("Advanced Domestic Feline Neuroethology");
      await expect(page.locator("#form-year")).toHaveValue("2026");
      await expect(page.locator("#form-publisher")).toHaveValue("Oxford University Press");

      // Check modified first citation
      const editedCitationItem = page.locator("#citation-list .citation-item", {
        hasText: "Feline Attachment Patterns: Revised Edition",
      });
      await expect(editedCitationItem).toBeVisible();
      await editedCitationItem.click();

      await expect(page.locator("#form-year")).toHaveValue("2025");
      await expect(page.locator("#form-doi")).toHaveValue("10.1016/j.cub.2025.01.001");

      // Check annotation details of edited citation
      await page.locator("#sub-tab-annot").click();
      await expect(page.locator("#annot-status")).toHaveValue("Key Source");
      await expect(page.locator("#annot-rating")).toHaveValue("5");
      await expect(page.locator("#annot-summary")).toHaveValue(
        "Groundbreaking revised synthesis on socio-cognitive attachment styles."
      );
      await expect(page.locator("#ideas-table-body")).toContainText(
        "Cats form distinct and stable secure attachments with primary handlers."
      );
    } finally {
      // Clean up temporary file
      try {
        unlinkSync(tempSavedPath);
      } catch {}
    }
  });
});
