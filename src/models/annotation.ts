/**
 * Data model for citation annotations, evaluations, quotes, and research notes.
 */

export class Quote {
  id: string;
  quoteText: string;
  pageNumber: string;
  locationType: string; // "Page" or "Paragraph"
  notes: string;

  constructor(opts: Partial<Quote> = {}) {
    this.id = opts.id ?? crypto.randomUUID();
    this.quoteText = opts.quoteText ?? "";
    this.pageNumber = opts.pageNumber ?? "";
    this.locationType = opts.locationType ?? "Page";
    this.notes = opts.notes ?? "";
  }

  toDict(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      id: this.id,
      quote_text: this.quoteText,
    };
    if (this.pageNumber.trim()) data.page_number = this.pageNumber.trim();
    if (this.locationType && this.locationType !== "Page") {
      data.location_type = this.locationType;
    }
    if (this.notes.trim()) data.notes = this.notes.trim();
    return data;
  }

  static fromDict(data: unknown): Quote {
    if (typeof data !== "object" || data === null) {
      return new Quote({ quoteText: String(data) });
    }
    const d = data as Record<string, unknown>;
    return new Quote({
      id: String(d.id ?? crypto.randomUUID()),
      quoteText: String(d.quote_text ?? ""),
      pageNumber: String(d.page_number ?? d.location ?? ""),
      locationType: String(d.location_type ?? "Page") || "Page",
      notes: String(d.notes ?? ""),
    });
  }

  getLocationDisplay(): string {
    if (!this.pageNumber.trim()) return "";
    const locType = this.locationType || "Page";
    const num = this.pageNumber.trim();
    const lower = num.toLowerCase();
    if (
      lower.startsWith("page") ||
      lower.startsWith("p.") ||
      lower.startsWith("pp.") ||
      lower.startsWith("para")
    ) {
      return num;
    }
    return `${locType} ${num}`;
  }

  getCitationLocationStr(): string {
    if (!this.pageNumber.trim()) return "";
    const locType = this.locationType || "Page";
    const num = this.pageNumber.trim();
    if (locType.toLowerCase() === "paragraph") {
      if (num.toLowerCase().startsWith("para")) {
        return ` (${num})`;
      }
      return ` (para. ${num})`;
    } else {
      const lower = num.toLowerCase();
      if (
        lower.startsWith("p.") ||
        lower.startsWith("pp.") ||
        lower.startsWith("page")
      ) {
        return ` (${num})`;
      }
      return ` (p. ${num})`;
    }
  }
}

/** Alias for Quote (ideas/quotes are the same entity). */
export const Idea = Quote;

export const CITATION_STATUSES = [
  "To Read",
  "Reading",
  "Annotated",
  "Key Source",
  "Review Later",
  "Archived",
] as const;

export type CitationStatus = (typeof CITATION_STATUSES)[number];

export class Annotation {
  summary: string;
  evaluation: string;
  relevance: string;
  quotes: Quote[];
  tags: string[];
  status: string;
  rating: number; // 0 to 5
  generalNotes: string;

  constructor(opts: Partial<Annotation> = {}) {
    this.summary = opts.summary ?? "";
    this.evaluation = opts.evaluation ?? "";
    this.relevance = opts.relevance ?? "";
    this.quotes = opts.quotes ?? [];
    this.tags = opts.tags ?? [];
    this.status = opts.status ?? "To Read";
    this.rating = opts.rating ?? 0;
    this.generalNotes = opts.generalNotes ?? "";
  }

  toDict(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (this.summary.trim()) data.summary = this.summary.trim();
    if (this.evaluation.trim()) data.evaluation = this.evaluation.trim();
    if (this.relevance.trim()) data.relevance = this.relevance.trim();
    if (this.quotes.length) data.quotes = this.quotes.map((q) => q.toDict());
    if (this.tags.length) data.tags = [...this.tags];
    if (this.status && this.status !== "To Read") data.status = this.status;
    if (this.rating && this.rating > 0) {
      data.rating = Math.max(0, Math.min(5, Math.floor(this.rating)));
    }
    if (this.generalNotes.trim()) {
      data.general_notes = this.generalNotes.trim();
    }
    return data;
  }

  static fromDict(data: unknown): Annotation {
    if (typeof data !== "object" || data === null) {
      return new Annotation();
    }
    const d = data as Record<string, unknown>;

    let quotesData = d.quotes;
    const quotes: Quote[] = [];
    if (Array.isArray(quotesData)) {
      for (const q of quotesData) {
        quotes.push(Quote.fromDict(q));
      }
    }

    let tags = d.tags;
    if (!Array.isArray(tags)) {
      tags = tags != null ? [String(tags)] : [];
    }

    return new Annotation({
      summary: String(d.summary ?? ""),
      evaluation: String(d.evaluation ?? ""),
      relevance: String(d.relevance ?? ""),
      quotes,
      tags: (tags as unknown[])
        .map((t) => String(t).trim())
        .filter(Boolean),
      status: String(d.status ?? "To Read"),
      rating: Number(d.rating ?? 0),
      generalNotes: String(d.general_notes ?? ""),
    });
  }

  /** Check if all annotation fields are blank. */
  isEmpty(): boolean {
    return !(
      this.summary.trim() ||
      this.evaluation.trim() ||
      this.relevance.trim() ||
      this.generalNotes.trim() ||
      this.quotes.length ||
      this.tags.length
    );
  }

  /** Combine structured annotation components into formatted text block. */
  fullAnnotationText(): string {
    const parts: string[] = [];
    if (this.summary.trim()) parts.push(this.summary.trim());
    if (this.evaluation.trim())
      parts.push(`Evaluation: ${this.evaluation.trim()}`);
    if (this.relevance.trim())
      parts.push(`Relevance: ${this.relevance.trim()}`);
    if (this.generalNotes.trim())
      parts.push(`Notes: ${this.generalNotes.trim()}`);
    if (this.quotes.length) {
      const quoteLines: string[] = [];
      for (const q of this.quotes) {
        if (q.quoteText.trim()) {
          const pageStr = q.getCitationLocationStr();
          quoteLines.push(`"${q.quoteText.trim()}"${pageStr}`);
        }
      }
      if (quoteLines.length) {
        parts.push(
          "Ideas:\n" + quoteLines.map((line) => `- ${line}`).join("\n")
        );
      }
    }
    return parts.join("\n\n");
  }

  /** Calculate word count for this annotation. */
  getWordCount(): number {
    const text = this.fullAnnotationText();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }
}
