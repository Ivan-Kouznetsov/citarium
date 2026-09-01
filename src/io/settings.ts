/**
 * Local Settings Manager
 * Handles reading and writing persistent JSON configuration on the host file system.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from "fs";
import { dirname, join, resolve } from "path";
import { homedir, platform } from "os";

export interface CitariumSettings {
  lastOpenedFile: string | null;
  theme: "light" | "dark" | "system";
  recentFiles?: string[];
}

export const DEFAULT_SETTINGS: CitariumSettings = {
  lastOpenedFile: null,
  theme: "light",
  recentFiles: [],
};

/**
 * Returns the platform-appropriate path for the settings JSON file.
 * Windows: %APPDATA%/Citarium/settings.json
 * macOS: ~/Library/Application Support/Citarium/settings.json
 * Linux / Unix: $XDG_CONFIG_HOME/citarium/settings.json or ~/.config/citarium/settings.json
 */
export function getSettingsPath(customDir?: string): string {
  if (customDir) {
    return join(resolve(customDir), "settings.json");
  }

  const hostOs = platform();

  if (hostOs === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "Citarium", "settings.json");
  } else if (hostOs === "darwin") {
    return join(homedir(), "Library", "Application Support", "Citarium", "settings.json");
  } else {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(configHome, "citarium", "settings.json");
  }
}

/**
 * Loads settings from the specified or default settings JSON file.
 * Returns default settings if file doesn't exist or is invalid JSON.
 */
export async function loadSettings(filePath?: string): Promise<CitariumSettings> {
  const targetPath = filePath || getSettingsPath();

  if (!existsSync(targetPath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const content = readFileSync(targetPath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      lastOpenedFile: typeof parsed.lastOpenedFile === "string" ? parsed.lastOpenedFile : null,
      theme: parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system" ? parsed.theme : "light",
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
    };
  } catch (err) {
    console.warn(`[CitariumSettings] Failed to parse settings at '${targetPath}', falling back to defaults:`, err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Saves settings to the specified or default settings JSON file atomically.
 */
export async function saveSettings(settings: Partial<CitariumSettings>, filePath?: string): Promise<CitariumSettings> {
  const targetPath = filePath || getSettingsPath();
  const current = await loadSettings(targetPath);

  const updated: CitariumSettings = {
    lastOpenedFile: settings.lastOpenedFile !== undefined ? settings.lastOpenedFile : current.lastOpenedFile,
    theme: settings.theme !== undefined ? settings.theme : current.theme,
    recentFiles: settings.recentFiles !== undefined ? settings.recentFiles : current.recentFiles || [],
  };

  // If lastOpenedFile is provided and valid, keep recentFiles list updated and deduplicated (up to 10 items)
  if (updated.lastOpenedFile) {
    const existingRecent = (updated.recentFiles || []).filter((f) => f !== updated.lastOpenedFile);
    updated.recentFiles = [updated.lastOpenedFile, ...existingRecent].slice(0, 10);
  }

  const targetDir = dirname(resolve(targetPath));
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const jsonStr = JSON.stringify(updated, null, 2);
  const tempPath = join(
    targetDir,
    `.settings_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`
  );

  try {
    await Bun.write(tempPath, jsonStr);
    renameSync(tempPath, targetPath);
  } catch (err) {
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {}
    }
    throw err;
  }

  return updated;
}

/**
 * Updates partial settings fields.
 */
export async function updateSettings(partial: Partial<CitariumSettings>, filePath?: string): Promise<CitariumSettings> {
  return saveSettings(partial, filePath);
}
