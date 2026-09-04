import { dlopen, FFIType, ptr } from "bun:ffi";
import path from "path";
import fs from "fs";

function toWideBuffer(str: string): Buffer {
  return Buffer.from(str + "\0", "utf16le");
}

let ffiInitialized = false;
let user32: ReturnType<typeof dlopen> | null = null;
let shell32: ReturnType<typeof dlopen> | null = null;

function initFFI(): boolean {
  if (process.platform !== "win32") return false;
  if (ffiInitialized) return user32 !== null;

  ffiInitialized = true;
  try {
    user32 = dlopen("user32.dll", {
      FindWindowW: {
        args: [FFIType.ptr, FFIType.ptr],
        returns: FFIType.ptr,
      },
      SendMessageW: {
        args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
        returns: FFIType.ptr,
      },
      LoadImageW: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
        returns: FFIType.ptr,
      },
      SetClassLongPtrW: {
        args: [FFIType.ptr, FFIType.i32, FFIType.ptr],
        returns: FFIType.ptr,
      },
    });
  } catch (err) {
    console.warn("[WindowsIcon] Failed to load user32.dll:", err);
    user32 = null;
  }

  try {
    shell32 = dlopen("shell32.dll", {
      SetCurrentProcessExplicitAppUserModelID: {
        args: [FFIType.ptr],
        returns: FFIType.i32,
      },
    });
  } catch (err) {
    console.warn("[WindowsIcon] Failed to load shell32.dll:", err);
    shell32 = null;
  }

  return user32 !== null;
}

export function findIconPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "assets", "icon.ico"),
    path.resolve(process.cwd(), "assets", "icons", "win", "icon.ico"),
    path.resolve(process.cwd(), "icon.ico"),
    path.resolve(process.cwd(), "src", "ui", "assets", "favicon.ico"),
    path.resolve(__dirname, "..", "ui", "assets", "favicon.ico"),
    path.resolve(__dirname, "..", "..", "assets", "icon.ico"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function setAppUserModelId(appId: string = "ca.ivank.app.citarium"): void {
  if (process.platform !== "win32") return;
  initFFI();

  if (shell32?.symbols?.SetCurrentProcessExplicitAppUserModelID) {
    try {
      const wideAppId = toWideBuffer(appId);
      const res = shell32.symbols.SetCurrentProcessExplicitAppUserModelID(ptr(wideAppId));
      if (res === 0) {
        console.log(`[WindowsIcon] AppUserModelId set to "${appId}"`);
      }
    } catch (err) {
      console.warn("[WindowsIcon] Failed to set AppUserModelId:", err);
    }
  }
}

const WM_SETICON = 0x0080;
const ICON_SMALL = 0;
const ICON_BIG = 1;
const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x00000010;
const GCLP_HICON = -14;
const GCLP_HICONSM = -34;

let cachedHIcon16: unknown = null;
let cachedHIcon32: unknown = null;

export function loadIconHandles(iconPath: string): { hIconSmall: unknown; hIconBig: unknown } | null {
  if (!initFFI() || !user32) return null;

  try {
    if (cachedHIcon16 && cachedHIcon32) {
      return { hIconSmall: cachedHIcon16, hIconBig: cachedHIcon32 };
    }

    const pathBuf = toWideBuffer(iconPath);
    const pathPtr = ptr(pathBuf);

    const hIconSmall = user32.symbols.LoadImageW(null, pathPtr, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
    const hIconBig = user32.symbols.LoadImageW(null, pathPtr, IMAGE_ICON, 32, 32, LR_LOADFROMFILE);

    if (hIconSmall && hIconBig) {
      cachedHIcon16 = hIconSmall;
      cachedHIcon32 = hIconBig;
      return { hIconSmall, hIconBig };
    }
  } catch (err) {
    console.warn("[WindowsIcon] Error loading icon handles:", err);
  }

  return null;
}

export function applyIconToHwnd(hwnd: unknown, iconPath: string): boolean {
  if (!hwnd || !initFFI() || !user32) return false;

  const icons = loadIconHandles(iconPath);
  if (!icons) return false;

  try {
    const { hIconSmall, hIconBig } = icons;

    // 1. Set window corner / titlebar icon (ICON_SMALL = 0)
    user32.symbols.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hIconSmall);

    // 2. Set taskbar and Alt-Tab icon (ICON_BIG = 1)
    user32.symbols.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hIconBig);

    // 3. Set window class icons
    if (user32.symbols.SetClassLongPtrW) {
      user32.symbols.SetClassLongPtrW(hwnd, GCLP_HICONSM, hIconSmall);
      user32.symbols.SetClassLongPtrW(hwnd, GCLP_HICON, hIconBig);
    }

    return true;
  } catch (err) {
    console.warn("[WindowsIcon] Error applying icon to HWND:", err);
    return false;
  }
}

export function findHwndByTitle(title: string = "Citarium"): unknown {
  if (!initFFI() || !user32) return null;

  try {
    const titleBuf = toWideBuffer(title);
    let hwnd = user32.symbols.FindWindowW(null, ptr(titleBuf));
    if (!hwnd) {
      const classBuf = toWideBuffer("BasicWindowClass");
      hwnd = user32.symbols.FindWindowW(ptr(classBuf), ptr(titleBuf));
    }
    return hwnd;
  } catch {
    return null;
  }
}

export function applyWindowsAppIcon(windowPtr?: unknown, windowTitle: string = "Citarium"): void {
  if (process.platform !== "win32") return;

  // Set explicit AppUserModelID for taskbar pinning and grouping
  setAppUserModelId("ca.ivank.app.citarium");

  const iconPath = findIconPath();
  if (!iconPath) {
    console.warn("[WindowsIcon] Could not find any valid .ico icon file");
    return;
  }

  const tryApply = () => {
    let hwnd = windowPtr;
    if (!hwnd) {
      hwnd = findHwndByTitle(windowTitle);
    }

    if (hwnd) {
      const applied = applyIconToHwnd(hwnd, iconPath);
      if (applied) {
        console.log(`[WindowsIcon] Successfully applied Citarium icon from ${iconPath}`);
        return true;
      }
    }
    return false;
  };

  // Attempt immediately
  if (!tryApply()) {
    // Retry shortly in case window is still completing creation/showing
    const delays = [50, 150, 300, 600, 1200];
    for (const delay of delays) {
      setTimeout(() => {
        tryApply();
      }, delay);
    }
  }
}
