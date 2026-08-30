/**
 * Base interface for citation formatters.
 */
import { Citation } from "../models/citation";

export abstract class BaseFormatter {
  /**
   * Format reference entry.
   * @param citation - Citation instance
   * @param fmt - 'text', 'markdown', or 'rich'
   * @returns formatted reference string
   */
  abstract formatReference(citation: Citation, fmt?: string): string;

  /**
   * Format in-text citation.
   * @param citation - Citation instance
   * @param narrative - If true: 'Smith (2023)', if false: '(Smith, 2023)'
   * @param page - Optional page number, e.g. 'p. 42' or '42'
   * @returns in-text citation string
   */
  abstract formatInText(
    citation: Citation,
    narrative?: boolean,
    page?: string
  ): string;

  /**
   * Format full annotated bibliography entry (reference + formatted annotation).
   */
  abstract formatAnnotatedEntry(citation: Citation, fmt?: string): string;
}
