/**
 * Citarium Web UI Application Controller (TypeScript)
 */
import { Project, Citation, Author, Quote, CITATION_STATUSES } from "../models";
import { APA7Formatter } from "../formatters/apa7";
import { BibTeXFormatter } from "../formatters/bibtex";
import { BibTeXParser } from "../io/bibtex-parser";
import { exportToMarkdown, exportToPlainText, exportToBibtex } from "../io/exporters";
import { AsyncURLChecker } from "../utils/url-validator";
import Electrobun, { Electroview } from "electrobun/view";
import type { CitariumRPC } from "../rpc-types";

const rpc = Electroview.defineRPC<CitariumRPC>({
  maxRequestTime: 5000,
  handlers: { requests: {}, messages: {} },
});

const electrobun = new Electrobun.Electroview({ rpc });

export class CitariumApp {
  project: Project;
  selectedCitationId: string | null = null;
  currentWorkspace: "references" | "bibliography" | "overview" = "references";
  currentSubTab: "reference" | "annotation" = "reference";
  isDirty: boolean = false;
  currentFilepath: string | null = null;

  currentPlatform: "mac" | "windows" | "linux" = "mac";
  currentTheme: "system" | "light" | "dark" = "system";

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

    const savedTheme = (localStorage.getItem("citarium_theme") as any) || "system";
    this.applyTheme(savedTheme);

