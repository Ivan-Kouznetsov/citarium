/**
 * APA 7th Edition Citation Formatter.
 * Implements the American Psychological Association (APA) 7th Edition style guide rules.
 */
import { BaseFormatter } from "./base";
import { Citation } from "../models/citation";
import { Author } from "../models/author";

export class APA7Formatter extends BaseFormatter {
  /**
   * Convert title to APA sentence case (capitalizing first word of title and subtitle,
   * lowercasing others except proper nouns/acronyms).
   */
  static toSentenceCase(text: string): string {
    text = text.trim();
    if (!text) return "";

    // Delimiters for subtitle
    const chunks = text.split(/([:\?\!]\s+)/);
    const resultChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (/^[:\?\!]\s+$/.test(chunk)) {
        resultChunks.push(chunk);
        continue;
      }

      const words = chunk.split(/\s+/).filter(Boolean);
      const cWords: string[] = [];
      for (let j = 0; j < words.length; j++) {
        const w = words[j];
        // If word is uppercase acronym (e.g. 'AI', 'USA', 'COVID-19') or has internal uppercase (e.g. iPhone, arXiv)
        const isUpper = w === w.toUpperCase() && w !== w.toLowerCase() && w.length > 1;
        const hasInternalUpper = [...w.slice(1)].some(
          (c) => c === c.toUpperCase() && c !== c.toLowerCase()
        );

        if (isUpper || hasInternalUpper) {
          cWords.push(w);
        } else if (j === 0) {
          cWords.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        } else {
          cWords.push(w.toLowerCase());
        }
      }
      resultChunks.push(cWords.join(" "));
    }

