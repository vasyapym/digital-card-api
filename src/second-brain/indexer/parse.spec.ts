import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseNote } from "./parse";

const VAULT = join(__dirname, "..", "__fixtures__", "vault");
const load = (rel: string) => parseNote(readFileSync(join(VAULT, rel), "utf8"), rel);

describe("parseNote", () => {
  it("reads frontmatter, converts dates to ISO and keeps the body without it", () => {
    const note = load("Garden/Tomatoes.md");
    expect(note.path).toBe("Garden/Tomatoes.md");
    expect(note.name).toBe("Tomatoes");
    expect(note.title).toBe("Tomatoes");
    expect(note.yamlError).toBe(false);
    expect(note.frontmatter.title).toBe("Tomatoes");
    expect(note.frontmatter.planted).toBe("2024-03-01T00:00:00.000Z");
    expect(note.frontmatter.brain).toBe(true);
    expect(note.body.startsWith("# Tomatoes")).toBe(true);
    expect(note.body).toContain("```dataview"); // the stored body keeps everything
    expect(note.aliases).toEqual(["Tomato", "Solanum lycopersicum"]);
  });

  it("lists frontmatter tags first, then inline tags outside code, in scan order", () => {
    expect(load("Garden/Tomatoes.md").tags).toEqual([
      "garden",
      "vegetables",
      "nightshade",
      "seedlings",
      "garden/care",
    ]);
  });

  it("splits comma-list tags and recognises Cyrillic inline tags", () => {
    const note = load("Сад/Томаты.md");
    expect(note.title).toBe("Томаты");
    expect(note.tags).toEqual(["сад", "овощи", "рассада", "уход"]);
    expect(note.aliases).toEqual(["Помидоры"]);
    expect(note.frontmatter.updated).toBe("2024-05-10T12:00:00.000Z");
  });

  it("extracts wikilinks over the codeless body", () => {
    const note = load("Garden/Tomatoes.md");
    const targets = note.links.map((l) => l.target);
    expect(targets).toEqual(expect.arrayContaining(["Plants", "Сад/Томаты", "Земляника"]));
    expect(note.links.find((l) => l.target === "Земляника")).toMatchObject({
      heading: "Уход",
      alias: "strawberries",
    });
    expect(note.links.some((l) => l.embed)).toBe(true);
  });

  it("falls back to the first H1, then to the basename", () => {
    expect(load("Garden/Plants.md").title).toBe("Plants");
    const berry = load("Сад/Земляника.md");
    expect(berry.title).toBe("Земляника");
    expect(berry.frontmatter).toEqual({});
    expect(berry.yamlError).toBe(false);
  });

  it("degrades invalid YAML to empty frontmatter without skipping the note", () => {
    const raw = '---\ntitle: "unterminated\ntags: [a, b\n---\n# Broken\n\nStill indexed. #kept\n';
    const note = parseNote(raw, "Notes/Broken.md");
    expect(note.yamlError).toBe(true);
    expect(note.frontmatter).toEqual({});
    expect(note.title).toBe("Broken");
    expect(note.tags).toEqual(["kept"]);
    expect(note.body).toBe("# Broken\n\nStill indexed. #kept\n");
    expect(parseNote(raw, "Notes/Broken.md")).toEqual(note); // deterministic, no hidden cache
  });

  it("flags non-mapping frontmatter and keeps the note", () => {
    const note = parseNote("---\njust a scalar\n---\nBody\n", "Scalar.md");
    expect(note.yamlError).toBe(true);
    expect(note.frontmatter).toEqual({});
    expect(note.title).toBe("Scalar");
    expect(note.body).toBe("Body\n");
  });

  it("applies the inline tag grammar", () => {
    const raw = [
      "x#nope #Ok_tag-1 #1nope",
      "## heading",
      "#Start, see https://e.org/#frag and `#code`",
      "```",
      "#fenced",
      "```",
      "\t#Tabbed #Ok_tag-1",
    ].join("\n");
    expect(parseNote(raw, "t.md").tags).toEqual(["Ok_tag-1", "Start", "Tabbed"]);
  });

  it("normalises frontmatter tag strings and dedups against inline tags", () => {
    const raw = '---\ntags: "#alpha, beta"\naliases:\n  - One\n  - Two\n---\nText #beta #alpha #gamma\n';
    const note = parseNote(raw, "n.md");
    expect(note.tags).toEqual(["alpha", "beta", "gamma"]);
    expect(note.aliases).toEqual(["One", "Two"]);
  });
});