    // Check if we can load example or default
    this.refreshAll();
    this.loadExampleProject();
  }

  detectPlatform(): "mac" | "windows" | "linux" {
    const userAgent = (typeof navigator !== "undefined" ? navigator.userAgent || "" : "").toLowerCase();
    const platform = (typeof navigator !== "undefined" ? navigator.platform || "" : "").toLowerCase();
    if (platform.includes("mac") || userAgent.includes("macintosh") || userAgent.includes("mac os")) {
      return "mac";
    }
    if (platform.includes("win") || userAgent.includes("windows")) {
      return "windows";
    }
    return "linux";
  }

  applyTheme(theme: "system" | "light" | "dark"): void {
    this.currentTheme = theme;
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }

    const themeSelectEl = document.getElementById("settings-theme-select") as HTMLSelectElement;
    if (themeSelectEl) themeSelectEl.value = theme;

    try {
      localStorage.setItem("citarium_theme", theme);
    } catch {}
  }

  onThemeSelectChange(value: string): void {
    this.applyTheme(value as "system" | "light" | "dark");
  }

  // Native Desktop Dropdown Menus
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
    document.querySelectorAll(".desktop-dropdown-menu").forEach((m) => {
      m.classList.remove("active");
    });
    document.querySelectorAll(".menu-trigger-btn").forEach((b) => {
      b.classList.remove("active");
    });
  }

  // Native window management is now handled by Electrobun window frame

  setupKeyboardShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const isMac = this.currentPlatform === "mac";
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === "n") {
        e.preventDefault();
        this.newProject();
      } else if (modKey && e.key === "o") {
        e.preventDefault();
        this.openProjectFileDialog();
      } else if (modKey && e.key === "s") {
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
  }

  setupGlobalClick(): void {
    window.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".menu-item-container")) {
        this.closeAllMenus();
      }
    });
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
    const dirty = this.isDirty ? " • (unsaved)" : "";
    document.title = `${this.project.title}${dirty} — Citarium`;
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
          <li class="citation-item ${isSelected ? "selected" : ""}" onclick="app.selectCitation('${c.id}')">
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
    this.isDirty = true;
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
    this.isDirty = true;
    this.selectedCitationId = dup.id;
    this.refreshAll();
  }

  deleteCitation(): void {
    const cur = this.getSelectedCitation();
    if (!cur) return;
    if (confirm(`Are you sure you want to permanently delete '${cur.title}'?`)) {
      this.project.removeCitation(cur.id);
      this.isDirty = true;
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

    this.isDirty = true;
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
    this.isDirty = true;
    this.updatePreview();
    this.renderCitationList();
    this.updateProjectBadge();
  }

  onEditorsInput(): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    const raw = (document.getElementById("form-editors") as HTMLInputElement).value;
    cit.editors = Author.parseMultiple(raw);
    this.isDirty = true;
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

    this.isDirty = true;
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
          <tr>
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

    this.isDirty = true;
    this.renderIdeasTable(cit.annotation.quotes);
    this.closeModal("modal-quote");
    this.updateProjectBadge();
  }

  deleteQuote(quoteId: string): void {
    const cit = this.getSelectedCitation();
    if (!cit) return;
    cit.annotation.quotes = cit.annotation.quotes.filter((q) => q.id !== quoteId);
    this.isDirty = true;
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
    this.isDirty = true;
    this.updatePreview();
    this.renderCitationList();
    this.closeModal("modal-authors");
    this.updateProjectBadge();
  }

  // --- Project Settings Modal ---
  openProjectSettings(): void {
    const settingsTheme = document.getElementById("settings-theme-select") as HTMLSelectElement;
    if (settingsTheme) settingsTheme.value = this.currentTheme;

    (document.getElementById("project-modal-title") as HTMLInputElement).value = this.project.title;
    (document.getElementById("project-modal-author") as HTMLInputElement).value = this.project.author;
    (document.getElementById("project-modal-desc") as HTMLTextAreaElement).value = this.project.description;
    (document.getElementById("project-modal-tags") as HTMLInputElement).value = this.project.tags.join(", ");
    (document.getElementById("project-modal-words") as HTMLInputElement).value = String(this.project.targetWordCount || "");
    this.openModal("modal-project");
  }

  saveProjectSettings(): void {
    this.project.title = (document.getElementById("project-modal-title") as HTMLInputElement).value.trim() || "Untitled Project";
    this.project.author = (document.getElementById("project-modal-author") as HTMLInputElement).value.trim();
    this.project.description = (document.getElementById("project-modal-desc") as HTMLTextAreaElement).value.trim();
    const tagsRaw = (document.getElementById("project-modal-tags") as HTMLInputElement).value.trim();
    this.project.tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    this.project.targetWordCount = parseInt((document.getElementById("project-modal-words") as HTMLInputElement).value) || 0;

    this.isDirty = true;
    this.closeModal("modal-project");
    this.refreshAll();
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
    const summary = document.getElementById("import-summary-label");
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
    } catch (e: any) {
      if (summary) summary.innerText = `Error: ${e.message}`;
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
    this.isDirty = true;
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
  newProject(): void {
    if (this.isDirty && !confirm("You have unsaved changes. Create new project anyway?")) {
      return;
    }
    this.project = new Project({
      title: "New Writing Project",
      description: "Annotated bibliography and research reference repository.",
    });
    this.currentFilepath = null;
    this.isDirty = false;
    this.selectedCitationId = null;
    this.refreshAll();
  }

  async openProjectFileDialog(): Promise<void> {
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
    const filepath = file.name; // In a real native app we'd use native dialogs
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text);
        
        // Inform backend
        const res = await electrobun.rpc!.request.saveProject({ filepath, project: data });
        if (!res.success) throw new Error(res.error);

        this.project = Project.fromDict(data);
        this.currentFilepath = filepath;
        this.isDirty = false;
        this.selectedCitationId = null;
        this.refreshAll();
      } catch (err: any) {
        alert(`Failed to load project: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  async saveProjectToFile(): Promise<void> {
    try {
      const res = await electrobun.rpc!.request.saveProject({
        filepath: this.currentFilepath || "",
        project: this.project.toDict(),
      });
      if (res.success) {
        this.isDirty = false;
        this.currentFilepath = res.filepath || this.currentFilepath;
        this.updateProjectBadge();
        alert("Project saved successfully.");
      } else {
        alert(`Failed to save project: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Failed to save project: ${err.message}`);
    }
  }

  async loadExampleProject(): Promise<void> {
    try {
      const res = await electrobun.rpc!.request.getExampleProject({});
      if (res.success && res.project) {
        this.project = Project.fromDict(res.project);
        this.isDirty = false;
        this.currentFilepath = "feline_behavior_annotated_bibliography.json";
        this.selectedCitationId = null;
        this.refreshAll();
      } else {
        console.warn("Example project not loaded:", res.error);
      }
    } catch (err) {
      console.warn("Failed to load example via RPC", err);
    }
  }

  exportMarkdown(): void {
    const content = exportToMarkdown(this.project);
    this.downloadTextFile(content, `${this.project.title.toLowerCase().replace(/\s+/g, "_")}_annotated_bibliography.md`);
  }

  exportPlainText(): void {
    const content = exportToPlainText(this.project);
    this.downloadTextFile(content, `${this.project.title.toLowerCase().replace(/\s+/g, "_")}_references.txt`);
  }

  exportBibtex(): void {
    const content = exportToBibtex(this.project);
    this.downloadTextFile(content, `${this.project.title.toLowerCase().replace(/\s+/g, "_")}.bib`);
  }

  downloadTextFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
(window as any).app = app;

window.addEventListener("DOMContentLoaded", () => {
  app.init();
});
