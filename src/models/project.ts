/**
 * Data model for a writing project containing citations and project metadata.
 */
import { Citation } from "./citation";

export type ProjectDict = Record<string, unknown>;

export class Project {
  id: string;
  schemaVersion: string;
  title: string;
  author: string;
  description: string;
  citationStyle: string;
  tags: string[];
  citations: Citation[];
  targetWordCount: number;
  createdAt: string;
  updatedAt: string;

  constructor(opts: Partial<Project> = {}) {
    this.id = opts.id ?? crypto.randomUUID();
    this.schemaVersion = opts.schemaVersion ?? "1.0";
    this.title = opts.title ?? "Untitled Project";
    this.author = opts.author ?? "";
    this.description = opts.description ?? "";
    this.citationStyle = opts.citationStyle ?? "apa7";
    this.tags = opts.tags ?? [];
    this.citations = opts.citations ?? [];
    this.targetWordCount = opts.targetWordCount ?? 0;
    this.createdAt = opts.createdAt ?? new Date().toISOString();
    this.updatedAt = opts.updatedAt ?? new Date().toISOString();
  }

  markUpdated(): void {
    this.updatedAt = new Date().toISOString();
  }

  toDict(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      schema_version: this.schemaVersion,
      id: this.id,
      title: this.title,
    };
    if (this.author.trim()) data.author = this.author.trim();
    if (this.description.trim()) data.description = this.description.trim();
    if (this.citationStyle) data.citation_style = this.citationStyle;
    if (this.tags.length) data.tags = [...this.tags];
    if (this.targetWordCount > 0)
      data.target_word_count = this.targetWordCount;
    if (this.createdAt) data.created_at = this.createdAt;
    if (this.updatedAt) data.updated_at = this.updatedAt;
    data.citations = this.citations.map((c) => c.toDict());
    return data;
  }

  static fromDict(data: unknown): Project {
    if (typeof data !== "object" || data === null) {
      return new Project();
    }
    const d = data as Record<string, unknown>;

    const citations: Citation[] = [];
    if (Array.isArray(d.citations)) {
      for (const c of d.citations) {
        citations.push(Citation.fromDict(c));
      }
    }

    let tags = d.tags;
    if (!Array.isArray(tags)) {
      tags = tags != null ? [String(tags)] : [];
    }

    return new Project({
      schemaVersion: String(d.schema_version ?? "1.0"),
      id: String(d.id ?? crypto.randomUUID()),
      title: String(d.title ?? "Untitled Project"),
      author: String(d.author ?? ""),
      description: String(d.description ?? ""),
      citationStyle: String(d.citation_style ?? "apa7"),
      tags: (tags as unknown[])
        .map((t) => String(t).trim())
        .filter(Boolean),
      targetWordCount: Number(d.target_word_count ?? 0),
      createdAt: String(d.created_at ?? new Date().toISOString()),
      updatedAt: String(d.updated_at ?? new Date().toISOString()),
      citations,
    });
  }

  addCitation(citation: Citation): void {
    this.citations.push(citation);
    this.markUpdated();
  }

  insertCitation(index: number, citation: Citation): void {
    this.citations.splice(index, 0, citation);
    this.markUpdated();
  }

  removeCitation(citationId: string): boolean {
    const initialLen = this.citations.length;
    this.citations = this.citations.filter((c) => c.id !== citationId);
    if (this.citations.length !== initialLen) {
      this.markUpdated();
      return true;
    }
    return false;
  }

  getCitation(citationId: string): Citation | undefined {
    return this.citations.find((c) => c.id === citationId);
  }

  updateCitation(citation: Citation): boolean {
    for (let idx = 0; idx < this.citations.length; idx++) {
      if (this.citations[idx].id === citation.id) {
        citation.updatedAt = new Date().toISOString();
        this.citations[idx] = citation;
        this.markUpdated();
        return true;
      }
    }
    return false;
  }

  getAllTags(): string[] {
    const tagSet = new Set<string>(this.tags);
    for (const c of this.citations) {
      for (const t of c.annotation.tags) {
        if (t) tagSet.add(t);
      }
    }
    return [...tagSet].sort();
  }

  getStatusCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of this.citations) {
      const st = c.annotation.status || "To Read";
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return counts;
  }

  getTypeCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of this.citations) {
      counts[c.entryType] = (counts[c.entryType] ?? 0) + 1;
    }
    return counts;
  }

  sortCitations(by: string = "author", reverse: boolean = false): void {
    const dir = reverse ? -1 : 1;

    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

    if (by === "author") {
      this.citations.sort(
        (a, b) =>
          dir *
          (cmp(a.getSortAuthor().toLowerCase(), b.getSortAuthor().toLowerCase()) ||
            cmp(a.getSortYear(), b.getSortYear()) ||
            cmp(a.title.toLowerCase(), b.title.toLowerCase()))
      );
    } else if (by === "year") {
      this.citations.sort(
        (a, b) =>
          dir *
          (cmp(a.getSortYear(), b.getSortYear()) ||
            cmp(a.getSortAuthor().toLowerCase(), b.getSortAuthor().toLowerCase()) ||
            cmp(a.title.toLowerCase(), b.title.toLowerCase()))
      );
    } else if (by === "title") {
      this.citations.sort(
        (a, b) => dir * cmp(a.title.toLowerCase(), b.title.toLowerCase())
      );
    } else if (by === "rating") {
      this.citations.sort(
        (a, b) => dir * (a.annotation.rating - b.annotation.rating)
      );
    } else if (by === "date_added") {
      this.citations.sort(
        (a, b) => dir * cmp(a.createdAt, b.createdAt)
      );
    }
    this.markUpdated();
  }

  /** Calculate total words across all annotations in this project. */
  getTotalAnnotationWordCount(): number {
    let total = 0;
    for (const c of this.citations) {
      const text = c.annotation.fullAnnotationText();
      if (text) {
        total += text.split(/\s+/).filter(Boolean).length;
      }
    }
    return total;
  }
}
