import { readFileSync } from "node:fs";
import { join } from "node:path";
import { headingSlug } from "../shared/slug";
import { CHUNKER_VERSION, CHUNK_TOKEN_CAP, chunkNote } from "./chunk";
import { parseNote } from "./parse";

const VAULT = join(__dirname, "..", "__fixtures__", "vault");
const load = (rel: string) => parseNote(readFileSync(join(VAULT, rel), "utf8"), rel);
// Deterministic fake tokenizer: one token per whitespace-separated word.
const words = (text: string) => text.split(/\s+/).filter((w) => w !== "").length;
const wordList = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const note = (body: string) => parseNote(body, "Big/Note.md");

describe("chunkNote", () => {
  it("pins the chunker version and cap", () => {
    expect(CHUNKER_VERSION).toBe(1);
    expect(CHUNK_TOKEN_CAP).toBe(400);
  });

  it("makes one chunk per non-empty heading section with a parent trail and anchor", () => {
    const chunks = chunkNote(load("Garden/Tomatoes.md"), words);
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i));
    expect(chunks.map((c) => c.heading)).toEqual([
      "Tomatoes",
      "Tomatoes › Varieties › Cherry", // "Varieties" itself has no text → dropped
      "Tomatoes › Varieties › Beefsteak",
      "Tomatoes › Care",
    ]);
    expect(chunks[0].anchor).toBe(headingSlug("Tomatoes"));
    expect(chunks[1].anchor).toBe(headingSlug("Cherry"));
    expect(chunks[1].text).toBe("Small and sweet. Grown alongside [[Земляника#Уход|strawberries]].");
  });

  it("keeps text before the first heading as a preamble chunk", () => {
    const chunks = chunkNote(load("Сад/Земляника.md"), words);
    expect(chunks[0]).toMatchObject({ heading: "", anchor: "", ord: 0 });
    expect(chunks[0].text).toContain("Земляника");
    expect(chunks[1]).toMatchObject({ heading: "Уход", anchor: headingSlug("Уход"), ord: 1 });
  });

  it("strips noise from chunk text but not from the stored body", () => {
    const parsed = load("Garden/Tomatoes.md");
    const care = chunkNote(parsed, words).find((c) => c.heading === "Tomatoes › Care")!;
    for (const noise of ["dataview", "TABLE", "#dataviewtag", "https://", "<%", "<!--", "%%", "![["]) {
      expect(care.text).not.toContain(noise);
      expect(parsed.body).toContain(noise);
    }
    expect(care.text).toContain("Water deeply and mulch.");
    expect(care.text).toContain("#garden/care");
  });

  it("splits oversized sections on paragraphs, keeping every word in order", () => {
    const paragraphs = Array.from({ length: 12 }, (_, p) => wordList(90, `p${p}w`).join(" "));
    const chunks = chunkNote(note(`# Big\n\n${paragraphs.join("\n\n")}\n`), words);
    expect(chunks).toHaveLength(3); // 4 paragraphs × 90 words = 360 ≤ 400
    for (const c of chunks) {
      expect(words(c.text)).toBeLessThanOrEqual(CHUNK_TOKEN_CAP);
      expect(c.heading).toBe("Big");
    }
    expect(chunks.map((c) => c.text).join("\n\n")).toBe(paragraphs.join("\n\n"));
    expect(chunks.map((c) => c.ord)).toEqual([0, 1, 2]);
  });

  it("falls back to sentences, then to a hard cut", () => {
    const sentences = Array.from({ length: 5 }, (_, s) => `${wordList(150, `s${s}w`).join(" ")}.`);
    const bySentence = chunkNote(note(`# Long\n\n${sentences.join(" ")}\n`), words);
    expect(bySentence.map((c) => c.text)).toEqual([
      sentences.slice(0, 2).join(" "),
      sentences.slice(2, 4).join(" "),
      sentences[4],
    ]);
    const wall = wordList(1000, "w").join(" ");
    const hard = chunkNote(note(`# Wall\n\n${wall}\n`), words);
    expect(hard).toHaveLength(3);
    expect(Math.max(...hard.map((c) => words(c.text)))).toBeLessThanOrEqual(CHUNK_TOKEN_CAP);
    expect(hard.map((c) => c.text).join(" ")).toBe(wall);
  });

  it("is deterministic and yields nothing for notes without indexable text", () => {
    const parsed = load("Сад/Томаты.md");
    expect(chunkNote(parsed, words)).toEqual(chunkNote(parsed, words));
    expect(chunkNote(parsed, words).map((c) => c.heading)).toEqual([
      "Томаты",
      "Томаты › Сорта",
      "Томаты › Уход",
    ]);
    const empty = note("---\ntitle: Empty\n---\n\n%% only a comment %%\n```js\nx\n```\n![[img.png]]\n");
    expect(chunkNote(empty, words)).toEqual([]);
  });
});
