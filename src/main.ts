import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/main";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { loadProject, saveProject, loadSettings, saveSettings } from "./io";
import { Project } from "./models";
import type { CitariumRPC } from "./rpc-types";
import platform from "os";

const ROOT_DIR = process.cwd();

const citariumRPC = BrowserView.defineRPC<CitariumRPC>({
  maxRequestTime: 300000,
  handlers: {
    requests: {
      loadProject: async ({ filepath }) => {
        try {
          const project = await loadProject(filepath);
          return { success: true, project: project.toDict() };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },
      saveProject: async ({ filepath, project }) => {
        try {
          if (!filepath) {
            return { success: false, error: "No filepath provided" };
          }
          const p = Project.fromDict(project);
          await saveProject(p, filepath);
          await saveSettings({ lastOpenedFile: filepath });
          return { success: true, filepath };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },
      showMessageBox: async ({ type, title, message, detail, buttons }) => {
        try {
          const res = await Utils.showMessageBox({
            type: type || "warning",
            title: title || "Citarium",
            message: message || "",
            detail: detail || "",
            buttons: buttons || ["OK"],
          });
          return { success: true, response: res.response };
        } catch (err: any) {
          return { success: false, error: err.message, response: 0 };
        }
      },
      getSettings: async () => {
        try {
          const settings = await loadSettings();
          return { success: true, settings };
        } catch (err: any) {
          return {
            success: false,
            settings: { lastOpenedFile: null, theme: "light", recentFiles: [] },
            error: err.message,
          };
        }
      },
      saveSettings: async ({ settings }) => {
        try {
          const updated = await saveSettings(settings);
          return { success: true, settings: updated };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },
      openFileDialog: async ({ startingFolder, allowedFileTypes }) => {
        try {
          const paths = await Utils.openFileDialog({
            startingFolder: startingFolder || process.cwd(),
            allowedFileTypes: allowedFileTypes || "json",
            canChooseFiles: true,
            canChooseDirectory: false,
            allowsMultipleSelection: false,
          });
          if (paths && paths.length > 0) {
            return { success: true, filepath: paths[0] };
          }
          return { success: true, filepath: null };
        } catch (err: any) {
          return { success: false, error: err.message, filepath: null };
        }
      },
    },
    messages: {},
  },
});


const hostPlatform = platform.platform() === "darwin" ? "mac" : platform.platform() === "win32" ? "windows" : "linux";

const mainWindow = new BrowserWindow({
  title: "Citarium",
  url: `views://mainview/index.html?platform=${hostPlatform}`,
  rpc: citariumRPC,
  frame: {
    width: 1260,
    height: 820,
    x: 100,
    y: 80,
  },
});

// Quit application when main window is closed
mainWindow.on("close", () => {
  Utils.quit();
});

// Configure Full Native Application Menus for macOS & Windows
ApplicationMenu.setApplicationMenu([
  ...(platform.platform() === "darwin"
    ? [
        {
          label: "Citarium",
          submenu: [
            { role: "about" },
            { type: "divider" as const },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "showAll" },
            { type: "divider" as const },
            { role: "quit" },
          ],
        },
      ]
    : []),
  {
    label: "File",
    submenu: [
      { label: "New Project", accelerator: "CmdOrCtrl+N", action: "new-project" },
      { label: "Open Project...", accelerator: "CmdOrCtrl+O", action: "open-project" },
      { label: "Save Project", accelerator: "CmdOrCtrl+S", action: "save-project" },
      { type: "divider" },
      { label: "Import BibTeX (.bib)...", action: "import-bibtex" },
      { label: "Export Markdown (.md)", action: "export-markdown" },
      { label: "Export Plain Text (.txt)", action: "export-text" },
      { label: "Export BibTeX (.bib)", action: "export-bibtex" },
      { type: "divider" },
      { role: "close" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "divider" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { label: "References", accelerator: "CmdOrCtrl+1", action: "view-references" },
      { label: "Bibliography", accelerator: "CmdOrCtrl+2", action: "view-bibliography" },
      { label: "Overview", accelerator: "CmdOrCtrl+3", action: "view-overview" },
      { type: "divider" },
      { label: "Toggle Theme (Light / Dark)", accelerator: "CmdOrCtrl+T", action: "toggle-theme" },
      { type: "divider" },
      { role: "toggleFullScreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "divider" },
      { role: "bringAllToFront" },
    ],
  },
  {
    label: "Help",
    submenu: [
      { label: "APA 7th Edition Guide", action: "open-guide" },
    ],
  },
]);

// Handle Native Menu Item Clicks
ApplicationMenu.on("application-menu-clicked", (event: any) => {
  const action = event?.data?.action || event?.action;
  if (!action) return;

  const actionToJsMap: Record<string, string> = {
    "new-project": "window.app?.newProject()",
    "open-project": "window.app?.openProjectFileDialog()",
    "save-project": "window.app?.saveProjectToFile()",
    "load-example": "window.app?.loadExampleProject()",
    "import-bibtex": "window.app?.openImportDialog()",
    "export-markdown": "window.app?.exportMarkdown()",
    "export-text": "window.app?.exportPlainText()",
    "export-bibtex": "window.app?.exportBibtex()",
    "view-references": "window.app?.selectWorkspace('references')",
    "view-bibliography": "window.app?.selectWorkspace('bibliography')",
    "view-overview": "window.app?.selectWorkspace('overview')",
    "toggle-theme": "window.app?.toggleTheme()",
    "open-guide": "window.app?.openGuideDialog()",
  };

  const js = actionToJsMap[action];
  if (js && mainWindow?.webview) {
    mainWindow.webview.executeJavascript(js);
  }
});


console.log("🚀 Citarium Electrobun Desktop App started with native application menus!");
