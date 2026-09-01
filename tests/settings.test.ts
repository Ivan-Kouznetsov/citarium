import { describe, expect, it, afterEach } from "bun:test";
import {
  loadSettings,
  saveSettings,
  updateSettings,
  getSettingsPath,
  DEFAULT_SETTINGS,
} from "../src/io";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Settings Management", () => {
  const testSettingsFile = join(tmpdir(), `test_settings_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`);

  afterEach(() => {
    if (existsSync(testSettingsFile)) {
      try {
        unlinkSync(testSettingsFile);
      } catch {}
    }
  });

  it("returns platform-appropriate settings path", () => {
    const defaultPath = getSettingsPath();
    expect(defaultPath).toBeTruthy();
    expect(defaultPath.endsWith("settings.json")).toBe(true);

    const customPath = getSettingsPath(tmpdir());
    expect(customPath).toBe(join(tmpdir(), "settings.json"));
  });

  it("returns default settings when settings file does not exist", async () => {
    const settings = await loadSettings(testSettingsFile);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.lastOpenedFile).toBeNull();
    expect(settings.theme).toBe("light");
    expect(settings.recentFiles).toEqual([]);
  });

  it("saves and loads settings with full fidelity", async () => {
    const sampleFilePath = join(tmpdir(), "my_paper.json");
    await saveSettings(
      {
        lastOpenedFile: sampleFilePath,
        theme: "dark",
      },
      testSettingsFile
    );

    expect(existsSync(testSettingsFile)).toBe(true);

    const loaded = await loadSettings(testSettingsFile);
    expect(loaded.lastOpenedFile).toBe(sampleFilePath);
    expect(loaded.theme).toBe("dark");
    expect(loaded.recentFiles).toContain(sampleFilePath);
  });


  it("updates settings incrementally without overwriting untouched properties", async () => {
    // 1. Initial save with dark theme
    await saveSettings({ theme: "dark" }, testSettingsFile);
    let current = await loadSettings(testSettingsFile);
    expect(current.theme).toBe("dark");
    expect(current.lastOpenedFile).toBeNull();

    // 2. Update lastOpenedFile
    await updateSettings({ lastOpenedFile: "/path/to/paper1.json" }, testSettingsFile);
    current = await loadSettings(testSettingsFile);
    expect(current.theme).toBe("dark");
    expect(current.lastOpenedFile).toBe("/path/to/paper1.json");
    expect(current.recentFiles).toEqual(["/path/to/paper1.json"]);

    // 3. Update theme back to light
    await updateSettings({ theme: "light" }, testSettingsFile);
    current = await loadSettings(testSettingsFile);
    expect(current.theme).toBe("light");
    expect(current.lastOpenedFile).toBe("/path/to/paper1.json");
  });

  it("handles recentFiles list updates, deduplication and order", async () => {
    await updateSettings({ lastOpenedFile: "fileA.json" }, testSettingsFile);
    await updateSettings({ lastOpenedFile: "fileB.json" }, testSettingsFile);
    await updateSettings({ lastOpenedFile: "fileA.json" }, testSettingsFile);

    const current = await loadSettings(testSettingsFile);
    expect(current.lastOpenedFile).toBe("fileA.json");
    // fileA should be at the front, deduplicated
    expect(current.recentFiles).toEqual(["fileA.json", "fileB.json"]);
  });

  it("recovers gracefully with defaults when settings file contains invalid JSON", async () => {
    writeFileSync(testSettingsFile, "{ invalid json content !!!");
    const loaded = await loadSettings(testSettingsFile);
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it("handles full project reopening lifecycle with absolute paths across restart", async () => {
    const projectPath = join(tmpdir(), `reopen_test_project_${Date.now()}.json`);
    const { Project } = await import("../src/models/project");
    const { saveProject, loadProject } = await import("../src/io/project-io");

    try {
      // 1. Create and save a project
      const initialProject = new Project({
        title: "Reopen Test Project",
        description: "Testing automatic reopen on launch.",
      });
      await saveProject(initialProject, projectPath);

      // 2. Persist lastOpenedFile in settings
      await saveSettings({ lastOpenedFile: projectPath }, testSettingsFile);

      // 3. Simulate application relaunch: load settings
      const settings = await loadSettings(testSettingsFile);
      expect(settings.lastOpenedFile).toBe(projectPath);

      // 4. Load the project from the path in settings
      const reopened = await loadProject(settings.lastOpenedFile!);
      expect(reopened.title).toBe("Reopen Test Project");
      expect(reopened.description).toBe("Testing automatic reopen on launch.");
    } finally {
      if (existsSync(projectPath)) {
        try { unlinkSync(projectPath); } catch {}
      }
    }
  });
});
