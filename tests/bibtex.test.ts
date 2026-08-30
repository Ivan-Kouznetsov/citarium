import { describe, expect, it } from "bun:test";
import { BibTeXFormatter } from "../src/formatters/bibtex";
import { BibTeXParser } from "../src/io/bibtex-parser";
import { Citation, Author } from "../src/models";

describe("BibTeX Formatter & Parser", () => {
  it("formats and parses BibTeX articles", () => {
    const cit = new Citation({
      entryType: "journal_article",
      title: "The Cry Embedded Within the Purr",
      containerTitle: "Current Biology",
      year: "2009",
      authors: [
        new Author({ firstName: "Karen", lastName: "McComb" }),
        new Author({ firstName: "Anna", middleName: "M.", lastName: "Taylor" }),
      ],
      doi: "10.1016/j.cub.2009.05.033",
    });

    const bibStr = BibTeXFormatter.formatCitation(cit);
    expect(bibStr).toContain("@article{");
    expect(bibStr).toContain("mccomb2009embedded");
    expect(bibStr).toContain("author = {McComb, Karen and Taylor, Anna M.}");
    expect(bibStr).toContain("title = {The Cry Embedded Within the Purr}");

    const parsed = BibTeXParser.parse(bibStr);
    expect(parsed.length).toBe(1);
    expect(parsed[0].title).toBe("The Cry Embedded Within the Purr");
    expect(parsed[0].authors.length).toBe(2);
    expect(parsed[0].authors[0].lastName).toBe("McComb");
    expect(parsed[0].year).toBe("2009");
  });

  it("parses multiple BibTeX entries", () => {
    const raw = `
    @article{vitale2019attachment,
      author = {Vitale, Kristyn and Behnke, Alexandra},
      title = {Attachment Bonds Between Domestic Cats and Humans},
      journal = {Current Biology},
      year = {2019}
    }

    @book{bradshaw2013catsense,
      author = {Bradshaw, John},
      title = {Cat Sense},
      publisher = {Basic Books},
      year = {2013}
    }
    `;

    const parsed = BibTeXParser.parse(raw);
    expect(parsed.length).toBe(2);
    expect(parsed[0].entryType).toBe("journal_article");
    expect(parsed[0].title).toBe("Attachment Bonds Between Domestic Cats and Humans");
    expect(parsed[1].entryType).toBe("book");
    expect(parsed[1].title).toBe("Cat Sense");
  });
});