    return resultChunks.join("");
  }

  /**
   * Convert periodical/journal title to APA Title Case.
   */
  static toTitleCase(text: string): string {
    text = text.trim();
    if (!text) return "";

    const minorWords = new Set([
      "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to",
      "from", "by", "with", "in", "of", "as", "into", "onto", "via",
    ]);

    const words = text.split(/\s+/);
    const titleWords: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const lowerW = w.toLowerCase();
      // If word is an acronym like 'IEEE', preserve
      if (w === w.toUpperCase() && w.length > 1) {
        titleWords.push(w);
      } else if (i === 0 || (i > 0 && words[i - 1].endsWith(":"))) {
        titleWords.push(lowerW.charAt(0).toUpperCase() + lowerW.slice(1));
      } else if (minorWords.has(lowerW)) {
        titleWords.push(lowerW);
      } else {
        titleWords.push(lowerW.charAt(0).toUpperCase() + lowerW.slice(1));
      }
    }
    return titleWords.join(" ");
  }

  /**
   * Format author list according to APA 7:
   * - 1 author: Last, F. M.
   * - 2 authors: Last, F. M., & Last, F. M.
   * - 3 to 20 authors: Last, F. M., Last, F. M., & Last, F. M.
   * - 21+ authors: First 19 authors, ..., Last author.
   */
  formatAuthors(authors: Author[]): string {
    if (!authors.length) return "";

    const formatted = authors.map((a) => a.apaFormat()).filter(Boolean);
    if (!formatted.length) return "";

    const count = formatted.length;
    if (count === 1) {
      return formatted[0];
    } else if (count === 2) {
      return `${formatted[0]}, & ${formatted[1]}`;
    } else if (count >= 3 && count <= 20) {
      return formatted.slice(0, -1).join(", ") + `, & ${formatted[count - 1]}`;
    } else {
      // 21 or more: first 19, then ellipsis, then the last
      const first19 = formatted.slice(0, 19);
      const lastAuthor = formatted[formatted.length - 1];
      return first19.join(", ") + `, ... ${lastAuthor}`;
    }
  }

  /**
   * Format editors when they are the primary source credit (e.g. an edited book).
   */
  formatEditorsForBook(editors: Author[]): string {
    if (!editors.length) return "";
    const authorStr = this.formatAuthors(editors);
    const edSuffix = editors.length === 1 ? "(Ed.)." : "(Eds.).";
    return `${authorStr} ${edSuffix}`;
  }

  /**
   * Format editors in a book chapter: 'In E. E. Editor & F. F. Editor (Eds.),'
   * Notice initials precede last name.
   */
  formatEditorsForChapter(editors: Author[]): string {
    if (!editors.length) return "";
    const formatted: string[] = [];
    for (const e of editors) {
      if (e.isOrganization) {
        formatted.push(e.organizationName || e.lastName);
      } else {
        const initials: string[] = [];
        if (e.firstName) initials.push(`${e.firstName[0]}.`);
        if (e.middleName) {
          for (const mp of e.middleName.split(/\s+/)) {
            if (mp) initials.push(`${mp[0]}.`);
          }
        }
        const initsStr = initials.join(" ");
        if (initsStr) {
          formatted.push(`${initsStr} ${e.lastName}`);
        } else {
          formatted.push(e.lastName);
        }
      }
    }

    let edStr: string;
    let edSuffix: string;
    if (formatted.length === 1) {
      edStr = formatted[0];
      edSuffix = "(Ed.)";
    } else if (formatted.length === 2) {
      edStr = `${formatted[0]} & ${formatted[1]}`;
      edSuffix = "(Eds.)";
    } else {
      edStr = formatted.slice(0, -1).join(", ") + `, & ${formatted[formatted.length - 1]}`;
      edSuffix = "(Eds.)";
    }

    return `In ${edStr} ${edSuffix},`;
  }

  /** Format date: (Year) or (Year, Month Day) or (n.d.). */
  formatDate(citation: Citation): string {
    if (citation.date && citation.date.trim()) {
      return `(${citation.date.trim()}).`;
    } else if (citation.year && citation.year.trim()) {
      return `(${citation.year.trim()}).`;
    } else {
      return "(n.d.).";
    }
  }

  /**
   * Generate full APA 7 reference.
   * @param fmt - 'text' or 'markdown'
   */
  formatReference(citation: Citation, fmt: string = "text"): string {
    const isMd = fmt === "markdown";

    // Determine primary author / creator string
    let authorStr = this.formatAuthors(citation.authors);
    let noAuthor = false;

    if (!authorStr) {
      if (
        citation.editors.length &&
        (citation.entryType === "edited_book" || citation.entryType === "book")
      ) {
        authorStr = this.formatEditorsForBook(citation.editors);
      } else if (citation.institution) {
        authorStr = citation.institution;
      } else {
        noAuthor = true;
      }
    }

    if (authorStr && !authorStr.endsWith(".")) {
      authorStr += ".";
    }

    const dateStr = this.formatDate(citation);
    const titleStr = citation.title.trim();
    const doiUrl = citation.getDoiUrl() || citation.url.trim();

    const entryType = citation.entryType;

    if (entryType === "journal_article") {
      let artTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled article";
      if (!artTitle.endsWith(".")) artTitle += ".";

      const journal = APA7Formatter.toTitleCase(citation.containerTitle.trim());
      const journalFmt = isMd && journal ? `*${journal}*` : journal;

      let volIssue = "";
      if (citation.volume.trim()) {
        const vol = isMd
          ? `*${citation.volume.trim()}*`
          : citation.volume.trim();
        if (citation.issue.trim()) {
          volIssue = `${vol}(${citation.issue.trim()})`;
        } else {
          volIssue = vol;
        }
      } else if (citation.issue.trim()) {
        volIssue = `(${citation.issue.trim()})`;
      }

      const pagesStr = citation.pages.trim();

      const periodicalParts: string[] = [];
      if (journalFmt) periodicalParts.push(journalFmt);
      if (volIssue) periodicalParts.push(volIssue);
      if (pagesStr) periodicalParts.push(pagesStr);

      let periodicalCombined = periodicalParts.join(", ");
      if (periodicalCombined && !periodicalCombined.endsWith(".")) {
        periodicalCombined += ".";
      }

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, artTitle);
      } else {
        parts.push(artTitle, dateStr);
      }

      if (periodicalCombined) parts.push(periodicalCombined);
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    } else if (entryType === "book" || entryType === "edited_book") {
      let bkTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled book";
      if (citation.edition.trim()) {
        bkTitle = `${bkTitle} (${citation.edition.trim()})`;
      }
      let bkTitleFmt = isMd ? `*${bkTitle}*` : bkTitle;
      if (!bkTitleFmt.endsWith(".")) bkTitleFmt += ".";

      let publisher = citation.publisher.trim();
      if (publisher && !publisher.endsWith(".")) publisher += ".";

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, bkTitleFmt);
      } else {
        parts.push(bkTitleFmt, dateStr);
      }

      if (publisher) parts.push(publisher);
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    } else if (
      entryType === "book_chapter" ||
      entryType === "conference_paper"
    ) {
      let chapTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled chapter";
      if (!chapTitle.endsWith(".")) chapTitle += ".";

      const editorsPart = this.formatEditorsForChapter(citation.editors);
      const bookTitle = APA7Formatter.toSentenceCase(
        citation.containerTitle.trim()
      );
      const bookTitleFmt = isMd && bookTitle ? `*${bookTitle}*` : bookTitle;

      let ppStr = "";
      if (citation.pages.trim()) {
        const pText = citation.pages.trim();
        ppStr = pText.startsWith("pp.")
          ? `(${pText})`
          : `(pp. ${pText})`;
      }

      const containerElements: string[] = [];
      if (editorsPart) {
        containerElements.push(editorsPart);
      } else if (bookTitleFmt) {
        containerElements.push("In");
      }

      if (bookTitleFmt) {
        if (ppStr) {
          containerElements.push(`${bookTitleFmt} ${ppStr}`);
        } else {
          containerElements.push(bookTitleFmt);
        }
      }

      let containerClause = containerElements.join(" ");
      if (containerClause && !containerClause.endsWith(".")) {
        containerClause += ".";
      }

      let publisher = citation.publisher.trim();
      if (publisher && !publisher.endsWith(".")) publisher += ".";

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, chapTitle);
      } else {
        parts.push(chapTitle, dateStr);
      }

      if (containerClause) parts.push(containerClause);
      if (publisher) parts.push(publisher);
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    } else if (entryType === "website") {
      let webTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled webpage";
      let webTitleFmt = isMd ? `*${webTitle}*` : webTitle;
      if (!webTitleFmt.endsWith(".")) webTitleFmt += ".";

      let siteName = citation.containerTitle.trim();
      // If site name is identical to author or institution, APA avoids repetition
      if (
        siteName &&
        (siteName.toLowerCase() === authorStr.toLowerCase() ||
          siteName.toLowerCase() === citation.institution.toLowerCase())
      ) {
        siteName = "";
      }
      if (siteName && !siteName.endsWith(".")) siteName += ".";

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, webTitleFmt);
      } else {
        parts.push(webTitleFmt, dateStr);
      }

      if (siteName) parts.push(siteName);
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    } else if (entryType === "report" || entryType === "dissertation") {
      let repTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled report";
      const extraInfo: string[] = [];
      if (citation.reportNumber.trim()) {
        extraInfo.push(`Report No. ${citation.reportNumber.trim()}`);
      } else if (entryType === "dissertation") {
        extraInfo.push("Doctoral dissertation");
      }

      if (extraInfo.length) {
        repTitle = `${repTitle} (${extraInfo.join(", ")})`;
      }

      let repTitleFmt = isMd ? `*${repTitle}*` : repTitle;
      if (!repTitleFmt.endsWith(".")) repTitleFmt += ".";

      let inst = citation.institution.trim() || citation.publisher.trim();
      if (inst && !inst.endsWith(".")) inst += ".";

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, repTitleFmt);
      } else {
        parts.push(repTitleFmt, dateStr);
      }

      if (inst) parts.push(inst);
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    } else if (entryType === "newspaper_article") {
      let artTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled article";
      if (!artTitle.endsWith(".")) artTitle += ".";

      const newsTitle = APA7Formatter.toTitleCase(
        citation.containerTitle.trim()
      );
      const newsFmt = isMd && newsTitle ? `*${newsTitle}*` : newsTitle;

      const periodicalParts: string[] = [];
      if (newsFmt) periodicalParts.push(newsFmt);
      if (citation.pages.trim()) periodicalParts.push(citation.pages.trim());

      let periodicalCombined = periodicalParts.join(", ");
      if (periodicalCombined && !periodicalCombined.endsWith(".")) {
        periodicalCombined += ".";
      }

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, artTitle);
      } else {
        parts.push(artTitle, dateStr);
      }

      if (periodicalCombined) parts.push(periodicalCombined);
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    } else {
      // Generic fallback
      let genTitle = titleStr
        ? APA7Formatter.toSentenceCase(titleStr)
        : "Untitled";
      let genTitleFmt = isMd ? `*${genTitle}*` : genTitle;
      if (!genTitleFmt.endsWith(".")) genTitleFmt += ".";

      const parts: string[] = [];
      if (!noAuthor) {
        parts.push(authorStr, dateStr, genTitleFmt);
      } else {
        parts.push(genTitleFmt, dateStr);
      }

      if (citation.containerTitle.trim()) {
        parts.push(citation.containerTitle.trim() + ".");
      }
      if (citation.publisher.trim()) {
        parts.push(citation.publisher.trim() + ".");
      }
      if (doiUrl) parts.push(doiUrl);

      return parts.filter(Boolean).join(" ");
    }
  }

  /**
   * Format in-text citation:
   * - 1 author: (Smith, 2020) or Smith (2020)
   * - 2 authors: (Smith & Jones, 2020) or Smith and Jones (2020)
   * - 3+ authors: (Smith et al., 2020) or Smith et al. (2020)
   * - No author: ("Title", 2020) or "Title" (2020)
   */
  formatInText(
    citation: Citation,
    narrative: boolean = false,
    page: string = ""
  ): string {
    const yearStr =
      citation.year.trim() ||
      (citation.date ? citation.date.slice(0, 4) : "n.d.");

    // Determine author in-text representation
    let authorRepr = "";
    const authors = citation.authors;
    if (authors.length) {
      if (authors.length === 1) {
        authorRepr = authors[0].inTextName();
      } else if (authors.length === 2) {
        const amp = narrative ? "and" : "&";
        authorRepr = `${authors[0].inTextName()} ${amp} ${authors[1].inTextName()}`;
      } else {
        authorRepr = `${authors[0].inTextName()} et al.`;
      }
    } else if (citation.editors.length) {
      const eds = citation.editors;
      if (eds.length === 1) {
        authorRepr = eds[0].inTextName();
      } else if (eds.length === 2) {
        const amp = narrative ? "and" : "&";
        authorRepr = `${eds[0].inTextName()} ${amp} ${eds[1].inTextName()}`;
      } else {
        authorRepr = `${eds[0].inTextName()} et al.`;
      }
    } else if (citation.institution) {
      authorRepr = citation.institution;
    } else {
      // Shortened title
      const t = citation.title.trim();
      if (t) {
        const words = t.split(/\s+/).slice(0, 4);
        let shortTitle = words.join(" ");
        if (t.split(/\s+/).length > 4) shortTitle += "...";
        authorRepr = `"${shortTitle}"`;
      } else {
        authorRepr = "Anonymous";
      }
    }

    let pageSuffix = "";
    if (page.trim()) {
      const pClean = page.trim();
      if (!pClean.startsWith("p.") && !pClean.startsWith("pp.")) {
        pageSuffix = `, p. ${pClean}`;
      } else {
        pageSuffix = `, ${pClean}`;
      }
    }

    if (narrative) {
      return `${authorRepr} (${yearStr}${pageSuffix})`;
    } else {
      return `(${authorRepr}, ${yearStr}${pageSuffix})`;
    }
  }

  /**
   * Format full annotated bibliography entry:
   * APA 7 reference + formatted annotation block.
   */
  formatAnnotatedEntry(citation: Citation, fmt: string = "text"): string {
    const ref = this.formatReference(citation, fmt);
    const annot = citation.annotation;

    if (annot.isEmpty()) return ref;

    const sections: string[] = [];
    if (annot.summary.trim()) sections.push(annot.summary.trim());
    if (annot.evaluation.trim()) {
      if (fmt === "markdown") {
        sections.push(`**Evaluation:** ${annot.evaluation.trim()}`);
      } else {
        sections.push(`Evaluation: ${annot.evaluation.trim()}`);
      }
    }
    if (annot.relevance.trim()) {
      if (fmt === "markdown") {
        sections.push(`**Relevance:** ${annot.relevance.trim()}`);
      } else {
        sections.push(`Relevance: ${annot.relevance.trim()}`);
      }
    }
    if (annot.generalNotes.trim()) {
      if (fmt === "markdown") {
        sections.push(`**Notes:** ${annot.generalNotes.trim()}`);
      } else {
        sections.push(`Notes: ${annot.generalNotes.trim()}`);
      }
    }
    if (annot.quotes.length) {
      const quoteLines: string[] = [];
      for (const q of annot.quotes) {
        if (q.quoteText.trim()) {
          const pageInfo = q.pageNumber.trim()
            ? ` (p. ${q.pageNumber})`
            : "";
          quoteLines.push(`"${q.quoteText.trim()}"${pageInfo}`);
        }
      }
      if (quoteLines.length) {
        if (fmt === "markdown") {
          sections.push(
            "**Key Quotes:**\n" +
              quoteLines.map((l) => `> ${l}`).join("\n")
          );
        } else {
          sections.push(
            "Key Quotes:\n" +
              quoteLines.map((l) => `  * ${l}`).join("\n")
          );
        }
      }
    }

    const annotationText = sections.join("\n\n");

    if (fmt === "markdown") {
      const indentedAnnot = sections.map((p) => `> ${p}`).join("\n\n");
      return `${ref}\n\n${indentedAnnot}`;
    } else {
      const indentedLines: string[] = [];
      for (const line of annotationText.split("\n")) {
        if (line.trim()) {
          indentedLines.push(`    ${line}`);
        } else {
          indentedLines.push("");
        }
      }
      return `${ref}\n\n${indentedLines.join("\n")}`;
    }
  }
}
