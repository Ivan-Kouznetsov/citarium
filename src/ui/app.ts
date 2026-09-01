/**
 * Citarium Web UI Application Controller (TypeScript)
 */
import { Project, Citation, Author, Quote } from "../models";
import { APA7Formatter } from "../formatters/apa7";
import { BibTeXFormatter } from "../formatters/bibtex";
import { BibTeXParser } from "../io/bibtex-parser";
import { exportToMarkdown, exportToPlainText, exportToBibtex } from "../io/exporters";
import { AsyncURLChecker } from "../utils/url-validator";
import Electrobun, { Electroview } from "electrobun/view";
import type { CitariumRPC } from "../rpc-types";

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void | Promise<void>;
  danger?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | { type: "divider" };

const rpc = Electroview.defineRPC<CitariumRPC>({
  maxRequestTime: 300000,
  handlers: { requests: {}, messages: {} },
});

const electrobun = new Electrobun.Electroview({ rpc });
window.electrobun = electrobun;

export class CitariumApp {
  project: Project;
  selectedCitationId: string | null = null;
  currentWorkspace: "references" | "bibliography" | "overview" = "references";
  currentSubTab: "reference" | "annotation" = "reference";
  isModified: boolean = false;

  get isDebugMode(): boolean {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("debug") === "1" || params.get("debug") === "true") {
        return true;
      }
      if ((window as unknown as { CITARIUM_DEBUG?: boolean }).CITARIUM_DEBUG === true) {
        return true;
      }
    } catch {}
    return false;
  }

  get isDirty(): boolean {
    return this.isModified;
  }

  set isDirty(val: boolean) {
    this.isModified = val;
  }

  currentFilepath: string | null = null;
  currentFileHandle: FileSystemFileHandle | null = null;

  get isDesktop(): boolean {
    return typeof window.__electrobunWebviewId !== "undefined";
  }

  currentPlatform: "mac" | "windows" | "linux" = "mac";
  currentTheme: "system" | "light" | "dark" = "light";

  get electrobun() {
    return window.electrobun || electrobun;
  }

  apa7 = new APA7Formatter();
  urlChecker = new AsyncURLChecker();

  // Authors modal state
  authorModalMode: "authors" | "editors" = "authors";
  modalAuthorsList: Author[] = [];
  selectedModalAuthorIdx: number | null = null;

  // Quotes modal state
  editingQuoteId: string | null = null;

  // BibTeX import state
  parsedBibtexCitations: Citation[] = [];

  constructor() {
    this.project = new Project({
      title: "New Writing Project",
      description: "Annotated bibliography and research reference repository.",
    });

    this.setupKeyboardShortcuts();
    this.setupGlobalClick();
  }

  init(): void {
    // 100% Automatic style determination based on host OS
    this.currentPlatform = this.detectPlatform();
    document.documentElement.setAttribute("data-platform", this.currentPlatform);

    // Initial theme fallback
    let initialTheme: "light" | "dark" = "light";
    try {
      const stored = localStorage.getItem("citarium_theme");
      if (stored === "dark") initialTheme = "dark";
    } catch {}
    this.applyTheme(initialTheme, false);

    // Initial render
    this.refreshAll();

    // Asynchronously load persistent settings from local JSON (theme & last opened file)
    this.loadInitialSettings();

    // Native In-App Menubar & Dropdowns (Active on Linux)
    this.setupMenubarHover();

    // Desktop-Native Context Menu
    this.setupContextMenu();
  }

  async loadInitialSettings(): Promise<void> {
    if (!this.isDesktop) {
      return;
    }
    try {
      const res = await this.electrobun?.rpc?.request?.getSettings?.({});
      if (res?.success && res.settings) {
        const { theme, lastOpenedFile } = res.settings;
        if (theme) {
          this.applyTheme(theme, false);
        }
        if (lastOpenedFile) {
          const loadRes = await this.electrobun?.rpc?.request?.loadProject?.({ filepath: lastOpenedFile });
          if (loadRes?.success && loadRes.project) {
            this.project = Project.fromDict(loadRes.project);
            this.currentFilepath = lastOpenedFile;
            this.currentFileHandle = null;
            this.isModified = false;
            this.selectedCitationId = this.project.citations.length > 0 ? this.project.citations[0].id : null;
            this.refreshAll();
          } else {
            // Last opened file does not exist or failed to load -> warn user with OS alertbox / message box
            await this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: null } });
            await this.showWarningDialog(`Could not find last opened project: "${lastOpenedFile}". A new project has been opened.`);
          }
        }
      }
    } catch (err) {
      console.warn("[Citarium] Initial settings load skipped/failed:", err);
    }
  }

  async showWarningDialog(message: string, title: string = "Citarium"): Promise<void> {
    if (this.isDesktop && this.electrobun?.rpc?.request?.showMessageBox) {
      try {
        const res = await this.electrobun.rpc.request.showMessageBox({
          type: "warning",
          title,
          message,
          buttons: ["OK"],
        });
        if (res?.success) return;
      } catch (err) {
        console.warn("showMessageBox warning failed:", err);
      }
    }
    window.alert(message);
  }

  async showErrorDialog(message: string, title: string = "Citarium"): Promise<void> {
    if (this.isDesktop && this.electrobun?.rpc?.request?.showMessageBox) {
      try {
        const res = await this.electrobun.rpc.request.showMessageBox({
          type: "error",
          title,
          message,
          buttons: ["OK"],
        });
        if (res?.success) return;
      } catch (err) {
        console.warn("showMessageBox error failed:", err);
      }
    }
    window.alert(message);
  }

  async showInfoDialog(message: string, title: string = "Citarium"): Promise<void> {
    if (this.isDesktop && this.electrobun?.rpc?.request?.showMessageBox) {
      try {
        const res = await this.electrobun.rpc.request.showMessageBox({
          type: "info",
          title,
          message,
          buttons: ["OK"],
        });
        if (res?.success) return;
      } catch (err) {
        console.warn("showMessageBox info failed:", err);
      }
    }
    window.alert(message);
  }

  async showConfirmDialog(message: string, title: string = "Citarium"): Promise<boolean> {
    if (this.isDesktop && this.electrobun?.rpc?.request?.showMessageBox) {
      try {
        const res = await this.electrobun.rpc.request.showMessageBox({
          type: "question",
          title,
          message,
          buttons: ["OK", "Cancel"],
          defaultId: 0,
          cancelId: 1,
        });
        if (res?.success && typeof res.response === "number") {
          return res.response === 0;
        }
      } catch (err) {
        console.warn("showMessageBox confirm failed:", err);
      }
    }
    return window.confirm(message);
  }

  showWarningBanner(message: string): void {
    this.showWarningDialog(message);
  }

  dismissWarningBanner(): void {
    // No-op for OS dialogs
  }

  detectPlatform(): "mac" | "windows" | "linux" {
    const platform = new URLSearchParams(window.location.search).get("platform");
    return (platform as "mac" | "windows" | "linux") || "windows";
  }

  applyTheme(theme: "system" | "light" | "dark", persist: boolean = true): void {
    this.currentTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", this.currentTheme);

    try {
      localStorage.setItem("citarium_theme", this.currentTheme);
    } catch {}

    if (persist && this.isDesktop) {
      electrobun.rpc?.request?.saveSettings?.({ settings: { theme: this.currentTheme } }).catch(() => {});
    }
  }

  toggleTheme(): void {
    const nextTheme = this.currentTheme === "dark" ? "light" : "dark";
    this.applyTheme(nextTheme, true);
  }

  isAnyMenuOpen: boolean = false;

  // Native In-App Menubar & Dropdown Actions
  toggleMenu(menuName: string, e?: Event): void {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${menuName}`);
    const btn = document.getElementById(`menubar-btn-${menuName}`);
    const isCurrentlyActive = dropdown?.classList.contains("active");

    this.closeAllMenus();

    if (!isCurrentlyActive && dropdown && btn) {
      dropdown.classList.add("active");
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
      this.isAnyMenuOpen = true;
    }
  }

  openMenu(menuName: string): void {
    this.closeAllMenus();
    const dropdown = document.getElementById(`dropdown-${menuName}`);
    const btn = document.getElementById(`menubar-btn-${menuName}`);
    if (dropdown && btn) {
      dropdown.classList.add("active");
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
      this.isAnyMenuOpen = true;
    }
  }

  toggleDropdownMenu(menuId: string, e: Event): void {
    e.stopPropagation();
    const menuEl = document.getElementById(menuId);
    const wasActive = menuEl?.classList.contains("active");
    this.closeAllMenus();
    if (menuEl && !wasActive) {
      menuEl.classList.add("active");
      const btn = menuEl.previousElementSibling as HTMLElement;
      if (btn) btn.classList.add("active");
    }
  }

  closeAllMenus(): void {
    this.isAnyMenuOpen = false;
    this.closeContextMenu();
    document.querySelectorAll(".menubar-dropdown").forEach((m) => {
      m.classList.remove("active");
    });
    document.querySelectorAll(".menubar-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".desktop-dropdown-menu").forEach((m) => {
      m.classList.remove("active");
    });
    document.querySelectorAll(".menu-trigger-btn").forEach((b) => {
      b.classList.remove("active");
    });
  }

  setupMenubarHover(): void {
    const menuNames = ["file", "edit", "view", "help"];
    menuNames.forEach((name) => {
      const itemEl = document.getElementById(`menu-item-${name}`);
      if (itemEl) {
        itemEl.addEventListener("mouseenter", () => {
          if (this.isAnyMenuOpen) {
            this.openMenu(name);
          }
        });
      }
    });
  }

  triggerEditAction(action: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"): void {
    this.closeAllMenus();
    try {
      if (action === "selectAll") {
        const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
        if (active && typeof active.select === "function") {
          active.select();
          return;
        }
      }
      document.execCommand(action);
    } catch (err) {
      console.warn(`[Citarium] Edit action ${action} failed:`, err);
    }
  }

  setupKeyboardShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const isMac = this.currentPlatform === "mac";
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "Escape") {
        this.closeAllMenus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const menu = document.getElementById("app-context-menu");
        if (menu) {
          e.preventDefault();
          const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(".context-menu-item:not(.disabled)"));
          if (items.length > 0) {
            const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
            let nextIdx = 0;
            if (e.key === "ArrowDown") {
              nextIdx = activeIdx >= 0 && activeIdx < items.length - 1 ? activeIdx + 1 : 0;
            } else {
              nextIdx = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
            }
            items[nextIdx].focus();
          }
        }
      } else if (modKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        this.toggleTheme();
      } else if (modKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        this.newProject();
      } else if (modKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        this.openProjectFileDialog();
      } else if (modKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.saveProjectToFile();
      } else if (modKey && e.key === "1") {
        e.preventDefault();
        this.selectWorkspace("references");
      } else if (modKey && e.key === "2") {
        e.preventDefault();
        this.selectWorkspace("bibliography");
      } else if (modKey && e.key === "3") {
        e.preventDefault();
        this.selectWorkspace("overview");
      }
    });

    window.addEventListener("beforeunload", (e) => {
      if (this.isModified) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    });
  }

  setupGlobalClick(): void {
    const handleGlobalDismiss = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".menubar-item") && !target?.closest(".menu-item-container") && !target?.closest(".app-context-menu")) {
        this.closeAllMenus();
      }
    };

    window.addEventListener("pointerdown", handleGlobalDismiss);
    window.addEventListener("click", handleGlobalDismiss);
    window.addEventListener("scroll", () => this.closeContextMenu(), { passive: true });
    window.addEventListener("resize", () => this.closeContextMenu(), { passive: true });
  }

  setupContextMenu(): void {
    window.addEventListener("contextmenu", (e: MouseEvent) => {
      if (this.isDebugMode) {
        // Debug flag active: allow browser context menu with "Inspect Element" & DevTools
        return;
      }

      // Intercept and prevent the browser context menu
      e.preventDefault();
      this.closeContextMenu();

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const mod = this.currentPlatform === "mac" ? "Cmd" : "Ctrl";
      const menuEntries: ContextMenuEntry[] = [];

      // Case 1: Target is an editable input or textarea
      const isInput =
        target instanceof HTMLInputElement &&
        !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(target.type.toLowerCase());
      const isTextarea = target instanceof HTMLTextAreaElement;
      const isContentEditable = (target as HTMLElement).isContentEditable;

      if (isInput || isTextarea || isContentEditable) {
        const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
        const isReadOnly = Boolean((inputEl as HTMLInputElement).readOnly || (inputEl as HTMLInputElement).disabled);
        const start = typeof inputEl.selectionStart === "number" ? inputEl.selectionStart : 0;
        const end = typeof inputEl.selectionEnd === "number" ? inputEl.selectionEnd : 0;
        const hasSelection = end > start;

        menuEntries.push(
          {
            label: "Undo",
            shortcut: `${mod}+Z`,
            action: () => {
              inputEl.focus();
              document.execCommand("undo");
            },
          },
          {
            label: "Redo",
            shortcut: this.currentPlatform === "mac" ? "Cmd+Shift+Z" : "Ctrl+Y",
            action: () => {
              inputEl.focus();
              document.execCommand("redo");
            },
          },
          { type: "divider" },
          {
            label: "Cut",
            shortcut: `${mod}+X`,
            disabled: isReadOnly || !hasSelection,
            action: async () => {
              inputEl.focus();
              if (hasSelection && typeof inputEl.value === "string") {
                const selectedText = inputEl.value.substring(start, end);
                try {
                  await navigator.clipboard.writeText(selectedText);
                } catch {
                  document.execCommand("cut");
                }
                if (!isReadOnly) {
                  inputEl.setRangeText("", start, end, "end");
                  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            },
          },
          {
            label: "Copy",
            shortcut: `${mod}+C`,
            disabled: !hasSelection,
            action: async () => {
              if (hasSelection && typeof inputEl.value === "string") {
                const selectedText = inputEl.value.substring(start, end);
                try {
                  await navigator.clipboard.writeText(selectedText);
                } catch {
                  document.execCommand("copy");
                }
              }
            },
          },
          {
            label: "Paste",
            shortcut: `${mod}+V`,
            disabled: isReadOnly,
            action: async () => {
              inputEl.focus();
              try {
                const text = await navigator.clipboard.readText();
                if (typeof text === "string" && !isReadOnly) {
                  inputEl.setRangeText(text, start, end, "end");
                  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
                }
              } catch {
                document.execCommand("paste");
              }
            },
          },
          { type: "divider" },
          {
            label: "Select All",
            shortcut: `${mod}+A`,
            action: () => {
              inputEl.focus();
              if (typeof inputEl.select === "function") {
                inputEl.select();
              } else {
                document.execCommand("selectAll");
              }
            },
          }
        );
      } else {
        // Case 2: Citation Item in Sidebar or UI
        const citationItem = target.closest(".citation-item") as HTMLElement | null;
        const citationId = citationItem?.getAttribute("data-citation-id");

        // Case 3: Quote Row in Annotation Studio
        const quoteRow = target.closest("[data-quote-id]") as HTMLElement | null;
        const quoteId = quoteRow?.getAttribute("data-quote-id");

        // Case 4: Text selected on non-editable element
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : "";

        if (citationId) {
          const cit = this.project.getCitation(citationId);
          if (cit) {
            this.selectCitation(citationId);
            menuEntries.push(
              {
                label: "Edit Reference",
                action: () => {
                  this.selectWorkspace("references");
                  this.selectSubTab("reference");
                  const titleInput = document.getElementById("form-title") as HTMLInputElement | null;
                  titleInput?.focus();
                },
              },
              {
                label: "Copy APA 7 Citation",
                shortcut: `${mod}+C`,
                action: async () => {
                  const text = this.apa7.formatReference(cit, "text");
                  await navigator.clipboard.writeText(text);
                },
              },
              {
                label: "Copy BibTeX Entry",
                action: async () => {
                  const text = BibTeXFormatter.formatCitation(cit);
                  await navigator.clipboard.writeText(text);
                },
              },
              {
                label: "Duplicate Reference",
                action: () => {
                  this.duplicateCitation();
                },
              },
              { type: "divider" },
              {
                label: "Delete Reference",
                danger: true,
                action: async () => {
                  await this.deleteCitation();
                },
              }
            );
          }
        } else if (quoteId) {
          const curCit = this.getSelectedCitation();
          const quote = curCit?.annotation.quotes.find((q) => q.id === quoteId);
          if (quote) {
            menuEntries.push(
              {
                label: "Edit Quote / Idea",
                action: () => {
                  this.editQuoteModal(quoteId);
                },
              },
              {
                label: "Copy Quote Text",
                shortcut: `${mod}+C`,
                action: async () => {
                  await navigator.clipboard.writeText(quote.quoteText);
                },
              },
              { type: "divider" },
              {
                label: "Delete Quote",
                danger: true,
                action: () => {
                  this.deleteQuote(quoteId);
                },
              }
            );
          }
        } else if (selectedText) {
          menuEntries.push(
            {
              label: "Copy",
              shortcut: `${mod}+C`,
              action: async () => {
                await navigator.clipboard.writeText(selectedText);
              },
            },
            {
              label: "Select All",
              shortcut: `${mod}+A`,
              action: () => {
                document.execCommand("selectAll");
              },
            }
          );
        }
      }

      // If no entries matched (blank canvas / general areas), do not display any context menu
      if (menuEntries.length === 0) {
        return;
      }

      this.showContextMenu(e.clientX, e.clientY, menuEntries);
    });
  }

  showContextMenu(x: number, y: number, entries: ContextMenuEntry[]): void {
    this.closeContextMenu();

    const menuEl = document.createElement("div");
    menuEl.id = "app-context-menu";
    menuEl.className = "app-context-menu";
    menuEl.setAttribute("role", "menu");
    menuEl.setAttribute("tabindex", "-1");

    entries.forEach((entry) => {
      if ("type" in entry && entry.type === "divider") {
        const divider = document.createElement("div");
        divider.className = "context-menu-divider";
        menuEl.appendChild(divider);
      } else if ("label" in entry) {
        const itemBtn = document.createElement("button");
        itemBtn.className = `context-menu-item ${entry.danger ? "danger" : ""}`;
        itemBtn.setAttribute("role", "menuitem");
        if (entry.disabled) {
          itemBtn.disabled = true;
          itemBtn.classList.add("disabled");
        }

        const labelSpan = document.createElement("span");
        labelSpan.className = "context-menu-label";
        labelSpan.innerText = entry.label;
        itemBtn.appendChild(labelSpan);

        if (entry.shortcut) {
          const shortcutSpan = document.createElement("span");
          shortcutSpan.className = "context-menu-shortcut";
          shortcutSpan.innerText = entry.shortcut;
          itemBtn.appendChild(shortcutSpan);
        }

        itemBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeContextMenu();
          if (!entry.disabled) {
            entry.action();
          }
        });

        menuEl.appendChild(itemBtn);
      }
    });

    document.body.appendChild(menuEl);

    // Position and clamp within viewport
    const rect = menuEl.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;

    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }

    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
    menuEl.focus();
  }

  closeContextMenu(): void {
    const existing = document.getElementById("app-context-menu");
    if (existing) {
      existing.remove();
    }
  }

  // --- Workspaces & Sub-tabs Navigation ---
  selectWorkspace(ws: "references" | "bibliography" | "overview"): void {
    this.currentWorkspace = ws;
    ["references", "bibliography", "overview"].forEach((w) => {
      const el = document.getElementById(`workspace-${w}`);
      const btn = document.getElementById(`tab-btn-${w === "references" ? "refs" : w === "bibliography" ? "bib" : "overview"}`);
      if (el) el.classList.toggle("active", w === ws);
      if (btn) btn.classList.toggle("active", w === ws);
    });

    if (ws === "bibliography") {
      this.renderCompiledBibliography();
    } else if (ws === "overview") {
      this.renderOverview();
    }
  }

  selectSubTab(tab: "reference" | "annotation"): void {
    this.currentSubTab = tab;
    const refContent = document.getElementById("sub-content-ref");
    const annotContent = document.getElementById("sub-content-annot");
    const refBtn = document.getElementById("sub-tab-ref");
    const annotBtn = document.getElementById("sub-tab-annot");

    if (refContent) refContent.style.display = tab === "reference" ? "block" : "none";
    if (annotContent) annotContent.style.display = tab === "annotation" ? "block" : "none";
    if (refBtn) refBtn.classList.toggle("active", tab === "reference");
    if (annotBtn) annotBtn.classList.toggle("active", tab === "annotation");
  }

  // --- Project State & Refreshing ---
  refreshAll(): void {
    this.updateProjectBadge();
    this.updateTagOptions();
    this.renderCitationList();
    this.loadSelectedCitationIntoForm();
  }

  updateProjectBadge(): void {
    const modified = this.isModified ? " • (unsaved)" : "";
    document.title = `${this.project.title}${modified} — Citarium`;
  }

  updateTagOptions(): void {
    const select = document.getElementById("filter-tag") as HTMLSelectElement | null;
    if (!select) return;
    const curVal = select.value;
    const allTags = ["All Tags", ...this.project.getAllTags()];

    select.innerHTML = allTags
      .map((t) => `<option value="${t}">${t}</option>`)
      .join("");

    if (allTags.includes(curVal)) {
      select.value = curVal;
    } else {
      select.value = "All Tags";
    }
  }

  getSelectedCitation(): Citation | null {
    if (!this.selectedCitationId) return null;
    return this.project.getCitation(this.selectedCitationId) || null;
  }

  // --- Citation List Sidebar ---
  onSearchInput(): void {
    this.renderCitationList();
  }

  onFilterChange(): void {
    this.renderCitationList();
  }

  renderCitationList(): void {
    const listEl = document.getElementById("citation-list");
    if (!listEl) return;

    const query = (document.getElementById("search-input") as HTMLInputElement)?.value?.trim().toLowerCase() || "";
    const statusFilter = (document.getElementById("filter-status") as HTMLSelectElement)?.value || "All Statuses";
    const tagFilter = (document.getElementById("filter-tag") as HTMLSelectElement)?.value || "All Tags";
    const sortVal = (document.getElementById("sort-select") as HTMLSelectElement)?.value || "Author (A-Z)";

    let filtered = this.project.citations.filter((c) => {
      if (query && !c.matchesSearch(query)) return false;
      if (statusFilter !== "All Statuses" && c.annotation.status !== statusFilter) return false;
      if (tagFilter !== "All Tags" && !c.annotation.tags.includes(tagFilter)) return false;
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortVal === "Author (A-Z)") {
        const cmpAuthor = a.getSortAuthor().toLowerCase().localeCompare(b.getSortAuthor().toLowerCase());
        if (cmpAuthor !== 0) return cmpAuthor;
        return a.getSortYear().localeCompare(b.getSortYear());
      } else if (sortVal === "Year (Newest)") {
        return b.getSortYear().localeCompare(a.getSortYear());
      } else if (sortVal === "Year (Oldest)") {
        return a.getSortYear().localeCompare(b.getSortYear());
      } else if (sortVal === "Title (A-Z)") {
        return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      } else if (sortVal === "Rating (High-Low)") {
        return b.annotation.rating - a.annotation.rating;
      } else if (sortVal === "Date Added") {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return 0;
    });

    if (filtered.length > 0 && (!this.selectedCitationId || !filtered.some((c) => c.id === this.selectedCitationId))) {
      this.selectedCitationId = filtered[0].id;
    } else if (filtered.length === 0) {
      this.selectedCitationId = null;
    }

    listEl.innerHTML = filtered
      .map((c) => {
        const isSelected = c.id === this.selectedCitationId;
        const authorYear = `${c.getAuthorSummary()} (${c.year || "n.d."})`;
        const title = c.title || "Untitled Reference";
        const status = c.annotation.status || "To Read";
        const rating = c.annotation.rating > 0 ? "★".repeat(c.annotation.rating) : "";

        let badgeClass = "badge";
        if (status === "Key Source") badgeClass += " badge-key";
        else if (status === "Annotated") badgeClass += " badge-annotated";

        return `
          <li class="citation-item ${isSelected ? "selected" : ""}" data-citation-id="${c.id}" onclick="app.selectCitation('${c.id}')">
            <div class="citation-item-author-year">${this.escapeHtml(authorYear)}</div>
            <div class="citation-item-title">${this.escapeHtml(title)}</div>
            <div class="citation-item-meta">
              <span class="${badgeClass}">${this.escapeHtml(status)}</span>
              <span style="color: #f59e0b;">${rating}</span>
            </div>
          </li>
        `;
      })
      .join("");
  }

  selectCitation(citationId: string): void {
    this.selectedCitationId = citationId;
    this.renderCitationList();
    this.loadSelectedCitationIntoForm();
  }

  addCitation(): void {
    const newCit = new Citation({
      title: "New Reference",
      entryType: "journal_article",
    });
    this.project.addCitation(newCit);
    this.isModified = true;
    this.selectedCitationId = newCit.id;
    this.refreshAll();
  }

  duplicateCitation(): void {
    const cur = this.getSelectedCitation();
    if (!cur) return;
    const d = cur.toDict();
    delete d.id;
    d.title = `${cur.title} (Copy)`;
    const dup = Citation.fromDict(d);
    this.project.addCitation(dup);
    this.isModified = true;
    this.selectedCitationId = dup.id;
    this.refreshAll();
  }

  async deleteCitation(): Promise<void> {
    const cur = this.getSelectedCitation();
    if (!cur) return;
    const confirmed = await this.showConfirmDialog(`Are you sure you want to permanently delete '${cur.title}'?`);
    if (confirmed) {
      this.project.removeCitation(cur.id);
      this.isModified = true;
      this.selectedCitationId = null;
      this.refreshAll();
    }
  }

  // --- Reference Form & Annotation Studio Sync ---
  loadSelectedCitationIntoForm(): void {
    const cit = this.getSelectedCitation();

    const setVal = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) el.value = val;
    };

    if (!cit) {
      setVal("form-entry-type", "journal_article");
      setVal("form-authors", "");
      setVal("form-editors", "");
      setVal("form-title", "");
      setVal("form-year", "");
      setVal("form-date", "");
      setVal("form-container-title", "");
      setVal("form-volume", "");
      setVal("form-issue", "");
      setVal("form-pages", "");
      setVal("form-publisher", "");
      setVal("form-institution", "");
      setVal("form-doi", "");
      setVal("form-url", "");
      setVal("form-edition", "");
      setVal("form-report-number", "");

      setVal("annot-status", "To Read");
      setVal("annot-rating", "0");
      setVal("annot-tags", "");
      setVal("annot-summary", "");
      setVal("annot-evaluation", "");
      setVal("annot-relevance", "");
      setVal("annot-notes", "");

      const previewRef = document.getElementById("preview-reference");
      const previewInText = document.getElementById("preview-intext");
      if (previewRef) previewRef.innerText = "No reference selected.";
      if (previewInText) previewInText.innerText = "In-text: (n.d.)";
      this.renderIdeasTable([]);
      return;
    }

    setVal("form-entry-type", cit.entryType);
    setVal("form-authors", Author.formatAuthorList(cit.authors));
    setVal("form-editors", Author.formatAuthorList(cit.editors));
    setVal("form-title", cit.title);
    setVal("form-year", cit.year);
    setVal("form-date", cit.date);
    setVal("form-container-title", cit.containerTitle);
    setVal("form-volume", cit.volume);
    setVal("form-issue", cit.issue);
    setVal("form-pages", cit.pages);
    setVal("form-publisher", cit.publisher);
    setVal("form-institution", cit.institution);
    setVal("form-doi", cit.doi);
    setVal("form-url", cit.url);
    setVal("form-edition", cit.edition);
    setVal("form-report-number", cit.reportNumber);

    setVal("annot-status", cit.annotation.status || "To Read");
    setVal("annot-rating", String(cit.annotation.rating || 0));
    setVal("annot-tags", cit.annotation.tags.join(", "));
    setVal("annot-summary", cit.annotation.summary);
    setVal("annot-evaluation", cit.annotation.evaluation);
    setVal("annot-relevance", cit.annotation.relevance);
    setVal("annot-notes", cit.annotation.generalNotes);

    this.updateFieldLabels(cit.entryType);
    this.updatePreview();
    this.renderIdeasTable(cit.annotation.quotes);
    this.triggerUrlCheck(cit);
  }

  updateFieldLabels(entryType: string): void {
    const lblTitle = document.getElementById("lbl-title");
    const lblContainer = document.getElementById("lbl-container");

    if (entryType === "book") {
      if (lblTitle) lblTitle.innerText = "Book Title";
      if (lblContainer) lblContainer.innerText = "Series Title";
    } else if (entryType === "book_chapter") {
      if (lblTitle) lblTitle.innerText = "Chapter Title";
      if (lblContainer) lblContainer.innerText = "Book Title";
    } else if (entryType === "website") {
      if (lblTitle) lblTitle.innerText = "Page Title";
      if (lblContainer) lblContainer.innerText = "Site Name";
    } else if (entryType === "conference_paper") {
      if (lblTitle) lblTitle.innerText = "Paper Title";
      if (lblContainer) lblContainer.innerText = "Proceedings Title";
    } else if (entryType === "report") {
      if (lblTitle) lblTitle.innerText = "Report Title";
      if (lblContainer) lblContainer.innerText = "Series / Org";
    } else if (entryType === "dissertation") {
      if (lblTitle) lblTitle.innerText = "Thesis Title";
      if (lblContainer) lblContainer.innerText = "Degree / Dept";
    } else {
      if (lblTitle) lblTitle.innerText = "Article Title";
      if (lblContainer) lblContainer.innerText = "Journal / Periodical Name";
    }
  }

  updatePreview(): void {
    const cit = this.getSelectedCitation();
    const previewRef = document.getElementById("preview-reference");
    const previewInText = document.getElementById("preview-intext");

    if (!cit) {
      if (previewRef) previewRef.innerText = "No reference selected.";
      if (previewInText) previewInText.innerText = "In-text: (n.d.)";
      return;
    }

    const ref = this.apa7.formatReference(cit, "text");
    const inTextParen = this.apa7.formatInText(cit, false);
    const inTextNarr = this.apa7.formatInText(cit, true);

    if (previewRef) previewRef.innerText = ref;
    if (previewInText) previewInText.innerText = `In-text: ${inTextParen}  |  Narrative: ${inTextNarr}`;
  }

  triggerUrlCheck(cit: Citation): void {
    const indicator = document.getElementById("url-status-indicator");
    if (!indicator) return;

    if (!cit.url.trim()) {
      indicator.innerText = "";
      return;
    }

    this.urlChecker.checkAsync(
      cit.url,
      cit.title,
      cit.containerTitle,
      (result) => {
        if (result === true) {
          indicator.innerText = "✓ Valid";
          indicator.style.color = "var(--success)";
        } else if (result === false) {
          indicator.innerText = "✗ Unverified";
          indicator.style.color = "var(--danger)";
        } else {
          indicator.innerText = "";
        }
      }
    );
  }

  onFieldChange(field: string): void {
    let cit = this.getSelectedCitation();
    if (!cit) {
      this.addCitation();
      cit = this.getSelectedCitation();
    }
    if (!cit) return;

    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || "";

    if (field === "entryType") cit.entryType = (document.getElementById("form-entry-type") as HTMLSelectElement).value;
    else if (field === "title") cit.title = getVal("form-title");
    else if (field === "year") cit.year = getVal("form-year");
    else if (field === "date") cit.date = getVal("form-date");
    else if (field === "containerTitle") cit.containerTitle = getVal("form-container-title");
    else if (field === "volume") cit.volume = getVal("form-volume");
    else if (field === "issue") cit.issue = getVal("form-issue");
    else if (field === "pages") cit.pages = getVal("form-pages");
    else if (field === "publisher") cit.publisher = getVal("form-publisher");
    else if (field === "institution") cit.institution = getVal("form-institution");
    else if (field === "doi") cit.doi = getVal("form-doi");
    else if (field === "url") cit.url = getVal("form-url");
    else if (field === "edition") cit.edition = getVal("form-edition");
    else if (field === "reportNumber") cit.reportNumber = getVal("form-report-number");

    this.isModified = true;
    this.updateFieldLabels(cit.entryType);
    this.updatePreview();
    this.renderCitationList();
    this.updateProjectBadge();
    if (field === "url" || field === "title" || field === "containerTitle") {
      this.triggerUrlCheck(cit);
    }
  }

  onAuthorsInput(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    const raw = (document.getElementById("form-authors") as HTMLInputElement).value;
    cit.authors = Author.parseMultiple(raw);
    this.isModified = true;
    this.updatePreview();
    this.renderCitationList();
    this.updateProjectBadge();
  }

  onEditorsInput(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    const raw = (document.getElementById("form-editors") as HTMLInputElement).value;
    cit.editors = Author.parseMultiple(raw);
    this.isModified = true;
    this.updatePreview();
    this.renderCitationList();
    this.updateProjectBadge();
  }

  onAnnotChange(field: string): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;

    if (field === "status") cit.annotation.status = (document.getElementById("annot-status") as HTMLSelectElement).value;
    else if (field === "rating") cit.annotation.rating = Number((document.getElementById("annot-rating") as HTMLSelectElement).value);
    else if (field === "tags") {
      const raw = (document.getElementById("annot-tags") as HTMLInputElement).value;
      cit.annotation.tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
      this.updateTagOptions();
    } else if (field === "summary") cit.annotation.summary = (document.getElementById("annot-summary") as HTMLTextAreaElement).value;
    else if (field === "evaluation") cit.annotation.evaluation = (document.getElementById("annot-evaluation") as HTMLTextAreaElement).value;
    else if (field === "relevance") cit.annotation.relevance = (document.getElementById("annot-relevance") as HTMLTextAreaElement).value;
    else if (field === "generalNotes") cit.annotation.generalNotes = (document.getElementById("annot-notes") as HTMLTextAreaElement).value;

    this.isModified = true;
    this.renderCitationList();
    this.updateProjectBadge();
  }

  // --- Copy Actions ---
  copyPreviewReference(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    navigator.clipboard.writeText(this.apa7.formatReference(cit, "text"));
  }

  copyPreviewInText(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    navigator.clipboard.writeText(this.apa7.formatInText(cit, false));
  }

  copyPreviewBibTeX(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    navigator.clipboard.writeText(BibTeXFormatter.formatCitation(cit));
  }

  // --- Ideas / Quotes Table & Modal ---
  renderIdeasTable(quotes: Quote[]): void {
    const tbody = document.getElementById("ideas-table-body");
    if (!tbody) return;

    if (quotes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No quotes or ideas recorded yet. Click '+ Add Idea' to record key quotes.</td></tr>`;
      return;
    }

    tbody.innerHTML = quotes
      .map((q) => {
        return `
          <tr data-quote-id="${q.id}">
            <td>"${this.escapeHtml(q.quoteText)}"</td>
            <td><span class="badge">${this.escapeHtml(q.getLocationDisplay() || "-")}</span></td>
            <td>${this.escapeHtml(q.notes || "-")}</td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" onclick="app.editQuoteModal('${q.id}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="app.deleteQuote('${q.id}')">✕</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  openQuoteModal(quote?: Quote): void {
    this.editingQuoteId = quote ? quote.id : null;
    const titleEl = document.getElementById("quote-modal-title");
    const textEl = document.getElementById("quote-modal-text") as HTMLTextAreaElement;
    const locTypeEl = document.getElementById("quote-modal-loc-type") as HTMLSelectElement;
    const pageEl = document.getElementById("quote-modal-page") as HTMLInputElement;
    const notesEl = document.getElementById("quote-modal-notes") as HTMLInputElement;

    if (titleEl) titleEl.innerText = quote ? "Edit Idea / Quote" : "Add Idea / Quote";
    if (textEl) textEl.value = quote ? quote.quoteText : "";
    if (locTypeEl) locTypeEl.value = quote ? quote.locationType : "Page";
    if (pageEl) pageEl.value = quote ? quote.pageNumber : "";
    if (notesEl) notesEl.value = quote ? quote.notes : "";

    this.openModal("modal-quote");
  }

  editQuoteModal(quoteId: string): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    const q = cit.annotation.quotes.find((item) => item.id === quoteId);
    if (q) this.openQuoteModal(q);
  }

  saveQuoteModal(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;

    const text = (document.getElementById("quote-modal-text") as HTMLTextAreaElement).value.trim();
    if (!text) return;

    const locType = (document.getElementById("quote-modal-loc-type") as HTMLSelectElement).value;
    const page = (document.getElementById("quote-modal-page") as HTMLInputElement).value.trim();
    const notes = (document.getElementById("quote-modal-notes") as HTMLInputElement).value.trim();

    if (this.editingQuoteId) {
      const q = cit.annotation.quotes.find((item) => item.id === this.editingQuoteId);
      if (q) {
        q.quoteText = text;
        q.locationType = locType;
        q.pageNumber = page;
        q.notes = notes;
      }
    } else {
      cit.annotation.quotes.push(
        new Quote({
          quoteText: text,
          locationType: locType,
          pageNumber: page,
          notes,
        })
      );
    }

    this.isModified = true;
    this.renderIdeasTable(cit.annotation.quotes);
    this.closeModal("modal-quote");
    this.updateProjectBadge();
  }

  deleteQuote(quoteId: string): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    cit.annotation.quotes = cit.annotation.quotes.filter((q) => q.id !== quoteId);
    this.isModified = true;
    this.renderIdeasTable(cit.annotation.quotes);
    this.updateProjectBadge();
  }

  // --- Manage Authors / Editors Modal ---
  openAuthorsDialog(mode: "authors" | "editors"): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    this.authorModalMode = mode;
    this.modalAuthorsList = (mode === "authors" ? cit.authors : cit.editors).map(
      (a) => Author.fromDict(a.toDict())
    );
    this.selectedModalAuthorIdx = null;

    const titleEl = document.getElementById("authors-modal-title");
    if (titleEl) titleEl.innerText = mode === "authors" ? "Manage Authors" : "Manage Editors";

    this.renderModalAuthorsTable();
    this.clearModalAuthorForm();
    this.openModal("modal-authors");
  }

  renderModalAuthorsTable(): void {
    const tbody = document.getElementById("authors-table-body");
    if (!tbody) return;

    if (this.modalAuthorsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No contributors added.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.modalAuthorsList
      .map((a, i) => {
        const isSelected = i === this.selectedModalAuthorIdx;
        return `
          <tr style="cursor: pointer; background: ${isSelected ? "var(--bg-selected)" : "transparent"};" onclick="app.selectModalAuthor(${i})">
            <td>${i + 1}</td>
            <td><strong>${this.escapeHtml(a.displayName() || "(Blank)")}</strong></td>
            <td style="color: var(--text-muted);">${this.escapeHtml(a.apaFormat() || "-")}</td>
          </tr>
        `;
      })
      .join("");
  }

  selectModalAuthor(idx: number): void {
    this.selectedModalAuthorIdx = idx;
    const a = this.modalAuthorsList[idx];
    const isOrgEl = document.getElementById("author-is-org") as HTMLInputElement;
    if (isOrgEl) {
      isOrgEl.checked = a.isOrganization;
      this.toggleAuthorOrgMode();
    }

    if (a.isOrganization) {
      (document.getElementById("author-org-name") as HTMLInputElement).value = a.organizationName;
    } else {
      (document.getElementById("author-first") as HTMLInputElement).value = a.firstName;
      (document.getElementById("author-middle") as HTMLInputElement).value = a.middleName;
      (document.getElementById("author-last") as HTMLInputElement).value = a.lastName;
      (document.getElementById("author-suffix") as HTMLInputElement).value = a.suffix;
    }
    this.renderModalAuthorsTable();
  }

  toggleAuthorOrgMode(): void {
    const isOrg = (document.getElementById("author-is-org") as HTMLInputElement)?.checked;
    const personFields = document.getElementById("author-person-fields");
    const orgFields = document.getElementById("author-org-fields");
    if (personFields) personFields.style.display = isOrg ? "none" : "block";
    if (orgFields) orgFields.style.display = isOrg ? "block" : "none";
  }

  clearModalAuthorForm(): void {
    (document.getElementById("author-is-org") as HTMLInputElement).checked = false;
    this.toggleAuthorOrgMode();
    (document.getElementById("author-first") as HTMLInputElement).value = "";
    (document.getElementById("author-middle") as HTMLInputElement).value = "";
    (document.getElementById("author-last") as HTMLInputElement).value = "";
    (document.getElementById("author-suffix") as HTMLInputElement).value = "";
    (document.getElementById("author-org-name") as HTMLInputElement).value = "";
    this.selectedModalAuthorIdx = null;
  }

  getModalAuthorFromForm(): Author | null {
    const isOrg = (document.getElementById("author-is-org") as HTMLInputElement)?.checked;
    if (isOrg) {
      const orgName = (document.getElementById("author-org-name") as HTMLInputElement).value.trim();
      if (!orgName) return null;
      return new Author({ isOrganization: true, organizationName: orgName });
    } else {
      const first = (document.getElementById("author-first") as HTMLInputElement).value.trim();
      const mid = (document.getElementById("author-middle") as HTMLInputElement).value.trim();
      const last = (document.getElementById("author-last") as HTMLInputElement).value.trim();
      const suffix = (document.getElementById("author-suffix") as HTMLInputElement).value.trim();
      if (!first && !last) return null;
      return new Author({ firstName: first, middleName: mid, lastName: last, suffix });
    }
  }

  addAuthorToList(): void {
    const a = this.getModalAuthorFromForm();
    if (a) {
      this.modalAuthorsList.push(a);
      this.renderModalAuthorsTable();
      this.clearModalAuthorForm();
    }
  }

  updateAuthorInList(): void {
    if (this.selectedModalAuthorIdx === null) return;
    const a = this.getModalAuthorFromForm();
    if (a) {
      this.modalAuthorsList[this.selectedModalAuthorIdx] = a;
      this.renderModalAuthorsTable();
    }
  }

  moveAuthorUp(): void {
    const idx = this.selectedModalAuthorIdx;
    if (idx !== null && idx > 0) {
      const temp = this.modalAuthorsList[idx];
      this.modalAuthorsList[idx] = this.modalAuthorsList[idx - 1];
      this.modalAuthorsList[idx - 1] = temp;
      this.selectedModalAuthorIdx = idx - 1;
      this.renderModalAuthorsTable();
    }
  }

  moveAuthorDown(): void {
    const idx = this.selectedModalAuthorIdx;
    if (idx !== null && idx < this.modalAuthorsList.length - 1) {
      const temp = this.modalAuthorsList[idx];
      this.modalAuthorsList[idx] = this.modalAuthorsList[idx + 1];
      this.modalAuthorsList[idx + 1] = temp;
      this.selectedModalAuthorIdx = idx + 1;
      this.renderModalAuthorsTable();
    }
  }

  removeAuthor(): void {
    const idx = this.selectedModalAuthorIdx;
    if (idx !== null) {
      this.modalAuthorsList.splice(idx, 1);
      this.clearModalAuthorForm();
      this.renderModalAuthorsTable();
    }
  }

  applyAuthorsModal(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    if (this.authorModalMode === "authors") {
      cit.authors = this.modalAuthorsList;
      (document.getElementById("form-authors") as HTMLInputElement).value = Author.formatAuthorList(cit.authors);
    } else {
      cit.editors = this.modalAuthorsList;
      (document.getElementById("form-editors") as HTMLInputElement).value = Author.formatAuthorList(cit.editors);
    }
    this.isModified = true;
    this.updatePreview();
    this.renderCitationList();
    this.closeModal("modal-authors");
    this.updateProjectBadge();
  }

  // --- Import BibTeX Modal ---
  openImportDialog(): void {
    (document.getElementById("import-bibtex-text") as HTMLTextAreaElement).value = "";
    (document.getElementById("import-summary-label") as HTMLDivElement).innerText = "Ready to parse.";
    this.parsedBibtexCitations = [];
    this.openModal("modal-import");
  }

  previewBibtexImport(): void {
    const raw = (document.getElementById("import-bibtex-text") as HTMLTextAreaElement).value.trim();
    const summary = document.getElementById("import-summary-label") as HTMLDivElement;
    if (!raw) {
      if (summary) summary.innerText = "Please enter some BibTeX text.";
      return;
    }

    try {
      this.parsedBibtexCitations = BibTeXParser.parse(raw);
      if (this.parsedBibtexCitations.length === 0) {
        if (summary) summary.innerText = "No valid BibTeX entries found.";
      } else {
        if (summary) summary.innerText = `Found ${this.parsedBibtexCitations.length} citation(s) ready to import.`;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (summary) summary.innerText = `Error: ${msg}`;
    }
  }

  confirmBibtexImport(): void {
    if (this.parsedBibtexCitations.length === 0) {
      this.previewBibtexImport();
    }
    if (this.parsedBibtexCitations.length === 0) return;

    for (const c of this.parsedBibtexCitations) {
      this.project.addCitation(c);
    }
    this.isModified = true;
    this.closeModal("modal-import");
    this.refreshAll();
  }

  // --- Compiled Bibliography Workspace ---
  renderCompiledBibliography(): void {
    const format = (document.getElementById("bib-view-format") as HTMLSelectElement)?.value || "apa7_standard";
    const out = document.getElementById("compiled-bibliography-text") as HTMLTextAreaElement;
    if (!out) return;

    if (this.project.citations.length === 0) {
      out.value = "No citations in this project yet. Add citations in the References workspace.";
      return;
    }

    const sorted = [...this.project.citations].sort((a, b) => {
      const cmp = a.getSortAuthor().toLowerCase().localeCompare(b.getSortAuthor().toLowerCase());
      if (cmp !== 0) return cmp;
      return a.getSortYear().localeCompare(b.getSortYear());
    });

    if (format === "apa7_summary") {
      out.value = sorted
        .map((c) => {
          const ref = this.apa7.formatReference(c, "text");
          const summary = c.annotation.summary.trim();
          return summary ? `${ref}\n\n    ${summary}` : ref;
        })
        .join("\n\n");
    } else if (format === "apa7_annotated") {
      out.value = sorted.map((c) => this.apa7.formatAnnotatedEntry(c, "text")).join("\n\n");
    } else if (format === "bibtex") {
      out.value = exportToBibtex(this.project);
    } else {
      out.value = sorted.map((c) => this.apa7.formatReference(c, "text")).join("\n\n");
    }
  }

  copyCompiledBibliography(): void {
    const out = document.getElementById("compiled-bibliography-text") as HTMLTextAreaElement;
    if (out && out.value) {
      navigator.clipboard.writeText(out.value);
    }
  }

  // --- Overview Workspace ---
  renderOverview(): void {
    const titleEl = document.getElementById("overview-title");
    const authorEl = document.getElementById("overview-author");
    const descEl = document.getElementById("overview-desc");

    if (titleEl) titleEl.innerText = this.project.title;
    if (authorEl) authorEl.innerText = `Researcher: ${this.project.author || "Not specified"}`;
    if (descEl) descEl.innerText = this.project.description || "No description provided.";

    const citCount = this.project.citations.length;
    const wordCount = this.project.getTotalAnnotationWordCount();
    const quotesCount = this.project.citations.reduce((acc, c) => acc + c.annotation.quotes.length, 0);

    const ratings = this.project.citations.map((c) => c.annotation.rating).filter((r) => r > 0);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const statCits = document.getElementById("stat-citations");
    const statWords = document.getElementById("stat-words");
    const statQuotes = document.getElementById("stat-quotes");
    const statRating = document.getElementById("stat-rating");

    if (statCits) statCits.innerText = String(citCount);
    if (statWords) {
      if (this.project.targetWordCount > 0) {
        const pct = Math.round((wordCount / this.project.targetWordCount) * 100);
        statWords.innerText = `${wordCount.toLocaleString()} / ${this.project.targetWordCount.toLocaleString()} (${pct}%)`;
      } else {
        statWords.innerText = `${wordCount.toLocaleString()} Words`;
      }
    }
    if (statQuotes) statQuotes.innerText = String(quotesCount);
    if (statRating) statRating.innerText = `★ ${avgRating.toFixed(1)}`;

    // Type Breakdown Table
    const typeTable = document.getElementById("overview-type-table");
    if (typeTable) {
      const typeCounts = this.project.getTypeCounts();
      typeTable.innerHTML = Object.entries(typeCounts)
        .map(([type, count]) => `<tr><td>${type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</td><td><strong>${count}</strong></td></tr>`)
        .join("");
    }

    // Status Breakdown Table
    const statusTable = document.getElementById("overview-status-table");
    if (statusTable) {
      const statusCounts = this.project.getStatusCounts();
      statusTable.innerHTML = Object.entries(statusCounts)
        .map(([status, count]) => `<tr><td>${status}</td><td><strong>${count}</strong></td></tr>`)
        .join("");
    }
  }

  // --- File & Project Operations ---
  async newProject(): Promise<void> {
    if (this.isModified) {
      const confirmed = await this.showConfirmDialog("You have unsaved changes. Create new project anyway?");
      if (!confirmed) {
        return;
      }
    }
    this.dismissWarningBanner();
    this.project = new Project({
      title: "New Writing Project",
      description: "Annotated bibliography and research reference repository.",
    });
    this.currentFilepath = null;
    this.currentFileHandle = null;
    this.isModified = false;
    this.selectedCitationId = null;
    this.refreshAll();
    this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: null } }).catch(() => {});
  }

  async openProjectFileDialog(): Promise<void> {
    // 1. Native desktop open file dialog via Electrobun RPC
    if (this.isDesktop && this.electrobun?.rpc?.request?.openFileDialog) {
      try {
        const res = await this.electrobun.rpc.request.openFileDialog({
          allowedFileTypes: "json",
        });
        if (res?.success && res.filepath) {
          const loadRes = await this.electrobun.rpc.request.loadProject({ filepath: res.filepath });
          if (loadRes?.success && loadRes.project) {
            this.project = Project.fromDict(loadRes.project);
            this.currentFilepath = res.filepath;
            this.currentFileHandle = null;
            this.isModified = false;
            this.selectedCitationId = this.project.citations.length > 0 ? this.project.citations[0].id : null;
            this.refreshAll();
            await this.electrobun.rpc.request.saveSettings({ settings: { lastOpenedFile: this.currentFilepath } });
            return;
          } else {
            await this.showWarningDialog(`Failed to open project: ${loadRes?.error || "Unknown error"}`);
            return;
          }
        } else if (res?.success && !res.filepath) {
          // User cancelled dialog
          return;
        }
      } catch (err) {
        console.warn("Native openFileDialog failed, falling back to web file picker:", err);
      }
    }

    // 2. Web File System Access API (showOpenFilePicker)
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Citarium Project (*.json)",
              accept: { "application/json": [".json"] },
            },
          ],
          multiple: false,
        });
        if (handle) {
          const file = await handle.getFile();
          const text = await file.text();
          const data = JSON.parse(text);
          this.project = Project.fromDict(data);
          const fullPath = file.path || file.name;
          this.currentFilepath = fullPath;
          this.currentFileHandle = handle;
          this.isModified = false;
          this.selectedCitationId = this.project.citations.length > 0 ? this.project.citations[0].id : null;
          this.refreshAll();
          if (this.currentFilepath && (this.currentFilepath.includes("/") || this.currentFilepath.includes("\\"))) {
            if (this.isDesktop) {
              this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: this.currentFilepath } }).catch(() => {});
            }
          }
          return;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.warn("showOpenFilePicker failed, falling back to file input:", err);
      }
    }

    // 3. Fallback HTML file input
    const input = document.getElementById("hidden-file-input") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.click();
    }
  }

  onFileInputSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const filepath = file.path || file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text);
        this.project = Project.fromDict(data);
        this.currentFilepath = filepath;
        this.currentFileHandle = null;
        this.isModified = false;
        this.selectedCitationId = this.project.citations.length > 0 ? this.project.citations[0].id : null;
        this.refreshAll();
        if (this.currentFilepath && (this.currentFilepath.includes("/") || this.currentFilepath.includes("\\"))) {
          if (this.isDesktop) {
            this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: this.currentFilepath } }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Failed to load project:", err);
      }
    };
    reader.onerror = (err) => {
      console.error("FileReader error:", err);
    };
    reader.readAsText(file);
  }

  async loadExampleProject(): Promise<void> {
    this.dismissWarningBanner();
    try {
      const resp = await fetch("/examples/feline_behavior_annotated_bibliography.json");
      if (resp.ok) {
        const data = await resp.json();
        this.project = Project.fromDict(data);
        this.currentFilepath = null;
        this.currentFileHandle = null;
        this.isModified = false;
        this.selectedCitationId = this.project.citations.length > 0 ? this.project.citations[0].id : null;
        this.refreshAll();
      }
    } catch (e) {
      console.error("Failed to load example project:", e);
    }
  }

  async saveProjectToFile(forceSaveAs: boolean = false): Promise<boolean> {
    const content = JSON.stringify(this.project.toDict(), null, 2);

    // 1. If not forcing Save As and an active FileHandle exists, write directly to it
    if (!forceSaveAs && this.currentFileHandle && typeof this.currentFileHandle.createWritable === "function") {
      try {
        const writable = await this.currentFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        this.isModified = false;
        this.updateProjectBadge();
        if (this.currentFilepath) {
          this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: this.currentFilepath } }).catch(() => {});
        }
        return true;
      } catch (err) {
        console.warn("Writing to currentFileHandle failed, falling back to save dialog:", err);
        this.currentFileHandle = null;
      }
    }

    // 2. If not forcing Save As and backend RPC save is available with an absolute path
    if (!forceSaveAs && this.isDesktop && this.currentFilepath && (this.currentFilepath.includes("/") || this.currentFilepath.includes("\\"))) {
      try {
        const res = await this.electrobun?.rpc?.request?.saveProject?.({
          filepath: this.currentFilepath,
          project: this.project.toDict(),
        });
        if (res?.success) {
          this.isModified = false;
          this.currentFilepath = res.filepath || this.currentFilepath;
          this.updateProjectBadge();
          this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: this.currentFilepath } }).catch(() => {});
          return true;
        }
      } catch (err) {
        console.warn("Backend save failed:", err);
      }
    }

    // 3. Prompt user with Save dialog (File System Access API or browser download)
    try {
      const filename = this.currentFilepath || `${this.project.title.toLowerCase().replace(/\s+/g, "_")}.json`;
      const handle = await this.saveTextFileWithDialog(content, filename, [
        {
          description: "Citarium Project (*.json)",
          accept: { "application/json": [".json"] },
        },
      ]);
      if (handle) {
        this.currentFileHandle = handle;
        if (handle.name) {
          this.currentFilepath = handle.name;
        }
        this.isModified = false;
        this.updateProjectBadge();
        if (this.currentFilepath && this.isDesktop) {
          this.electrobun?.rpc?.request?.saveSettings?.({ settings: { lastOpenedFile: this.currentFilepath } }).catch(() => {});
        }
        return true;
      } else {
        // User cancelled the save dialog or dialog failed
        return false;
      }
    } catch (err) {
      console.error("Failed to save project:", err);
      return false;
    }
  }

  async handleAppClose(): Promise<boolean> {
    if (!this.isModified) {
      if (this.isDesktop && this.electrobun?.rpc?.request?.closeWindow) {
        await this.electrobun.rpc.request.closeWindow({});
      }
      return true;
    }

    // Show OS Message Box for modified changes
    let response = 2; // default to Cancel
    if (this.isDesktop && this.electrobun?.rpc?.request?.showMessageBox) {
      try {
        const res = await this.electrobun.rpc.request.showMessageBox({
          type: "question",
          title: "Citarium",
          message: `Do you want to save the changes you made to "${this.project.title}"?`,
          detail: "Your changes will be lost if you don't save them.",
          buttons: ["Save", "Don't Save", "Cancel"],
          defaultId: 0,
          cancelId: 2,
        });
        if (res?.success && typeof res.response === "number") {
          response = res.response;
        }
      } catch (err) {
        console.warn("showMessageBox failed:", err);
      }
    } else {
      // Web / non-desktop fallback: confirm dialog
      const shouldSave = window.confirm(
        `Do you want to save changes to "${this.project.title}" before closing?\n\nClick OK to Save, or Cancel to close without saving.`
      );
      if (shouldSave) {
        response = 0; // Save
      } else {
        response = 1; // Don't Save
      }
    }

    if (response === 1) {
      // "Don't Save" -> Discard changes and close window
      this.isModified = false;
      if (this.isDesktop && this.electrobun?.rpc?.request?.closeWindow) {
        await this.electrobun.rpc.request.closeWindow({});
      }
      return true;
    }

    if (response === 0) {
      // "Save" -> Attempt to save the project (opens Save As dialog for new files)
      const saved = await this.saveProjectToFile();
      if (saved) {
        // Saved successfully -> proceed to close window
        if (this.isDesktop && this.electrobun?.rpc?.request?.closeWindow) {
          await this.electrobun.rpc.request.closeWindow({});
        }
        return true;
      } else {
        // User cancelled Save As dialog or save failed -> keep app open
        return false;
      }
    }

    // "Cancel" (response === 2 or any other) -> keep app open
    return false;
  }


  async exportMarkdown(): Promise<void> {
    const content = exportToMarkdown(this.project);
    const filename = `${this.project.title.toLowerCase().replace(/\s+/g, "_")}_annotated_bibliography.md`;
    await this.saveTextFileWithDialog(content, filename, [
      {
        description: "Markdown Document (*.md)",
        accept: { "text/markdown": [".md"], "text/plain": [".md"] },
      },
    ]);
  }

  async exportPlainText(): Promise<void> {
    const content = exportToPlainText(this.project);
    const filename = `${this.project.title.toLowerCase().replace(/\s+/g, "_")}_references.txt`;
    await this.saveTextFileWithDialog(content, filename, [
      {
        description: "Plain Text Document (*.txt)",
        accept: { "text/plain": [".txt"] },
      },
    ]);
  }

  async exportBibtex(): Promise<void> {
    const content = exportToBibtex(this.project);
    const filename = `${this.project.title.toLowerCase().replace(/\s+/g, "_")}.bib`;
    await this.saveTextFileWithDialog(content, filename, [
      {
        description: "BibTeX File (*.bib)",
        accept: { "application/x-bibtex": [".bib"], "text/plain": [".bib"] },
      },
    ]);
  }

  async saveTextFileWithDialog(
    content: string,
    suggestedName: string,
    types: Array<{ description: string; accept: Record<string, string[]> }>
  ): Promise<FileSystemFileHandle | null> {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types,
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return handle;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled the save dialog
          return null;
        }
        console.warn("showSaveFilePicker failed, falling back to download:", err);
      }
    }

    // Fallback for environments without File System Access API
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return null;
  }

  // --- Modal Helpers ---
  openModal(modalId: string): void {
    const m = document.getElementById(modalId);
    if (m) m.classList.add("active");
  }

  closeModal(modalId: string): void {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove("active");
  }

  openGuideDialog(): void {
    this.openModal("modal-guide");
  }

  openAboutDialog(): void {
    this.openModal("modal-about");
  }

  escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Global App Singleton on window
const app = new CitariumApp();
window.app = app;

window.addEventListener("DOMContentLoaded", () => {
  app.init();
});
