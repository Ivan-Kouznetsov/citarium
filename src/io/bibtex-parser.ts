/**
 * Lightweight parser for importing BibTeX citations.
 */
import { Citation } from "../models/citation";
import { Author } from "../models/author";

export class BibTeXParser {
  static readonly TYPE_REVERSE_MAP: Record<string, string> = {
    article: "journal_article",
    book: "book",
    booklet: "other",
    inbook: "book_chapter",
    incollection: "book_chapter",
    inproceedings: "conference_paper",
    conference: "conference_paper",
    manual: "report",
    mastersthesis: "dissertation",
    phdthesis: "dissertation",
    techreport: "report",
    misc: "website",
    unpublished: "other",
    online: "website",
  };

  static parse(bibText: string): Citation[] {
    const citations: Citation[] = [];
    const entryStartPattern = /@([a-zA-Z]+)\s*(\{)/g;

    let match: RegExpExecArray | null;
    while ((match = entryStartPattern.exec(bibText)) !== null) {
      const entryTypeRaw = match[1].toLowerCase();
      const openBraceIdx = match.index + match[0].length - 1;

      // Find matching closing brace
      let braceCount = 1;
      let inQuote = false;
      let endPos = -1;

      for (let i = openBraceIdx + 1; i < bibText.length; i++) {
        const char = bibText[i];
        if (char === '"' && (i === 0 || bibText[i - 1] !== "\\")) {
          inQuote = !inQuote;
        } else if (!inQuote) {
          if (char === "{") {
            braceCount++;
          } else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              endPos = i;
              break;
            }
          }
        }
      }

      let content: string;
      if (endPos === -1) {
        content = bibText.slice(openBraceIdx + 1);
        entryStartPattern.lastIndex = bibText.length;
      } else {
        content = bibText.slice(openBraceIdx + 1, endPos);
        entryStartPattern.lastIndex = endPos + 1;
      }

      // Extract citekey and field body
      const firstComma = content.indexOf(",");
      let citekey: string;
      let body: string;
      if (firstComma !== -1) {
        citekey = content.slice(0, firstComma).trim();
        body = content.slice(firstComma + 1);
      } else {
        citekey = content.trim();
        body = "";
      }

      const citation = BibTeXParser._parseEntryBody(entryTypeRaw, citekey, body);
      if (citation) {
        citations.push(citation);
      }
    }

    return citations;
  }

  private static _parseEntryBody(
    entryTypeRaw: string,
    citekey: string,
    body: string
  ): Citation | null {
    const fields = BibTeXParser._extractFields(body);
    const mappedType = BibTeXParser.TYPE_REVERSE_MAP[entryTypeRaw] || "journal_article";
    const citation = new Citation({ entryType: mappedType });

    // Title
    if (fields.title) {
      citation.title = BibTeXParser._cleanTexValue(fields.title);
    }

    // Authors
    if (fields.author) {
      const rawAuthors = fields.author.split(/\s+and\s+/i);
      for (let aName of rawAuthors) {
        aName = BibTeXParser._cleanTexValue(aName).trim();
        if (aName) {
          citation.authors.push(Author.fromString(aName));
        }
      }
    }

    // Editors
    if (fields.editor) {
      const rawEds = fields.editor.split(/\s+and\s+/i);
      for (let eName of rawEds) {
        eName = BibTeXParser._cleanTexValue(eName).trim();
        if (eName) {
          citation.editors.push(Author.fromString(eName));
        }
      }
    }

    // Year
    if (fields.year) {
      citation.year = BibTeXParser._cleanTexValue(fields.year);
    }

    // Date / Month
    if (fields.date) {
      citation.date = BibTeXParser._cleanTexValue(fields.date);
    } else if (fields.month && citation.year) {
      citation.date = `${citation.year}, ${BibTeXParser._cleanTexValue(fields.month)}`;
    }

    // Container (journal / booktitle / howpublished)
    if (fields.journal) {
      citation.containerTitle = BibTeXParser._cleanTexValue(fields.journal);
      citation.entryType = "journal_article";
    } else if (fields.booktitle) {
      citation.containerTitle = BibTeXParser._cleanTexValue(fields.booktitle);
      if (mappedType !== "book_chapter" && mappedType !== "conference_paper") {
        citation.entryType = "book_chapter";
      }
    } else if (fields.howpublished) {
      citation.containerTitle = BibTeXParser._cleanTexValue(fields.howpublished);
    }

    // Volume / Issue / Number
    if (fields.volume) {
      citation.volume = BibTeXParser._cleanTexValue(fields.volume);
    }
    if (fields.number) {
      citation.issue = BibTeXParser._cleanTexValue(fields.number);
    } else if (fields.issue) {
      citation.issue = BibTeXParser._cleanTexValue(fields.issue);
    }

    // Pages
    if (fields.pages) {
      const pages = BibTeXParser._cleanTexValue(fields.pages).replace(/--/g, "-");
      citation.pages = pages;
    }

    // Publisher / Institution / School
    if (fields.publisher) {
      citation.publisher = BibTeXParser._cleanTexValue(fields.publisher);
    }
    if (fields.institution) {
      citation.institution = BibTeXParser._cleanTexValue(fields.institution);
    } else if (fields.school) {
      citation.institution = BibTeXParser._cleanTexValue(fields.school);
    }

    // DOI / URL
    if (fields.doi) {
      citation.doi = BibTeXParser._cleanTexValue(fields.doi);
    }
    if (fields.url) {
      citation.url = BibTeXParser._cleanTexValue(fields.url);
    }

    // Notes
    if (fields.note) {
      citation.annotation.summary = BibTeXParser._cleanTexValue(fields.note);
    }
    if (fields.annote || fields.annotation) {
      const ann = fields.annote || fields.annotation;
      if (ann) {
        citation.annotation.summary = BibTeXParser._cleanTexValue(ann);
      }
    }

    return citation;
  }

  private static _extractFields(body: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const pattern = /([a-zA-Z0-9_\-]+)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|([a-zA-Z0-9_\-]+))/gs;

    let m: RegExpExecArray | null;
    while ((m = pattern.exec(body)) !== null) {
      const key = m[1].toLowerCase().trim();
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      if (val !== undefined) {
        fields[key] = val.trim();
      }
    }
    return fields;
  }

  private static _cleanTexValue(val: string): string {
    return val.replace(/[\{\}]/g, "").replace(/\s+/g, " ").trim();
  }
}
