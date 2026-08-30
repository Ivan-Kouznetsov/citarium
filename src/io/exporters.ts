/**
 * Exporters for writing projects to Markdown, Plain Text, and BibTeX.
 */
import { Project } from "../models/project";
import { getFormatter } from "../formatters";
import { BibTeXFormatter } from "../formatters/bibtex";

export function exportToMarkdown(project: Project, style: string = "apa7"): string {
  const formatter = getFormatter(style);
  const lines: string[] = [];

  // Title & Metadata Header
  lines.push(`# ${project.title}`);
  if (project.author) {
    lines.push(`**Author:** ${project.author}`);
  }
  if (project.description) {
    lines.push(`\n*${project.description}*\n`);
  }

  lines.push(`**Citation Style:** ${style.toUpperCase()} 7th Edition  `);
  lines.push(`**Total Citations:** ${project.citations.length}  `);
  if (project.tags.length > 0) {
    const tagsStr = project.tags.map((t) => `\`${t}\``).join(", ");
    lines.push(`**Project Tags:** ${tagsStr}  `);
  }
  lines.push("\n---\n");

  // Sort citations alphabetically by primary author
  const sortedCitations = [...project.citations].sort((a, b) => {
    const aAuthor = a.getSortAuthor().toLowerCase();
    const bAuthor = b.getSortAuthor().toLowerCase();
    if (aAuthor !== bAuthor) return aAuthor.localeCompare(bAuthor);

    const aYear = a.getSortYear();
    const bYear = b.getSortYear();
    if (aYear !== bYear) return aYear.localeCompare(bYear);

    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });

  lines.push("## Annotated Bibliography\n");

  if (sortedCitations.length === 0) {
    lines.push("*No citations in this project yet.*");
    return lines.join("\n");
  }

  for (let idx = 0; idx < sortedCitations.length; idx++) {
    const cit = sortedCitations[idx];
    lines.push(`### ${idx + 1}. ${cit.getAuthorSummary()} (${cit.year || "n.d."})`);

    // Badges for status, type, rating
    const badges: string[] = [`\`${cit.typeDisplay}\``];
    if (cit.annotation.status) {
      badges.push(`\`Status: ${cit.annotation.status}\``);
    }
    if (cit.annotation.rating > 0) {
      badges.push(`\`Rating: ${"★".repeat(cit.annotation.rating)}${"☆".repeat(5 - cit.annotation.rating)}\``);
    }
    lines.push(badges.join(" ") + "\n");

    // Formatted APA Reference
    const refText = formatter.formatReference(cit, "markdown");
    lines.push(`**Reference:**\n${refText}\n`);

    // In-text citation forms
    const inTextParen = formatter.formatInText(cit, false);
    const inTextNarr = formatter.formatInText(cit, true);
    lines.push(`*In-Text Citation:* \`${inTextParen}\` or \`${inTextNarr}\`\n`);

    // Annotation Sections
    const annot = cit.annotation;
    if (!annot.isEmpty()) {
      lines.push("#### Annotation");
      if (annot.summary.trim()) {
        lines.push(`**Summary:**\n${annot.summary.trim()}\n`);
      }
      if (annot.evaluation.trim()) {
        lines.push(`**Critical Evaluation:**\n${annot.evaluation.trim()}\n`);
      }
      if (annot.relevance.trim()) {
        lines.push(`**Relevance to Project:**\n${annot.relevance.trim()}\n`);
      }
      if (annot.generalNotes.trim()) {
        lines.push(`**General Notes:**\n${annot.generalNotes.trim()}\n`);
      }

      if (annot.quotes.length > 0) {
        lines.push("**Key Quotes:**");
        for (const q of annot.quotes) {
          if (q.quoteText.trim()) {
            const pageSuffix = q.pageNumber.trim() ? ` (p. ${q.pageNumber})` : "";
            lines.push(`> "${q.quoteText.trim()}"${pageSuffix}`);
            if (q.notes.trim()) {
              lines.push(`> *Note: ${q.notes.trim()}*`);
            }
          }
        }
        lines.push("");
      }

      if (annot.tags.length > 0) {
        const tagChips = annot.tags.map((t) => `\`#${t}\``).join(" ");
        lines.push(`**Tags:** ${tagChips}\n`);
      }
    }

    lines.push("\n---\n");
  }

  return lines.join("\n");
}

export function exportToPlainText(project: Project, style: string = "apa7"): string {
  const formatter = getFormatter(style);
  const lines: string[] = [];

  lines.push(`ANNOTATED BIBLIOGRAPHY: ${project.title.toUpperCase()}`);
  if (project.author) {
    lines.push(`Author: ${project.author}`);
  }
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }
  lines.push(`Style: APA 7th Edition | Citations: ${project.citations.length}`);
  lines.push("=".repeat(70) + "\n");

  const sortedCitations = [...project.citations].sort((a, b) => {
    const aAuthor = a.getSortAuthor().toLowerCase();
    const bAuthor = b.getSortAuthor().toLowerCase();
    if (aAuthor !== bAuthor) return aAuthor.localeCompare(bAuthor);

    const aYear = a.getSortYear();
    const bYear = b.getSortYear();
    if (aYear !== bYear) return aYear.localeCompare(bYear);

    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });

  if (sortedCitations.length === 0) {
    lines.push("No citations in this project.");
    return lines.join("\n");
  }

  for (const cit of sortedCitations) {
    const entryStr = formatter.formatAnnotatedEntry(cit, "text");
    lines.push(entryStr);
    lines.push("\n" + "-".repeat(40) + "\n");
  }

  return lines.join("\n");
}

export function exportToBibtex(project: Project): string {
  const entries: string[] = [];
  const header = `% BibTeX export for Citarium project: ${project.title}\n% Exported entries: ${project.citations.length}\n`;
  entries.push(header);

  for (const cit of project.citations) {
    entries.push(BibTeXFormatter.formatCitation(cit));
  }

  return entries.join("\n\n");
}
