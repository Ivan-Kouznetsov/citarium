/**
 * Data model for individual bibliographic citations.
 */
import { Author } from "./author";
import { Annotation } from "./annotation";

export const ENTRY_TYPES: Record<string, string> = {
  journal_article: "Journal Article",
  book: "Book",
  edited_book: "Edited Book",
  book_chapter: "Book Chapter",
  conference_paper: "Conference Paper",
  website: "Webpage / Website",
  report: "Report / Working Paper",
  dissertation: "Dissertation / Thesis",
  newspaper_article: "Newspaper / Magazine",
  other: "Other / Generic",
};

export class Citation {
  id: string;
  entryType: string;
  title: string;
  authors: Author[];
  editors: Author[];
  year: string;
  date: string; // e.g., "2023-05-14" or "May 14"
  containerTitle: string; // Journal, Book, Website, Newspaper
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  publisherPlace: string;
  doi: string;
  url: string;
  accessDate: string;
  edition: string; // e.g., "2nd ed."
  series: string;
  institution: string; // For reports / dissertations
  reportNumber: string;
  annotation: Annotation;
  createdAt: string;
  updatedAt: string;

  constructor(opts: Partial<Citation> = {}) {
    this.id = opts.id ?? crypto.randomUUID();
    this.entryType = opts.entryType ?? "journal_article";
    this.title = opts.title ?? "";
    this.authors = opts.authors ?? [];
    this.editors = opts.editors ?? [];
    this.year = opts.year ?? "";
    this.date = opts.date ?? "";
    this.containerTitle = opts.containerTitle ?? "";
    this.volume = opts.volume ?? "";
    this.issue = opts.issue ?? "";
    this.pages = opts.pages ?? "";
    this.publisher = opts.publisher ?? "";
    this.publisherPlace = opts.publisherPlace ?? "";
    this.doi = opts.doi ?? "";
    this.url = opts.url ?? "";
    this.accessDate = opts.accessDate ?? "";
    this.edition = opts.edition ?? "";
    this.series = opts.series ?? "";
    this.institution = opts.institution ?? "";
    this.reportNumber = opts.reportNumber ?? "";
    this.annotation = opts.annotation ?? new Annotation();
    this.createdAt = opts.createdAt ?? new Date().toISOString();
    this.updatedAt = opts.updatedAt ?? new Date().toISOString();
  }

  toDict(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      id: this.id,
      entry_type: this.entryType,
      title: this.title,
    };
    if (this.authors.length) {
      data.authors = this.authors.map((a) => a.toDict());
    }
    if (this.editors.length) {
      data.editors = this.editors.map((e) => e.toDict());
    }

    const optionalFields: [string, string][] = [
      ["year", this.year],
      ["date", this.date],
      ["container_title", this.containerTitle],
      ["volume", this.volume],
      ["issue", this.issue],
      ["pages", this.pages],
      ["publisher", this.publisher],
      ["publisher_place", this.publisherPlace],
      ["doi", this.doi],
      ["url", this.url],
      ["access_date", this.accessDate],
      ["edition", this.edition],
      ["series", this.series],
      ["institution", this.institution],
      ["report_number", this.reportNumber],
    ];
    for (const [key, val] of optionalFields) {
      if (typeof val === "string" && val.trim()) {
        data[key] = val.trim();
      }
    }

    if (!this.annotation.isEmpty()) {
      data.annotation = this.annotation.toDict();
    }

    if (this.createdAt) data.created_at = this.createdAt;
    if (this.updatedAt) data.updated_at = this.updatedAt;

