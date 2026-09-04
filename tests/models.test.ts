import { describe, expect, it } from "bun:test";
import { Author, Annotation, Quote, Citation, Project } from "../src/models";

describe("Author Model", () => {
  it("parses single name", () => {
    const a = Author.fromString("Plato");
    expect(a.lastName).toBe("Plato");
    expect(a.displayName()).toBe("Plato");
    expect(a.apaFormat()).toBe("Plato");
  });

  it("parses first last", () => {
    const a = Author.fromString("Stuart Russell");
    expect(a.firstName).toBe("Stuart");
    expect(a.lastName).toBe("Russell");
    expect(a.displayName()).toBe("Stuart Russell");
    expect(a.apaFormat()).toBe("Russell, S.");
  });

  it("parses last, first middle", () => {
    const a = Author.fromString("Russell, Stuart J.");
    expect(a.firstName).toBe("Stuart");
    expect(a.middleName).toBe("J.");
    expect(a.lastName).toBe("Russell");
    expect(a.apaFormat()).toBe("Russell, S. J.");
  });

  it("parses hyphenated first names", () => {
    const a = Author.fromString("Jean-Paul Sartre");
    expect(a.apaFormat()).toBe("Sartre, J.-P.");
  });

  it("parses organization in brackets or braces", () => {
    const a = Author.fromString("[World Health Organization]");
    expect(a.isOrganization).toBe(true);
    expect(a.organizationName).toBe("World Health Organization");
    expect(a.apaFormat()).toBe("World Health Organization");
    expect(a.inTextName()).toBe("World Health Organization");

    const a2 = Author.fromString("{European Commission}");
    expect(a2.isOrganization).toBe(true);
    expect(a2.organizationName).toBe("European Commission");
  });

  it("parses multiple authors with semicolon, and, comma", () => {
    const list1 = Author.parseMultiple("Kristyn Vitale; Alexandra Behnke; Monique Udell");
    expect(list1.length).toBe(3);
    expect(list1[0].lastName).toBe("Vitale");
    expect(list1[1].lastName).toBe("Behnke");
    expect(list1[2].lastName).toBe("Udell");

    const list2 = Author.parseMultiple("Dennis Turner and Patrick Bateson");
    expect(list2.length).toBe(2);
    expect(list2[0].lastName).toBe("Turner");
    expect(list2[1].lastName).toBe("Bateson");
  });

  it("formats author list for entry field", () => {
    const authors = [
      new Author({ firstName: "John", lastName: "Bradshaw" }),
      new Author({ isOrganization: true, organizationName: "Feline Advisory Bureau" }),
    ];
    expect(Author.formatAuthorList(authors)).toBe("John Bradshaw; [Feline Advisory Bureau]");
  });

  it("serializes to and from dict", () => {
    const a = new Author({
      firstName: "Kristyn",
      lastName: "Vitale",
      suffix: "Jr.",
    });
    const d = a.toDict();
    expect(d.first_name).toBe("Kristyn");
    expect(d.last_name).toBe("Vitale");
    expect(d.suffix).toBe("Jr.");

    const restored = Author.fromDict(d);
    expect(restored.firstName).toBe("Kristyn");
    expect(restored.lastName).toBe("Vitale");
    expect(restored.suffix).toBe("Jr.");
  });
});

