import { test, expect } from "./fixtures/platform-helpers";
import { resolve } from "path";
import { writeFileSync, unlinkSync, existsSync } from "fs";

const EXAMPLE_FILE = resolve(process.cwd(), "examples/feline_behavior_annotated_bibliography.json");

test.describe("File Operations, In-Depth UI Editing, and Full Roundtrip Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");
  });

  test("Create New File: Build project from scratch, add citations & ideas, save to file, and verify on reopen", async ({ page }) => {
    // 1. Start fresh project
    await page.evaluate(() => (window as any).app.newProject());
    await expect(page).toHaveTitle(/^New Writing Project — Citarium$/);

    // 2. Add first citation
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#sub-tab-ref").click();
    await page.locator("#form-entry-type").selectOption("book");
    await page.locator("#form-authors").fill("Turing, Alan M.");
    await page.locator("#form-title").fill("Computing Machinery and Intelligence");
    await page.locator("#form-year").fill("1950");
    await page.locator("#form-publisher").fill("Mind Association");

    // Add annotation & rating
    await page.locator("#sub-tab-annot").click();
    await page.locator("#annot-status").selectOption("Key Source");
    await page.locator("#annot-rating").selectOption("5");
    await page.locator("#annot-tags").fill("turing test, artificial intelligence, seminal");
    await page.locator("#annot-summary").fill("Foundational paper proposing the imitation game as a test of machine intelligence.");
    await page.locator("#annot-evaluation").fill("Monumental historical significance in computational theory.");

    // Add quote/idea via modal
    await page.getByRole("button", { name: "+ Add Idea" }).click();
    await page.locator("#quote-modal-text").fill("Can machines think?");
    await page.locator("#quote-modal-loc-type").selectOption("Page");
    await page.locator("#quote-modal-page").fill("433");
    await page.locator("#quote-modal-notes").fill("Opening question of the paper");
    await page.getByRole("button", { name: "Save Idea" }).click();

    // Verify dirty badge
    await expect(page).toHaveTitle(/• \(unsaved\)/);

    // 3. Save project to file
    let savedJson = "";
    await page.evaluate(() => {
      (window as any).showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async (content: string) => {
            (window as any).__savedNewFileJson = content;
          },
          close: async () => {},
        }),
      });
    });

    await page.evaluate(() => (window as any).app.saveProjectToFile());
    savedJson = await page.evaluate(() => (window as any).__savedNewFileJson);
    expect(savedJson).toBeTruthy();

    const parsed = JSON.parse(savedJson);
    expect(parsed.citations.length).toBe(1);
    expect(parsed.citations[0].title).toBe("Computing Machinery and Intelligence");

    // Verify dirty state cleared
    await expect(page).not.toHaveTitle(/• \(unsaved\)/);

    // 4. Save to temporary disk file, reset UI, and reopen file to verify persistence
    const tempFilePath = resolve(process.cwd(), "examples/temp_new_project_saved.json");
    writeFileSync(tempFilePath, savedJson, "utf-8");

    try {
      // Reset workspace
      await page.evaluate(() => (window as any).app.newProject());
      await expect(page.locator("#citation-list .citation-item")).toHaveCount(0);

      // Open saved file via file chooser (fallback HTML input)
      await page.evaluate(() => {
        delete (window as any).showOpenFilePicker;
      });
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.evaluate(() => (window as any).app.openProjectFileDialog());
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(tempFilePath);

      // Verify citation and fields restored
      await expect(page.locator("#citation-list .citation-item")).toHaveCount(1);
      await expect(page.locator("#citation-list .citation-item")).toContainText("Computing Machinery and Intelligence");

      await expect(page.locator("#form-title")).toHaveValue("Computing Machinery and Intelligence");
      await expect(page.locator("#form-authors")).toHaveValue("Alan M. Turing");
      await expect(page.locator("#form-year")).toHaveValue("1950");
      await expect(page.locator("#form-publisher")).toHaveValue("Mind Association");

      // Verify annotation & quote restored
      await page.locator("#sub-tab-annot").click();
      await expect(page.locator("#annot-status")).toHaveValue("Key Source");
      await expect(page.locator("#annot-rating")).toHaveValue("5");
      await expect(page.locator("#annot-summary")).toHaveValue(
        "Foundational paper proposing the imitation game as a test of machine intelligence."
      );
      await expect(page.locator("#ideas-table-body")).toContainText("Can machines think?");
      await expect(page.locator("#ideas-table-body")).toContainText("Page 433");
    } finally {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch {}
      }
    }
  });

  test("File Menu Save: Open file, edit paper title by adding 1, save via File Menu, and verify opened file is updated", async ({ page }) => {
    // Read example file content
    const originalContent = (await import("fs")).readFileSync(EXAMPLE_FILE, "utf-8");
    const parsedOriginal = JSON.parse(originalContent);
    const originalFirstTitle = parsedOriginal.citations[0].title;

    // Set up mock showOpenFilePicker in browser context
    await page.evaluate(({ exampleJson, filename }) => {
      (window as any).__fileContentStore = exampleJson;
      (window as any).__savedToOpenedFile = false;

      const mockFile = new File([exampleJson], filename, { type: "application/json" });

      (window as any).showOpenFilePicker = async () => [
        {
          name: filename,
          getFile: async () => mockFile,
          createWritable: async () => ({
            write: async (content: string) => {
              (window as any).__fileContentStore = content;
              (window as any).__savedToOpenedFile = true;
            },
            close: async () => {},
          }),
        },
      ];
    }, { exampleJson: originalContent, filename: "feline_behavior_annotated_bibliography.json" });

    // 1. OPEN file using app.openProjectFileDialog()
    await page.evaluate(() => (window as any).app.openProjectFileDialog());

    // Verify title loaded in UI
    await expect(page.locator("#form-title")).toHaveValue(originalFirstTitle);

    // 2. EDIT title by appending " 1"
    const updatedTitle = `${originalFirstTitle} 1`;
    await page.locator("#form-title").fill(updatedTitle);
    await expect(page.locator("#form-title")).toHaveValue(updatedTitle);
    await expect(page).toHaveTitle(/• \(unsaved\)/);

    // 3. SAVE via File Menu / app.saveProjectToFile()
    await page.evaluate(() => (window as any).app.saveProjectToFile());

    // 4. VERIFY: The opened file handle was written to and contains the updated title with " 1"
    const savedToOpenedFile = await page.evaluate(() => (window as any).__savedToOpenedFile);
    expect(savedToOpenedFile).toBe(true);

    const savedFileJson = await page.evaluate(() => (window as any).__fileContentStore);
    const parsedSaved = JSON.parse(savedFileJson);
    expect(parsedSaved.citations[0].title).toBe(updatedTitle);
    await expect(page).not.toHaveTitle(/• \(unsaved\)/);
  });

  test("Comprehensive Lifecycle: Load -> Edit -> Add -> Save -> Reload Roundtrip", async ({ page }) => {
    // 1. LOAD: Open Project using File Chooser
    await page.evaluate(() => {
      delete (window as any).showOpenFilePicker;
    });
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
      await page.evaluate(() => {
        delete (window as any).showOpenFilePicker;
      });
      const reloadChooserPromise = page.waitForEvent("filechooser");
      await page.evaluate(() => (window as any).app.openProjectFileDialog());
      const reloadChooser = await reloadChooserPromise;
      await reloadChooser.setFiles(tempSavedPath);

      // Verify all edits and additions persisted completely in UI
      await expect(page.locator("#citation-list .citation-item")).toHaveCount(initialCitationCount + 1);

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
      if (existsSync(tempSavedPath)) {
        try {
          unlinkSync(tempSavedPath);
        } catch {}
      }
    }
  });
});

