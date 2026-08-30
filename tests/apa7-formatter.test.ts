import { describe, expect, it } from "bun:test";
import { APA7Formatter } from "../src/formatters/apa7";
import { Citation, Author, Annotation, Quote } from "../src/models";

describe("APA7 Formatter", () => {
  const formatter = new APA7Formatter();

  it("handles sentence casing and title casing", () => {
    expect(APA7Formatter.toSentenceCase("Concrete Problems in AI Safety: A New Study")).toBe(
      "Concrete problems in AI safety: A new study"
    );
    expect(APA7Formatter.toTitleCase("the journal of machine learning research")).toBe(
      "The Journal of Machine Learning Research"
    );
  });

  it("formats journal articles with 1, 2, and 3+ authors", () => {
    const cit1 = new Citation({
      entryType: "journal_article",
      title: "Deep learning in medical imaging",
      containerTitle: "Nature Medicine",
      year: "2020",
      volume: "26",
      issue: "1",
      pages: "10-18",
      doi: "10.1038/s41591-019-0734-6",
      authors: [new Author({ firstName: "Alice", middleName: "M.", lastName: "Smith" })],
    });

    const ref1 = formatter.formatReference(cit1);
    expect(ref1).toBe(
      "Smith, A. M. (2020). Deep learning in medical imaging. Nature Medicine, 26(1), 10-18. https://doi.org/10.1038/s41591-019-0734-6"
    );

    const inText1 = formatter.formatInText(cit1, false, "12");
    expect(inText1).toBe("(Smith, 2020, p. 12)");
    const inText1Narr = formatter.formatInText(cit1, true);
    expect(inText1Narr).toBe("Smith (2020)");
  });

  it("formats books and chapters", () => {
    const book = new Citation({
      entryType: "book",
      title: "Human Compatible: Artificial Intelligence and the Problem of Control",
      authors: [new Author({ firstName: "Stuart", middleName: "J.", lastName: "Russell" })],
      year: "2019",
      publisher: "Viking",
    });
    const bookRef = formatter.formatReference(book);
    expect(bookRef).toBe(
      "Russell, S. J. (2019). Human compatible: Artificial intelligence and the problem of control. Viking."
    );

    const chapter = new Citation({
      entryType: "book_chapter",
      title: "The Ethics of Artificial Intelligence",
      authors: [
        new Author({ firstName: "Nick", lastName: "Bostrom" }),
        new Author({ firstName: "Eliezer", lastName: "Yudkowsky" }),
      ],
      editors: [
        new Author({ firstName: "William", middleName: "M.", lastName: "Ramsey" }),
        new Author({ firstName: "Keith", lastName: "Frankish" }),
      ],
      containerTitle: "The Cambridge Handbook of Artificial Intelligence",
      year: "2014",
      pages: "316-334",
      publisher: "Cambridge University Press",
    });
    const chapRef = formatter.formatReference(chapter);
    expect(chapRef).toContain("In W. M. Ramsey & K. Frankish (Eds.),");
    expect(chapRef).toContain("(pp. 316-334)");
  });

  it("formats website with organization author", () => {
    const web = new Citation({
      entryType: "website",
      title: "Ethics Guidelines for Trustworthy AI",
      authors: [
        new Author({
          isOrganization: true,
          organizationName: "High-Level Expert Group on Artificial Intelligence",
        }),
      ],
      year: "2019",
      containerTitle: "European Commission",
      url: "https://digital-strategy.ec.europa.eu/en/library/ethics-guidelines-trustworthy-ai",
    });

    const webRef = formatter.formatReference(web);
    expect(webRef).toBe(
      "High-Level Expert Group on Artificial Intelligence. (2019). Ethics guidelines for trustworthy AI. European Commission. https://digital-strategy.ec.europa.eu/en/library/ethics-guidelines-trustworthy-ai"
    );
  });

  it("formats full annotated entries in plain text and markdown", () => {
    const cit = new Citation({
      entryType: "book",
      title: "Test Book",
      authors: [new Author({ firstName: "John", lastName: "Doe" })],
      year: "2021",
      publisher: "MIT Press",
      annotation: new Annotation({
        summary: "This is a great book summary.",
        evaluation: "Rigorous methodology.",
        relevance: "Directly relates to chapter 1.",
        quotes: [new Quote({ quoteText: "A key quote.", pageNumber: "15" })],
      }),
    });

    const textAnnot = formatter.formatAnnotatedEntry(cit, "text");
    expect(textAnnot).toContain("Doe, J. (2021). Test book. MIT Press.");
    expect(textAnnot).toContain("    This is a great book summary.");
    expect(textAnnot).toContain("    Evaluation: Rigorous methodology.");

    const mdAnnot = formatter.formatAnnotatedEntry(cit, "markdown");
    expect(mdAnnot).toContain("> This is a great book summary.");
    expect(mdAnnot).toContain("> **Evaluation:** Rigorous methodology.");
  });
});
