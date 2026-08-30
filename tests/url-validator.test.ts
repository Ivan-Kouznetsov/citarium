import { describe, expect, it } from "bun:test";
import {
  extractDoi,
  normalizeForMatching,
  wordsSequence,
  contentContainsTitle,
  doiMetadataMatchesTitles,
  AsyncURLChecker,
} from "../src/utils/url-validator";

describe("URL Validator Utilities", () => {
  it("extracts DOI from strings and URLs", () => {
    expect(extractDoi("10.1017/CBO9781139046855")).toBe("10.1017/CBO9781139046855");
    expect(extractDoi("https://doi.org/10.1038/s41591-019-0734-6")).toBe("10.1038/s41591-019-0734-6");
    expect(extractDoi("doi:10.48550/arXiv.1606.06565.")).toBe("10.48550/arXiv.1606.06565");
    expect(extractDoi("https://google.com")).toBe(null);
  });

  it("normalizes and tokenizes text accurately", () => {
    expect(normalizeForMatching("Concrete&nbsp;Problems in &quot;AI Safety&quot;")).toBe(
      'Concrete Problems in "AI Safety"'
    );
    expect(wordsSequence("Concrete Problems: In AI Safety!")).toBe(
      "concrete problems in ai safety"
    );
  });

  it("checks content contains title with tolerance to punctuation and formatting", () => {
    const html = `
      <html>
        <head><title>Concrete Problems in AI Safety - arXiv</title></head>
        <body><h1>Concrete Problems in AI Safety</h1></body>
      </html>
    `;
    expect(contentContainsTitle(html, "Concrete Problems in AI Safety")).toBe(true);
    expect(contentContainsTitle(html, "Unrelated Article Title")).toBe(false);
  });

  it("matches DOI metadata against titles", () => {
    const meta = {
      title: "Human Compatible: Artificial Intelligence and the Problem of Control",
      author: [{ given: "Stuart", family: "Russell" }],
    };
    expect(
      doiMetadataMatchesTitles(meta, [
        "Human Compatible: Artificial Intelligence and the Problem of Control",
      ])
    ).toBe(true);
  });

  it("handles AsyncURLChecker tokens and cancellations", async () => {
    const checker = new AsyncURLChecker();
    let callbackReceivedToken: number | null = null;
    let callbackResult: boolean | null = null;

    const token = checker.checkAsync(
      "",
      "Title",
      undefined,
      (res, tok) => {
        callbackResult = res;
        callbackReceivedToken = tok;
      }
    );

    expect(callbackResult).toBe(null);
    expect(callbackReceivedToken as number | null).toBe(token);
  });
});
