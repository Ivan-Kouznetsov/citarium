/**
 * Citarium Formatters
 */
import { BaseFormatter } from "./base";
import { APA7Formatter } from "./apa7";

export { BaseFormatter } from "./base";
export { APA7Formatter } from "./apa7";
export { BibTeXFormatter } from "./bibtex";

export const FORMATTERS: Record<string, new () => BaseFormatter> = {
  apa7: APA7Formatter,
};

export function getFormatter(style: string = "apa7"): BaseFormatter {
  const FormatterClass = FORMATTERS[style.toLowerCase()] || APA7Formatter;
  return new FormatterClass();
}
