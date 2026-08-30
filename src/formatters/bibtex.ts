/**
 * BibTeX exporter and formatter.
 */
import { Citation } from "../models/citation";
import { Author } from "../models/author";

export class BibTeXFormatter {
  static readonly TYPE_MAP: Record<string, string> = {
    journal_article: "article",
    book: "book",
    edited_book: "book",
    book_chapter: "incollection",
    conference_paper: "inproceedings",
    website: "misc",
    report: "techreport",
    dissertation: "phdthesis",
    newspaper_article: "article",
    other: "misc",
  };

  /** Generate unique citekey e.g., 'smith2023deep'. */
  static generateCitekey(citation: Citation): string {
    let authorPart = "anon";
    if (citation.authors.length > 0) {
      const firstAuth = citation.authors[0];
      authorPart = (firstAuth.lastName || firstAuth.organizationName || "author").toLowerCase();
    } else if (citation.editors.length > 0) {
      const firstEd = citation.editors[0];
      authorPart = (firstEd.lastName || firstEd.organizationName || "editor").toLowerCase();
    } else if (citation.institution) {
      authorPart = citation.institution.split(/\s+/)[0].toLowerCase();
    }

    authorPart = authorPart.replace(/[^a-z0-9]/g, "");

    let yearPart = citation.year.trim() || "nodate";
    yearPart = yearPart.replace(/[^0-9]/g, "") || "nodate";

    let titleWord = "doc";
    if (citation.title) {
      const words = citation.title
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .map((w) => w.toLowerCase());
      if (words.length > 0) {
        titleWord = words[0];
      }
    }

    return `${authorPart}${yearPart}${titleWord}`;
  }

  static formatCitation(citation: Citation): string {
    const bibType = BibTeXFormatter.TYPE_MAP[citation.entryType] || "misc";
    const citekey = BibTeXFormatter.generateCitekey(citation);

    const fields: string[] = [];

    // Authors
    if (citation.authors.length > 0) {
      const authorStrs: string[] = [];
      for (const a of citation.authors) {
        if (a.isOrganization) {
          authorStrs.push(`{${a.organizationName}}`);
        } else {
          const parts: string[] = [];
          if (a.lastName) {
            parts.push(a.lastName);
          }
          const given = [a.firstName, a.middleName].filter(Boolean).join(" ");
          if (given) {
            authorStrs.push(`${a.lastName}, ${given}`);
          } else {
            authorStrs.push(a.lastName || a.displayName());
          }
        }
      }
      fields.push(`  author = {${authorStrs.join(" and ")}}`);
    }

    // Title
    if (citation.title) {
      fields.push(`  title = {${citation.title}}`);
    }

    // Journal / Container
    if (citation.containerTitle) {
      if (bibType === "article") {
        fields.push(`  journal = {${citation.containerTitle}}`);
      } else if (bibType === "incollection" || bibType === "inproceedings") {
        fields.push(`  booktitle = {${citation.containerTitle}}`);
      } else {
        fields.push(`  howpublished = {${citation.containerTitle}}`);
      }
    }

    // Year
    if (citation.year) {
      fields.push(`  year = {${citation.year}}`);
    }

    // Volume / Issue
    if (citation.volume) {
      fields.push(`  volume = {${citation.volume}}`);
    }
    if (citation.issue) {
      fields.push(`  number = {${citation.issue}}`);
    }

    // Pages
    if (citation.pages) {
      fields.push(`  pages = {${citation.pages}}`);
    }

    // Publisher / Institution
    if (citation.publisher) {
      fields.push(`  publisher = {${citation.publisher}}`);
    }
    if (citation.institution) {
      fields.push(`  institution = {${citation.institution}}`);
    }

    // DOI / URL
    if (citation.doi) {
      fields.push(`  doi = {${citation.getCleanDoi()}}`);
    }
    if (citation.url) {
      fields.push(`  url = {${citation.url}}`);
    }

    // Notes / Annotation summary
    if (!citation.annotation.isEmpty()) {
      const summary = citation.annotation.summary
        .replace(/\n/g, " ")
        .replace(/\}/g, "\\}");
      if (summary) {
        fields.push(`  note = {${summary}}`);
      }
    }

    const content = fields.join(",\n");
    return `@${bibType}{${citekey},\n${content}\n}`;
  }
}
