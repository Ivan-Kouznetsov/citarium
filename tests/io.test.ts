import { describe, expect, it, afterAll } from "bun:test";
import { saveProject, loadProject, exportToMarkdown, exportToPlainText, exportToBibtex } from "../src/io";
import { Project, Citation, Author, Annotation } from "../src/models";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Project IO and Exporters", () => {
  const testFile = join(tmpdir(), `test_project_${Date.now()}.json`);

  afterAll(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  it("saves and loads project with full fidelity", async () => {
    const proj = new Project({
      title: "Feline Ethology Bibliography",
      author: "Test Author",
      description: "A research bibliography on cat behavior",
      tags: ["feline", "behavior"],
      targetWordCount: 3000,
    });

    const cit = new Citation({
      title: "Attachment bonds between domestic cats and humans",
      year: "2019",
      authors: [new Author({ firstName: "Kristyn", middleName: "R.", lastName: "Vitale" })],
      annotation: new Annotation({
        summary: "Seminal feline attachment study",
        status: "Key Source",
        rating: 5,
      }),
    });
    proj.addCitation(cit);

    await saveProject(proj, testFile);
    expect(existsSync(testFile)).toBe(true);

    const loaded = await loadProject(testFile);
    expect(loaded.title).toBe("Feline Ethology Bibliography");
    expect(loaded.author).toBe("Test Author");
    expect(loaded.citations.length).toBe(1);
    expect(loaded.citations[0].title).toBe("Attachment bonds between domestic cats and humans");
    expect(loaded.citations[0].annotation.rating).toBe(5);
  });

  it("loads existing example file accurately", async () => {
    const examplePath = join(process.cwd(), "examples/feline_behavior_annotated_bibliography.json");
    const loaded = await loadProject(examplePath);
    expect(loaded.citations.length).toBe(4);
    expect(loaded.title).toBe("Domestic Feline Behaviour, Cognition, and Human-Cat Attachment");
  });

  it("exports project to Markdown, Plain Text, and BibTeX", async () => {
    const examplePath = join(process.cwd(), "examples/feline_behavior_annotated_bibliography.json");
    const proj = await loadProject(examplePath);

    const md = exportToMarkdown(proj);
    expect(md).toContain("# Domestic Feline Behaviour, Cognition, and Human-Cat Attachment");
    expect(md).toContain("## Annotated Bibliography");
    expect(md).toContain("Attachment bonds between domestic cats and humans");

    const txt = exportToPlainText(proj);
    expect(txt).toContain("ANNOTATED BIBLIOGRAPHY: DOMESTIC FELINE BEHAVIOUR, COGNITION, AND HUMAN-CAT ATTACHMENT");

    const bib = exportToBibtex(proj);
    expect(bib).toContain("% BibTeX export for Citarium project:");
    expect(bib).toContain("@article{vitale2019attachment");
  });
});
