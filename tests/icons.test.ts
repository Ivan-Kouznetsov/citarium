import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

const rootDir = path.resolve(__dirname, "..");

describe("Application Icons for macOS, Windows, Linux, and Web", () => {
  it("should have macOS iconset and compiled .icns files", () => {
    const iconsetDir = path.join(rootDir, "assets", "icon.iconset");
    expect(fs.existsSync(iconsetDir)).toBe(true);

    const requiredIconsetFiles = [
      "icon_16x16.png",
      "icon_16x16@2x.png",
      "icon_32x32.png",
      "icon_32x32@2x.png",
      "icon_128x128.png",
      "icon_128x128@2x.png",
      "icon_256x256.png",
      "icon_256x256@2x.png",
      "icon_512x512.png",
      "icon_512x512@2x.png",
    ];

    for (const filename of requiredIconsetFiles) {
      const p = path.join(iconsetDir, filename);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(0);
    }

    const icnsPath = path.join(rootDir, "assets", "icon.icns");
    const appIconPath = path.join(rootDir, "assets", "AppIcon.icns");
    expect(fs.existsSync(icnsPath)).toBe(true);
    expect(fs.existsSync(appIconPath)).toBe(true);
    expect(fs.statSync(icnsPath).size).toBeGreaterThan(1000);
  });

  it("should have Windows .ico with multi-resolution embedded icons and individual PNGs", () => {
    const icoPath = path.join(rootDir, "assets", "icon.ico");
    expect(fs.existsSync(icoPath)).toBe(true);

    const icoBuffer = fs.readFileSync(icoPath);
    expect(icoBuffer.length).toBeGreaterThan(1000);
    // Reserved = 0, Type = 1 (ICO)
    expect(icoBuffer.readUInt16LE(0)).toBe(0);
    expect(icoBuffer.readUInt16LE(2)).toBe(1);
    const count = icoBuffer.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(7);

    const winSizes = [16, 24, 32, 48, 64, 128, 256];
    for (const size of winSizes) {
      const p = path.join(rootDir, "assets", "icons", "win", `icon-${size}.png`);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(0);
    }
  });

  it("should have Linux icon hierarchy and master PNG files", () => {
    const masterPng = path.join(rootDir, "assets", "icon.png");
    const master1024Png = path.join(rootDir, "assets", "icon-1024.png");
    expect(fs.existsSync(masterPng)).toBe(true);
    expect(fs.existsSync(master1024Png)).toBe(true);

    const linuxSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];
    for (const size of linuxSizes) {
      const flatPath = path.join(rootDir, "assets", "icons", "linux", `icon-${size}.png`);
      const hicolorPath = path.join(rootDir, "assets", "icons", "hicolor", `${size}x${size}`, "apps", "citarium.png");

      expect(fs.existsSync(flatPath)).toBe(true);
      expect(fs.existsSync(hicolorPath)).toBe(true);
    }
  });

  it("should have Web UI icon assets and favicons", () => {
    const uiAssets = [
      "icon.png",
      "icon-16.png",
      "icon-32.png",
      "icon-48.png",
      "icon-64.png",
      "icon-128.png",
      "icon-256.png",
      "icon-512.png",
      "favicon.ico",
    ];

    for (const filename of uiAssets) {
      const p = path.join(rootDir, "src", "ui", "assets", filename);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(0);
    }
  });

  it("should configure icons in electrobun.config.ts", () => {
    const configPath = path.join(rootDir, "electrobun.config.ts");
    const configContent = fs.readFileSync(configPath, "utf-8");

    expect(configContent).toContain('"assets/icon.iconset"');
    expect(configContent).toContain('"assets/icon.ico"');
    expect(configContent).toContain('"assets/icon.png"');
    expect(configContent).toContain('"src/ui/assets/icon-32.png"');
  });

  it("should provide root-level icon assets for default Electrobun/Hutch packaging", () => {
    expect(fs.existsSync(path.join(rootDir, "icon.ico"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "icon.png"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "icon.icns"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "icon.iconset"))).toBe(true);
  });
});
