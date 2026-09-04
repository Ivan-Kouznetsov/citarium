import { describe, it, expect } from "bun:test";
import { findIconPath, loadIconHandles, setAppUserModelId, applyWindowsAppIcon } from "../src/platform/windows-icon";
import fs from "fs";

describe("Windows Native Icon Integration", () => {
  it("locates valid .ico file in the project", () => {
    const iconPath = findIconPath();
    expect(iconPath).not.toBeNull();
    expect(fs.existsSync(iconPath!)).toBe(true);
    expect(iconPath!.endsWith(".ico")).toBe(true);
  });

  it("safely invokes setAppUserModelId", () => {
    expect(() => setAppUserModelId("ca.ivank.app.citarium")).not.toThrow();
  });

  if (process.platform === "win32") {
    it("loads valid HICON handles for 16x16 and 32x32 resolutions on Windows", () => {
      const iconPath = findIconPath();
      expect(iconPath).not.toBeNull();
      const handles = loadIconHandles(iconPath!);
      expect(handles).not.toBeNull();
      expect(handles?.hIconSmall).toBeDefined();
      expect(handles?.hIconBig).toBeDefined();
    });

    it("safely attempts to apply icon without crashing", () => {
      expect(() => applyWindowsAppIcon(null, "Citarium")).not.toThrow();
    });
  }
});