    return data;
  }

  static fromDict(data: unknown): Citation {
    if (typeof data !== "object" || data === null) {
      return new Citation();
    }
    const d = data as Record<string, unknown>;

    const authors: Author[] = [];
    if (Array.isArray(d.authors)) {
      for (const a of d.authors) {
        authors.push(Author.fromDict(a as Record<string, unknown>));
      }
    }

    const editors: Author[] = [];
    if (Array.isArray(d.editors)) {
      for (const e of d.editors) {
        editors.push(Author.fromDict(e as Record<string, unknown>));
      }
    }

    const annotData = d.annotation;
    const annotation =
      typeof annotData === "object" && annotData !== null
        ? Annotation.fromDict(annotData)
        : new Annotation();

    return new Citation({
      id: String(d.id ?? crypto.randomUUID()),
      entryType: String(d.entry_type ?? "journal_article"),
      title: String(d.title ?? ""),
      authors,
      editors,
      year: String(d.year ?? ""),
      date: String(d.date ?? ""),
      containerTitle: String(d.container_title ?? ""),
      volume: String(d.volume ?? ""),
      issue: String(d.issue ?? ""),
      pages: String(d.pages ?? ""),
      publisher: String(d.publisher ?? ""),
      publisherPlace: String(d.publisher_place ?? ""),
      doi: String(d.doi ?? ""),
      url: String(d.url ?? ""),
      accessDate: String(d.access_date ?? ""),
      edition: String(d.edition ?? ""),
      series: String(d.series ?? ""),
      institution: String(d.institution ?? ""),
      reportNumber: String(d.report_number ?? ""),
      annotation,
      createdAt: String(d.created_at ?? new Date().toISOString()),
      updatedAt: String(d.updated_at ?? new Date().toISOString()),
    });
  }

  get typeDisplay(): string {
    return ENTRY_TYPES[this.entryType] ?? "Reference";
  }

  /** Returns human-readable author summary (e.g. 'Smith et al.' or 'Smith & Jones'). */
  getAuthorSummary(): string {
    if (!this.authors.length) {
      if (this.editors.length) {
        const edNames = this.editors.map((e) => e.displayName());
        return `${edNames.join(", ")} (Eds.)`;
      }
      if (this.institution) return this.institution;
      return "No Author";
    }
    if (this.authors.length === 1) {
      return this.authors[0].displayName();
    } else if (this.authors.length === 2) {
      return `${this.authors[0].displayName()} & ${this.authors[1].displayName()}`;
    } else {
      return `${this.authors[0].displayName()} et al.`;
    }
  }

  /** Primary sorting key by author last name or fallback. */
  getSortAuthor(): string {
    if (this.authors.length) {
      return (
        this.authors[0].lastName ||
        this.authors[0].organizationName ||
        this.authors[0].firstName
      );
    }
    if (this.editors.length) {
      return this.editors[0].lastName || this.editors[0].organizationName;
    }
    if (this.institution) return this.institution;
    return this.title || "ZZZ";
  }

  /** Sorting key for year. */
  getSortYear(): string {
    return this.year || "0000";
  }

  /** Returns clean DOI without http/https prefixes. */
  getCleanDoi(): string {
    let d = this.doi.trim();
    if (!d) return "";
    d = d
      .replace("https://doi.org/", "")
      .replace("http://doi.org/", "")
      .replace("doi:", "");
    return d.trim();
  }

  /** Returns standard https://doi.org/... link. */
  getDoiUrl(): string {
    const cd = this.getCleanDoi();
    if (cd) return `https://doi.org/${cd}`;
    return "";
  }

  /** Check if citation matches search query across fields, tags, and annotations. */
  matchesSearch(query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase().trim();

    // Search title, container, year, doi, url
    if (
      this.title.toLowerCase().includes(q) ||
      this.containerTitle.toLowerCase().includes(q) ||
      this.year.toLowerCase().includes(q) ||
      this.publisher.toLowerCase().includes(q) ||
      this.institution.toLowerCase().includes(q) ||
      this.doi.toLowerCase().includes(q)
    ) {
      return true;
    }

    // Search authors & editors
    for (const a of this.authors) {
      if (
        a.firstName.toLowerCase().includes(q) ||
        a.lastName.toLowerCase().includes(q) ||
        a.organizationName.toLowerCase().includes(q)
      ) {
        return true;
      }
    }
    for (const e of this.editors) {
      if (
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.organizationName.toLowerCase().includes(q)
      ) {
        return true;
      }
    }

    // Search annotations, notes, quotes, tags
    if (
      this.annotation.summary.toLowerCase().includes(q) ||
      this.annotation.evaluation.toLowerCase().includes(q) ||
      this.annotation.relevance.toLowerCase().includes(q) ||
      this.annotation.generalNotes.toLowerCase().includes(q) ||
      this.annotation.status.toLowerCase().includes(q)
    ) {
      return true;
    }

    for (const t of this.annotation.tags) {
      if (t.toLowerCase().includes(q)) return true;
    }

    for (const quote of this.annotation.quotes) {
      if (
        quote.quoteText.toLowerCase().includes(q) ||
        quote.notes.toLowerCase().includes(q)
      ) {
        return true;
      }
    }

    return false;
  }
}
