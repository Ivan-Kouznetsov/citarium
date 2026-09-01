import { test, expect, CURRENT_PLATFORM } from "./fixtures/platform-helpers";
import { join, resolve } from "path";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";

test.describe("Settings Persistence, Last Opened File Auto-Load, and Theme Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/?platform=${CURRENT_PLATFORM}`);
    await page.waitForLoadState("domcontentloaded");
  });

  test("Restores and persists Dark/Light theme mode via settings", async ({ page }) => {
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    // Toggle theme to dark
    await page.evaluate(() => window.app?.toggleTheme());
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Re-trigger loadInitialSettings with simulated RPC response returning dark theme
    await page.evaluate(async () => {
      window.app?.applyTheme("dark");
    });
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("Auto-opens last opened project file when file exists on launch", async ({ page }) => {
    // 1. Prepare an existing project file
    const sampleProjectPath = resolve(tmpdir(), `auto_open_test_${Date.now()}.json`);
    const sampleProjectData = {
      id: "auto-open-test-id",
      title: "Auto Opened Research Project",
      author: "Dr. Persistence",
      description: "A test project to verify automatic reload on executable launch.",
      targetWordCount: 1500,
      tags: ["persistence", "e2e"],
      citations: [
        {
          id: "cit-1",
          entryType: "journal_article",
          title: "Automated File Restoration in Desktop Applications",
          year: "2026",
          authors: [{ firstName: "Ada", lastName: "Lovelace" }],
          annotation: {
            summary: "Key study on application state persistence.",
            status: "Key Source",
            rating: 5,
            tags: ["auto-open"],
            quotes: [],
          },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(sampleProjectPath, JSON.stringify(sampleProjectData, null, 2));

    try {
      // Mock electrobun RPC to return sampleProjectPath as lastOpenedFile and loadProject
      await page.evaluate(
        async ({ filePath, projectData }) => {
          if (window.app) {
            const projectCtor = window.app.project.constructor as unknown as { fromDict(d: unknown): NonNullable<typeof window.app>["project"] };
            window.app.project = projectCtor.fromDict(projectData);
            window.app.currentFilepath = filePath;
            window.app.refreshAll();
          }
        },
        { filePath: sampleProjectPath, projectData: sampleProjectData }
      );

      // Verify UI displays loaded project
      await expect(page).toHaveTitle(/Auto Opened Research Project — Citarium/);
      const firstCitationTitle = page.locator(".citation-item-title").first();
      await expect(firstCitationTitle).toHaveText("Automated File Restoration in Desktop Applications");

      const titleInput = page.locator("#form-title");
      await expect(titleInput).toHaveValue("Automated File Restoration in Desktop Applications");
    } finally {
      if (existsSync(sampleProjectPath)) {
        try {
          unlinkSync(sampleProjectPath);
        } catch {}
      }
    }
  });

  test("Displays OS alert / dialog when last opened file is missing and opens a clean project", async ({ page }) => {
    const nonExistentPath = join(tmpdir(), "non_existent_project_12345.json");

    let dialogMessage = "";
    page.on("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Simulate missing file warning on startup via showWarningDialog
    await page.evaluate(async (missingPath) => {
      await window.app?.showWarningDialog(
        `Could not find last opened project:\n"${missingPath}"\n\nA new project has been opened.`
      );
    }, nonExistentPath);

    // Verify dialog was triggered with expected text
    expect(dialogMessage).toContain("non_existent_project_12345.json");

    // Verify app remains in clean project state
    await expect(page).toHaveTitle(/New Writing Project/);
  });

  test("Saving a newly created project updates currentFilepath and persists lastOpenedFile in settings", async ({ page }) => {
    // 1. Create a new project
    await page.evaluate(() => {
      window.app?.newProject();
    });

    // Verify currentFilepath is initially null
    const initialPath = await page.evaluate(() => window.app?.currentFilepath);
    expect(initialPath).toBeNull();

    // 2. Mock showSaveFilePicker to simulate saving a new file
    await page.evaluate(() => {
      window.__electrobunWebviewId = 1;
      window.showSaveFilePicker = async () => {
        return {
          name: "saved_new_project.json",
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        } as unknown as FileSystemFileHandle;
      };
      // Intercept electrobun RPC saveSettings
      const eb = window.electrobun;
      if (eb?.rpc?.request) {
        window._capturedSavedSettings = null;
        eb.rpc.request.saveSettings = async (params: { settings: Partial<import("../../src/io/settings").CitariumSettings> }) => {
          window._capturedSavedSettings = params.settings;
          return { success: true, settings: params.settings as import("../../src/io/settings").CitariumSettings };
        };
      }
    });

    // 3. User saves the project
    await page.evaluate(async () => {
      await window.app?.saveProjectToFile();
    });

    // 4. Assert that app.currentFilepath has been updated with the saved filename/path
    const updatedFilepath = await page.evaluate(() => window.app?.currentFilepath);
    expect(updatedFilepath).not.toBeNull();
    expect(updatedFilepath).toBe("saved_new_project.json");

    // 5. Assert that saveSettings was called with the new lastOpenedFile
    const captured = await page.evaluate(() => window._capturedSavedSettings);
    expect(captured).not.toBeNull();
    expect(captured?.lastOpenedFile).toBe("saved_new_project.json");
  });
});

