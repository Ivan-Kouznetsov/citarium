import { test, expect, getOsModifierKey } from "./fixtures/platform-helpers";
import { resolve } from "path";

const EXAMPLE_FILE = resolve(process.cwd(), "examples/feline_behavior_annotated_bibliography.json");

test.describe("OS Modals, File Choosers, Native Dialogs, and OS Actions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?platform=windows");
    await page.waitForLoadState("domcontentloaded");
  });

  test("OS File Open Dialog: Triggering file chooser and loading project JSON", async ({ page }) => {
    // Disable showOpenFilePicker to test HTML file input chooser fallback
    await page.evaluate(() => {
      delete window.showOpenFilePicker;
    });

    // Listen for file chooser event
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.evaluate(() => window.app.openProjectFileDialog());
    const fileChooser = await fileChooserPromise;

    // Provide example JSON file
    await fileChooser.setFiles(EXAMPLE_FILE);

    // Verify project loaded into UI
    await expect(page).toHaveTitle(/Domestic Feline/);
    const citationItems = page.locator("#citation-list .citation-item");
    await expect(citationItems.first()).toBeVisible();
    const count = await citationItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("OS Save File Picker API: Triggers showSaveFilePicker with valid options", async ({ page }) => {
    // Mock showSaveFilePicker in browser context to spy on options
    await page.evaluate(() => {
      window.__lastSavePickerCall = null;
      window.showSaveFilePicker = async (options) => {
        window.__lastSavePickerCall = options ?? null;
        return {
          createWritable: async () => ({
            write: async (content: string | BufferSource | Blob) => {
              window.__lastSavedContent = typeof content === "string" ? content : null;
            },
            close: async () => {},
          }),
        } as FileSystemFileHandle;
      };
    });

    // Load example project
    await page.evaluate(() => window.app.loadExampleProject());
    await expect(page).toHaveTitle(/Domestic Feline/);

    // Trigger Markdown Export
    await page.evaluate(() => window.app.exportMarkdown());

    const saveCall = await page.evaluate(() => window.__lastSavePickerCall);
    expect(saveCall).toBeTruthy();
    expect(saveCall?.suggestedName).toContain(".md");
    expect(saveCall?.types?.[0]?.description).toContain("Markdown");

    const savedContent = await page.evaluate(() => window.__lastSavedContent);
    expect(savedContent).toContain("# Domestic Feline");
  });

  test("OS File Download Fallback: Triggers download event when showSaveFilePicker is absent", async ({ page }) => {
    // Disable showSaveFilePicker to test fallback download behavior
    await page.evaluate(() => {
      delete window.showSaveFilePicker;
    });

    // Load example project
    await page.evaluate(() => window.app.loadExampleProject());
    await expect(page).toHaveTitle(/Domestic Feline/);

    // Trigger export and wait for download event
    const downloadPromise = page.waitForEvent("download");
    await page.evaluate(() => window.app.exportBibtex());
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain(".bib");
  });

  test("OS Native Confirm Dialog: Intercepting and handling unsaved changes confirm modal", async ({ page }) => {
    // 1. Add citation and make project dirty by typing a title
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#form-title").fill("Unsaved Scratch Work");

    // Check title has dirty badge
    await expect(page).toHaveTitle(/• \(unsaved\)/);

    // 2. Test Dismissing Confirm Dialog (Cancel)
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("You have unsaved changes. Create new project anyway?");
      await dialog.dismiss();
    });

    await page.evaluate(() => window.app.newProject());
    // Form title should still be retained because dialog was cancelled
    await expect(page.locator("#form-title")).toHaveValue("Unsaved Scratch Work");

    // 3. Test Accepting Confirm Dialog (OK)
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("You have unsaved changes. Create new project anyway?");
      await dialog.accept();
    });

    await page.evaluate(() => window.app.newProject());
    // After accepting, project resets and title is cleared
    await expect(page.locator("#form-title")).toHaveValue("");
    await expect(page).toHaveTitle(/^New Writing Project — Citarium$/);
  });

  test("OS Native Keyboard Shortcuts: Workspace switching and shortcuts", async ({ page }) => {
    const modKey = getOsModifierKey();

    // Switch to Bibliography (Mod+2)
    await page.keyboard.press(`${modKey}+2`);
    await expect(page.locator("#workspace-bibliography")).toBeVisible();

    // Switch to Overview (Mod+3)
    await page.keyboard.press(`${modKey}+3`);
    await expect(page.locator("#workspace-overview")).toBeVisible();

    // Switch to References (Mod+1)
    await page.keyboard.press(`${modKey}+1`);
    await expect(page.locator("#workspace-references")).toBeVisible();
  });

  test("OS Clipboard: Copying formatted citations and bibliography text", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Load example project
    await page.evaluate(() => window.app.loadExampleProject());
    await expect(page).toHaveTitle(/Domestic Feline/);

    // Test Copy Reference button
    await page.getByRole("button", { name: "Copy Reference" }).click();
    const clipRef = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipRef.length).toBeGreaterThan(10);

    // Test Copy In-Text button
    await page.getByRole("button", { name: "Copy In-Text" }).click();
    const clipInText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipInText).toMatch(/\(.*\d{4}\)/);

    // Test Copy Compiled Bibliography
    await page.locator("#tab-btn-bib").click();
    await page.getByRole("button", { name: "Copy Formatted Text" }).click();
    const clipBib = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipBib.length).toBeGreaterThan(50);
  });
});