describe("Annotation and Quote Models", () => {
  it("serializes quote", () => {
    const q = new Quote({
      quoteText: "Cats display social flexibility in attachment.",
      pageNumber: "R864",
      locationType: "Paragraph",
      notes: "Key result",
    });
    const d = q.toDict();
    expect(d.quote_text).toBe("Cats display social flexibility in attachment.");
    expect(d.page_number).toBe("R864");

    const restored = Quote.fromDict(d);
    expect(restored.quoteText).toBe("Cats display social flexibility in attachment.");
  });

  it("serializes annotation", () => {
    const ann = new Annotation({
      summary: "Study on cat attachment styles.",
      evaluation: "Methodologically sound study.",
      relevance: "Crucial for chapter 1.",
      status: "Key Source",
      rating: 5,
      tags: ["attachment", "feline"],
    });

    const d = ann.toDict();
    expect(d.summary).toBe("Study on cat attachment styles.");
    expect(d.status).toBe("Key Source");
    expect(d.rating).toBe(5);

    const restored = Annotation.fromDict(d);
    expect(restored.summary).toBe("Study on cat attachment styles.");
    expect(restored.status).toBe("Key Source");
    expect(restored.tags).toEqual(["attachment", "feline"]);
  });

  it("calculates annotation word count accurately", () => {
    const emptyAnn = new Annotation();
    expect(emptyAnn.getWordCount()).toBe(0);

    const ann = new Annotation({
      summary: "This is a five word summary.",
      evaluation: "Strong methodology.",
    });
    // summary: 6 words, evaluation: "Evaluation: Strong methodology." -> 3 words = 9 words
    expect(ann.getWordCount()).toBe(9);
  });
});

describe("Citation Model", () => {
  it("computes author summaries and sort keys", () => {
    const cit1 = new Citation({
      title: "Attachment Bonds Between Domestic Cats and Humans",
      year: "2019",
      authors: [
        new Author({ firstName: "Kristyn", lastName: "Vitale" }),
        new Author({ firstName: "Alexandra", lastName: "Behnke" }),
        new Author({ firstName: "Monique", lastName: "Udell" }),
      ],
    });
    expect(cit1.getAuthorSummary()).toBe("Kristyn Vitale et al.");
    expect(cit1.getSortAuthor()).toBe("Vitale");
    expect(cit1.getSortYear()).toBe("2019");

    const cit2 = new Citation({
      title: "The Domestic Cat",
      year: "2014",
      authors: [
        new Author({ firstName: "Dennis", lastName: "Turner" }),
        new Author({ firstName: "Patrick", lastName: "Bateson" }),
      ],
    });
    expect(cit2.getAuthorSummary()).toBe("Dennis Turner & Patrick Bateson");

    const cit3 = new Citation({
      title: "Handbook of Feline Behaviour",
      editors: [new Author({ firstName: "Sarah", lastName: "Ellis" })],
    });
    expect(cit3.getAuthorSummary()).toBe("Sarah Ellis (Eds.)");
  });

  it("handles DOIs and search matching", () => {
    const cit = new Citation({
      title: "The Cry Embedded Within the Purr",
      doi: "https://doi.org/10.1016/j.cub.2009.05.033",
      annotation: new Annotation({ summary: "Acoustic analysis of feline solicitation purr" }),
    });
    expect(cit.getCleanDoi()).toBe("10.1016/j.cub.2009.05.033");
    expect(cit.getDoiUrl()).toBe("https://doi.org/10.1016/j.cub.2009.05.033");

    expect(cit.matchesSearch("purr")).toBe(true);
    expect(cit.matchesSearch("acoustic")).toBe(true);
    expect(cit.matchesSearch("nonexistent")).toBe(false);
  });
});

describe("Project Model", () => {
  it("handles CRUD and analytics", () => {
    const proj = new Project({ title: "My Research" });
    const cit = new Citation({
      title: "Test Citation",
      authors: [new Author({ firstName: "Alice", lastName: "Smith" })],
      annotation: new Annotation({
        summary: "Word count test words here",
        status: "Reading",
        rating: 4,
        tags: ["ethics"],
      }),
    });

    proj.addCitation(cit);
    expect(proj.citations.length).toBe(1);
    expect(proj.getCitation(cit.id)).toBe(cit);

    expect(proj.getAllTags()).toEqual(["ethics"]);
    expect(proj.getStatusCounts()["Reading"]).toBe(1);
    expect(cit.getWordCount()).toBe(5);
    expect(proj.getTotalAnnotationWordCount()).toBe(5);

    proj.removeCitation(cit.id);
    expect(proj.citations.length).toBe(0);
  });
});
