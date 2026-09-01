import { BrowserWindow, BrowserView, ApplicationMenu, Utils } from "electrobun/main";
import { loadProject, saveProject, loadSettings, saveSettings } from "./io";
import { Project } from "./models";
import type { CitariumRPC } from "./rpc-types";
import platform from "os";

const citariumRPC = BrowserView.defineRPC<CitariumRPC>({
  maxRequestTime: 300000,
  handlers: {
    requests: {
      loadProject: async ({ filepath }) => {
        try {
          const project = await loadProject(filepath);
          return { success: true, project: project.toDict() };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },
      showMessageBox: async ({ type, title, message, detail, buttons, defaultId, cancelId }) => {
        try {
          const res = await Utils.showMessageBox({
            type: type || "warning",
            title: title || "Citarium",
            message: message || "",
            detail: detail || "",
            buttons: buttons || ["OK"],
            defaultId: defaultId ?? 0,
            cancelId: cancelId ?? -1,
          });
          return { success: true, response: res.response };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message, response: 0 };
        }
      },
      getSettings: async () => {
        try {
          const settings = await loadSettings();
          return { success: true, settings };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            settings: { lastOpenedFile: null, theme: "light", recentFiles: [] },
            error: message,
          };
        }
      },
      saveSettings: async ({ settings }) => {
        try {
          const updated = await saveSettings(settings);
          return { success: true, settings: updated };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message, filepath: null };
        }
      },
      closeWindow: async () => {
        try {
          isClosingAllowed = true;
          mainWindow.close();
          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: message };
        }
      },
    },
    messages: {},
  },
});

let isClosingAllowed = false;

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

// Intercept window close to prompt for unsaved/modified changes
mainWindow.on("will-close", (event: unknown) => {
  if (isClosingAllowed) {
    return;
  }

  const electrobunEvent = event as { response?: { allow: boolean } };
  electrobunEvent.response = { allow: false };

  if (mainWindow?.webview) {
    mainWindow.webview.executeJavascript("window.app.handleAppClose()");
  }
});

// Quit application when main window is closed
mainWindow.on("close", () => {
  Utils.quit();
});

// Configure Full Native Application Menus for macOS & Windows (Linux uses in-webview HTML menubar)
if (platform.platform() !== "linux") {
  ApplicationMenu.setApplicationMenu([
    ...(platform.platform() === "darwin"
      ? [
          {
            label: "Citarium",
            submenu: [
              { role: "about" as const },
              { type: "divider" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "showAll" as const },
              { type: "divider" as const },
              { role: "quit" as const },
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
        { type: "divider" as const },
        { label: "Import BibTeX (.bib)...", action: "import-bibtex" },
        { label: "Export Markdown (.md)", action: "export-markdown" },
        { label: "Export Plain Text (.txt)", action: "export-text" },
        { label: "Export BibTeX (.bib)", action: "export-bibtex" },
        { type: "divider" as const },
        { role: "close" as const },
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

  interface ApplicationMenuEvent {
    data?: { action?: string };
    action?: string;
  }

  // Handle Native Menu Item Clicks
  ApplicationMenu.on("application-menu-clicked", (event: unknown) => {
    const menuEvent = event as ApplicationMenuEvent;
    const action = menuEvent?.data?.action || menuEvent?.action;
    if (!action) return;

    const actionToJsMap: Record<string, string> = {
      "new-project": "window.app.newProject()",
      "open-project": "window.app.openProjectFileDialog()",
      "save-project": "window.app.saveProjectToFile()",
      "close-window": "window.app.handleAppClose()",
      "load-example": "window.app.loadExampleProject()",
      "import-bibtex": "window.app.openImportDialog()",
      "export-markdown": "window.app.exportMarkdown()",
      "export-text": "window.app.exportPlainText()",
      "export-bibtex": "window.app.exportBibtex()",
      "view-references": "window.app.selectWorkspace('references')",
      "view-bibliography": "window.app.selectWorkspace('bibliography')",
      "view-overview": "window.app.selectWorkspace('overview')",
      "toggle-theme": "window.app.toggleTheme()",
      "open-guide": "window.app.openGuideDialog()",
    };

    const js = actionToJsMap[action];
    if (js && mainWindow?.webview) {
      mainWindow.webview.executeJavascript(js);
    }
  });
}

console.log("🚀 Citarium Electrobun Desktop App started!");

