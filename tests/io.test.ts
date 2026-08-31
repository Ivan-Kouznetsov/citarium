import { describe, expect, it, afterAll } from "bun:test";
import { saveProject, loadProject, exportToMarkdown, exportToPlainText, exportToBibtex } from "../src/io";
import { Project, Citation, Author, Annotation, Quote } from "../src/models";
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

  it("creates a new file, opens and edits it, saves it, and verifies changes upon reopening", async () => {
    const lifecycleFile = join(tmpdir(), `lifecycle_project_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.json`);

    try {
      // 1. CREATE a new project and save to file
      const initialProject = new Project({
        title: "Initial AI Cognition Research",
        author: "Original Researcher",
        description: "Initial investigation notes",
        tags: ["ai", "cognition"],
        targetWordCount: 1500,
      });

      const initialCitation = new Citation({
        title: "Original Study on Neural Networks",
        year: "2021",
        entryType: "journal_article",
        authors: [new Author({ firstName: "Alice", lastName: "Walker" })],
        annotation: new Annotation({
          summary: "Original summary of findings.",
          status: "To Read",
          rating: 3,
          tags: ["neural_nets"],
        }),
      });
      initialProject.addCitation(initialCitation);

      await saveProject(initialProject, lifecycleFile);
      expect(existsSync(lifecycleFile)).toBe(true);

      // 2. OPEN the file and verify initial content
      const openedProject = await loadProject(lifecycleFile);
      expect(openedProject.title).toBe("Initial AI Cognition Research");
      expect(openedProject.author).toBe("Original Researcher");
      expect(openedProject.citations.length).toBe(1);
      expect(openedProject.citations[0].title).toBe("Original Study on Neural Networks");

      // 3. EDIT the opened project
      openedProject.title = "Revised AI Cognition and Reasoning Research";
      openedProject.author = "Senior Lead Researcher";
      openedProject.description = "Updated comprehensive meta-analysis";
      openedProject.targetWordCount = 5000;
      openedProject.tags = ["ai", "cognition", "reasoning", "meta-analysis"];

      // Edit existing citation
      const citToEdit = openedProject.citations[0];
      citToEdit.title = "Advanced Empirical Study on Deep Neural Networks";
      citToEdit.year = "2024";
      citToEdit.doi = "10.1000/182";
      citToEdit.url = "https://doi.org/10.1000/182";
      citToEdit.annotation.summary = "Updated seminal study on neuro-symbolic reasoning.";
      citToEdit.annotation.status = "Key Source";
      citToEdit.annotation.rating = 5;
      citToEdit.annotation.tags = ["deep-learning", "reasoning"];
      citToEdit.annotation.quotes.push(
        new Quote({
          quoteText: "Reasoning emerges through recursive latent rollouts.",
          pageNumber: "42",
          locationType: "Page",
          notes: "Key quote from discussion",
        })
      );

      // Add a second citation
      const secondCitation = new Citation({
        title: "Large Language Models as Reasoning Engines",
        year: "2025",
        entryType: "conference_paper",
        containerTitle: "NeurIPS 2025",
        authors: [new Author({ firstName: "Bob", lastName: "Smith" })],
        annotation: new Annotation({
          summary: "Breakthrough overview of LLM reasoning architectures.",
          status: "Annotated",
          rating: 4,
          tags: ["llm", "reasoning"],
        }),
      });
      openedProject.addCitation(secondCitation);

      // 4. SAVE the edited project
      await saveProject(openedProject, lifecycleFile);
      expect(existsSync(lifecycleFile)).toBe(true);

      // 5. REOPEN and verify all saved changes are reflected accurately
      const reloadedProject = await loadProject(lifecycleFile);
      expect(reloadedProject.title).toBe("Revised AI Cognition and Reasoning Research");
      expect(reloadedProject.author).toBe("Senior Lead Researcher");
      expect(reloadedProject.description).toBe("Updated comprehensive meta-analysis");
      expect(reloadedProject.targetWordCount).toBe(5000);
      expect(reloadedProject.tags).toEqual(["ai", "cognition", "reasoning", "meta-analysis"]);
      expect(reloadedProject.citations.length).toBe(2);

      // Verify edited citation
      const reloadedCit1 = reloadedProject.citations.find((c) => c.id === citToEdit.id);
      expect(reloadedCit1).toBeDefined();
      expect(reloadedCit1!.title).toBe("Advanced Empirical Study on Deep Neural Networks");
      expect(reloadedCit1!.year).toBe("2024");
      expect(reloadedCit1!.doi).toBe("10.1000/182");
      expect(reloadedCit1!.url).toBe("https://doi.org/10.1000/182");
      expect(reloadedCit1!.annotation.summary).toBe("Updated seminal study on neuro-symbolic reasoning.");
      expect(reloadedCit1!.annotation.status).toBe("Key Source");
      expect(reloadedCit1!.annotation.rating).toBe(5);
      expect(reloadedCit1!.annotation.tags).toEqual(["deep-learning", "reasoning"]);
      expect(reloadedCit1!.annotation.quotes.length).toBe(1);
      expect(reloadedCit1!.annotation.quotes[0].quoteText).toBe("Reasoning emerges through recursive latent rollouts.");
      expect(reloadedCit1!.annotation.quotes[0].pageNumber).toBe("42");

      // Verify second citation
      const reloadedCit2 = reloadedProject.citations.find((c) => c.title === "Large Language Models as Reasoning Engines");
      expect(reloadedCit2).toBeDefined();
      expect(reloadedCit2!.year).toBe("2025");
      expect(reloadedCit2!.entryType).toBe("conference_paper");
      expect(reloadedCit2!.containerTitle).toBe("NeurIPS 2025");
      expect(reloadedCit2!.authors.length).toBe(1);
      expect(reloadedCit2!.authors[0].lastName).toBe("Smith");
      expect(reloadedCit2!.annotation.status).toBe("Annotated");
      expect(reloadedCit2!.annotation.rating).toBe(4);
    } finally {
      if (existsSync(lifecycleFile)) {
        unlinkSync(lifecycleFile);
      }
    }
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
