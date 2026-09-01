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

  test("OS App Close: Closes immediately without dialog when project is clean / unmodified", async ({ page }) => {
    await page.evaluate(() => {
      window.__closedWindowCalled = false;
      window.__messageBoxCalled = false;
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async () => {
              window.__messageBoxCalled = true;
              return { success: true, response: 0 };
            },
            closeWindow: async () => {
              window.__closedWindowCalled = true;
              return { success: true };
            },
          },
        },
      } as any;
    });

    const result = await page.evaluate(async () => {
      return await window.app.handleAppClose();
    });

    expect(result).toBe(true);
    const msgBoxCalled = await page.evaluate(() => window.__messageBoxCalled);
    const closedCalled = await page.evaluate(() => window.__closedWindowCalled);
    expect(msgBoxCalled).toBe(false);
    expect(closedCalled).toBe(true);
  });

  test("OS App Close: Modified project prompt -> User clicks Cancel -> Aborts close and retains unsaved changes", async ({ page }) => {
    // 1. Add citation and modify project
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#form-title").fill("Unsaved Close Test Paper");

    await page.evaluate(() => {
      window.__closedWindowCalled = false;
      window.__messageBoxOpts = null;
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async (opts: any) => {
              window.__messageBoxOpts = opts;
              return { success: true, response: 2 }; // Index 2: Cancel
            },
            closeWindow: async () => {
              window.__closedWindowCalled = true;
              return { success: true };
            },
          },
        },
      } as any;
    });

    const result = await page.evaluate(async () => {
      return await window.app.handleAppClose();
    });

    expect(result).toBe(false);
    const msgBoxOpts = await page.evaluate(() => window.__messageBoxOpts as any);
    const closedCalled = await page.evaluate(() => window.__closedWindowCalled);

    expect(msgBoxOpts).toBeTruthy();
    expect(msgBoxOpts.buttons).toEqual(["Save", "Don't Save", "Cancel"]);
    expect(msgBoxOpts.type).toBe("question");
    expect(closedCalled).toBe(false);

    // Project should still be modified and title retained
    await expect(page.locator("#form-title")).toHaveValue("Unsaved Close Test Paper");
    await expect(page).toHaveTitle(/• \(unsaved\)/);
  });

  test("OS App Close: Modified project prompt -> User clicks Don't Save -> Closes window and discards changes", async ({ page }) => {
    // 1. Add citation and modify project
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#form-title").fill("Discard Close Test Paper");

    await page.evaluate(() => {
      window.__closedWindowCalled = false;
      window.__messageBoxOpts = null;
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async (opts: any) => {
              window.__messageBoxOpts = opts;
              return { success: true, response: 1 }; // Index 1: Don't Save
            },
            closeWindow: async () => {
              window.__closedWindowCalled = true;
              return { success: true };
            },
          },
        },
      } as any;
    });

    const result = await page.evaluate(async () => {
      return await window.app.handleAppClose();
    });

    expect(result).toBe(true);
    const closedCalled = await page.evaluate(() => window.__closedWindowCalled);
    expect(closedCalled).toBe(true);

    const isModified = await page.evaluate(() => window.app.isModified);
    expect(isModified).toBe(false);
  });

  test("OS App Close: Modified project on existing file -> User clicks Save -> Saves directly and closes window", async ({ page }) => {
    await page.evaluate(() => {
      window.__closedWindowCalled = false;
      window.__saveProjectPayload = null;
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async () => {
              return { success: true, response: 0 }; // Index 0: Save
            },
            saveProject: async (payload: any) => {
              window.__saveProjectPayload = payload;
              return { success: true, filepath: payload.filepath };
            },
            closeWindow: async () => {
              window.__closedWindowCalled = true;
              return { success: true };
            },
            saveSettings: async () => ({ success: true }),
          },
        },
      } as any;

      // Set existing filepath
      window.app.currentFilepath = "C:/projects/my_research.json";
      window.app.isModified = true;
    });

    const result = await page.evaluate(async () => {
      return await window.app.handleAppClose();
    });

    expect(result).toBe(true);
    const savePayload = await page.evaluate(() => window.__saveProjectPayload as any);
    const closedCalled = await page.evaluate(() => window.__closedWindowCalled);

    expect(savePayload).toBeTruthy();
    expect(savePayload.filepath).toBe("C:/projects/my_research.json");
    expect(closedCalled).toBe(true);

    const isModified = await page.evaluate(() => window.app.isModified);
    expect(isModified).toBe(false);
  });

  test("OS App Close: Modified project on new file -> User clicks Save -> Opens Save As dialog -> Completes Save -> Closes window", async ({ page }) => {
    await page.evaluate(() => {
      window.__closedWindowCalled = false;
      window.__savePickerCalled = false;
      window.__savedContent = null;
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async () => {
              return { success: true, response: 0 }; // Index 0: Save
            },
            closeWindow: async () => {
              window.__closedWindowCalled = true;
              return { success: true };
            },
            saveSettings: async () => ({ success: true }),
          },
        },
      } as any;

      window.showSaveFilePicker = async () => {
        window.__savePickerCalled = true;
        return {
          name: "saved_research_project.json",
          createWritable: async () => ({
            write: async (content: any) => {
              window.__savedContent = typeof content === "string" ? content : null;
            },
            close: async () => {},
          }),
        } as any;
      };

      window.app.currentFilepath = null;
      window.app.currentFileHandle = null;
      window.app.isModified = true;
    });

    const result = await page.evaluate(async () => {
      return await window.app.handleAppClose();
    });

    expect(result).toBe(true);
    const pickerCalled = await page.evaluate(() => window.__savePickerCalled);
    const savedContent = await page.evaluate(() => window.__savedContent);
    const closedCalled = await page.evaluate(() => window.__closedWindowCalled);

    expect(pickerCalled).toBe(true);
    expect(savedContent).toBeTruthy();
    expect(closedCalled).toBe(true);

    const isModified = await page.evaluate(() => window.app.isModified);
    expect(isModified).toBe(false);
  });

  test("OS App Close: Modified project on new file -> User clicks Save -> Opens Save As dialog -> Cancels Save As -> Aborts close and preserves modified changes", async ({ page }) => {
    // 1. Add citation and modify project
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#form-title").fill("Aborted Save As Close Test");

    await page.evaluate(() => {
      window.__closedWindowCalled = false;
      window.__savePickerCalled = false;
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async () => {
              return { success: true, response: 0 }; // Index 0: Save
            },
            closeWindow: async () => {
              window.__closedWindowCalled = true;
              return { success: true };
            },
            saveSettings: async () => ({ success: true }),
          },
        },
      } as any;

      // Simulate user clicking Cancel on the native Save As file picker
      window.showSaveFilePicker = async () => {
        window.__savePickerCalled = true;
        const abortError = new Error("The user aborted a request.");
        abortError.name = "AbortError";
        throw abortError;
      };

      window.app.currentFilepath = null;
      window.app.currentFileHandle = null;
    });

    const result = await page.evaluate(async () => {
      return await window.app.handleAppClose();
    });

    expect(result).toBe(false);
    const pickerCalled = await page.evaluate(() => window.__savePickerCalled);
    const closedCalled = await page.evaluate(() => window.__closedWindowCalled);

    expect(pickerCalled).toBe(true);
    expect(closedCalled).toBe(false); // Window must NOT close!

    // Modified state and title must be retained
    const isModified = await page.evaluate(() => window.app.isModified);
    expect(isModified).toBe(true);
    await expect(page.locator("#form-title")).toHaveValue("Aborted Save As Close Test");
    await expect(page).toHaveTitle(/• \(unsaved\)/);
  });

  test("OS Message Box: Desktop confirm on newProject() prompts user and respects Cancel / OK", async ({ page }) => {
    await page.evaluate(() => {
      window.__messageBoxOpts = null;
      window.__electrobunWebviewId = 1;
      let mockResponse = 1; // Index 1: Cancel
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async (opts: any) => {
              window.__messageBoxOpts = opts;
              return { success: true, response: mockResponse };
            },
            saveSettings: async () => ({ success: true }),
          },
        },
      } as any;
      (window as any).__setMockResponse = (val: number) => {
        mockResponse = val;
      };
    });

    // Make project dirty
    await page.locator(".sidebar-panel button", { hasText: "+ Add" }).click();
    await page.locator("#form-title").fill("Dirty Project For OS MsgBox");
    await expect(page).toHaveTitle(/• \(unsaved\)/);

    // 1. User selects Cancel (response = 1)
    (await page.evaluate(async () => {
      (window as any).__setMockResponse(1); // Cancel
      await window.app.newProject();
    }));

    let msgBoxOpts = await page.evaluate(() => window.__messageBoxOpts as any);
    expect(msgBoxOpts).toBeTruthy();
    expect(msgBoxOpts.buttons).toEqual(["OK", "Cancel"]);
    expect(msgBoxOpts.type).toBe("question");
    expect(msgBoxOpts.message).toContain("You have unsaved changes");
    await expect(page.locator("#form-title")).toHaveValue("Dirty Project For OS MsgBox");

    // 2. User selects OK (response = 0)
    (await page.evaluate(async () => {
      (window as any).__setMockResponse(0); // OK
      await window.app.newProject();
    }));

    await expect(page.locator("#form-title")).toHaveValue("");
    await expect(page).toHaveTitle(/^New Writing Project — Citarium$/);
  });

  test("OS Message Box: Desktop confirm on deleteCitation() prompts user and respects Cancel / OK", async ({ page }) => {
    // Load example project
    await page.evaluate(() => window.app.loadExampleProject());
    await expect(page).toHaveTitle(/Domestic Feline/);

    await page.evaluate(() => {
      window.__messageBoxOpts = null;
      window.__electrobunWebviewId = 1;
      let mockResponse = 1; // Index 1: Cancel
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async (opts: any) => {
              window.__messageBoxOpts = opts;
              return { success: true, response: mockResponse };
            },
          },
        },
      } as any;
      (window as any).__setMockResponse = (val: number) => {
        mockResponse = val;
      };
    });

    const initialCount = await page.locator("#citation-list .citation-item").count();
    expect(initialCount).toBeGreaterThan(0);

    // 1. User clicks Delete -> Cancel
    await page.evaluate(async () => {
      (window as any).__setMockResponse(1); // Cancel
      await window.app.deleteCitation();
    });

    let msgBoxOpts = await page.evaluate(() => window.__messageBoxOpts as any);
    expect(msgBoxOpts).toBeTruthy();
    expect(msgBoxOpts.buttons).toEqual(["OK", "Cancel"]);
    expect(msgBoxOpts.type).toBe("question");
    expect(msgBoxOpts.message).toContain("Are you sure you want to permanently delete");

    const afterCancelCount = await page.locator("#citation-list .citation-item").count();
    expect(afterCancelCount).toBe(initialCount);

    // 2. User clicks Delete -> OK
    await page.evaluate(async () => {
      (window as any).__setMockResponse(0); // OK
      await window.app.deleteCitation();
    });

    const afterOkCount = await page.locator("#citation-list .citation-item").count();
    expect(afterOkCount).toBe(initialCount - 1);
  });

  test("OS Message Box: showWarningDialog, showErrorDialog, and showInfoDialog invoke native showMessageBox", async ({ page }) => {
    await page.evaluate(() => {
      window.__calls = [];
      window.__electrobunWebviewId = 1;
      window.electrobun = {
        rpc: {
          request: {
            showMessageBox: async (opts: any) => {
              (window as any).__calls.push(opts);
              return { success: true, response: 0 };
            },
          },
        },
      } as any;
    });

    await page.evaluate(async () => {
      await window.app.showWarningDialog("Warning text", "Warning Title");
      await window.app.showErrorDialog("Error text", "Error Title");
      await window.app.showInfoDialog("Info text", "Info Title");
    });

    const calls = await page.evaluate(() => (window as any).__calls);
    expect(calls.length).toBe(3);
    expect(calls[0]).toEqual({
      type: "warning",
      title: "Warning Title",
      message: "Warning text",
      buttons: ["OK"],
    });
    expect(calls[1]).toEqual({
      type: "error",
      title: "Error Title",
      message: "Error text",
      buttons: ["OK"],
    });
    expect(calls[2]).toEqual({
      type: "info",
      title: "Info Title",
      message: "Info text",
      buttons: ["OK"],
    });
  });
});

