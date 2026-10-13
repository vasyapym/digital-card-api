// indexer/parse.ts — pure markdown note parser (M2, round 2b).
// parseNote(raw, path) never throws on frontmatter: invalid or non-mapping YAML
// degrades to empty frontmatter with yamlError=true and the note is kept.
// Date values become ISO strings. tags = frontmatter tags (string, comma list or
// array; leading "#" stripped) followed by inline #tags found outside fenced and
// inline code, in scan order, exact-string dedup. title = frontmatter title,
// else first H1, else basename. Imports gray-matter and the shared 2a modules only.
import matter from "gray-matter";
import { extractWikilinks } from "../shared/wikilinks";
import type { ParsedLink } from "../shared/wikilinks";

export interface ParsedNote {
  path: string;
  name: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  aliases: string[];
  links: ParsedLink[];
  yamlError: boolean;
}

// "#" + a letter, then letters / digits / "_" / "-" / "/" (nested tags); only at
// line start or after whitespace, so "# Heading" and mid-word "#" never match.
const INLINE_TAG = /(?<=^|\s)#(\p{L}[\p{L}\p{N}_\/-]*)/gmu;
const FIRST_H1 = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m;
const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?(?:\r?\n---[ \t]*(?:\r?\n|$)|$)/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t\r]*$/;

export function parseNote(raw: string, path: string): ParsedNote {
  const { frontmatter, body, yamlError } = readFrontmatter(raw);
  const codeless = stripCode(body);
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const h1 = FIRST_H1.exec(codeless);
  const fmTitle = scalar(frontmatter.title);
  const title = fmTitle !== "" ? fmTitle : h1 ? h1[1].trim() : name;
  const tags = dedupe([
    ...toList([frontmatter.tags, frontmatter.tag], /[,\s]+/).map((t) => t.replace(/^#+/, "")),
    ...Array.from(codeless.matchAll(INLINE_TAG), (m) => m[1]),
  ]).filter((t) => t !== "");
  return {
    path,
    name,
    title,
    body,
    frontmatter,
    tags,
    aliases: toList([frontmatter.aliases, frontmatter.alias], /,/),
    links: extractWikilinks(codeless),
    yamlError,
  };
}

function readFrontmatter(raw: string): Pick<ParsedNote, "frontmatter" | "body" | "yamlError"> {
  try {
    const file = matter(raw, {});
    const data = toPlain(file.data);
    if (!isRecord(data)) return { frontmatter: {}, body: file.content, yamlError: true };
    return { frontmatter: data, body: file.content, yamlError: false };
  } catch {
    return { frontmatter: {}, body: raw.replace(FRONTMATTER_BLOCK, ""), yamlError: true };
  }
}

/** Dates → ISO strings, recursively; everything else passes through. */
function toPlain(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = toPlain(inner);
    return out;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/** Accepts a scalar, a delimited string or an array of them; trims and drops empties. */
function toList(values: unknown[], splitter: RegExp): string[] {
  return values
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .flatMap((v) =>
      typeof v === "string" ? v.split(splitter) : typeof v === "number" ? [String(v)] : [],
    )
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

/** Removes fenced code blocks (an unclosed fence runs to the end) and inline code spans. */
function stripCode(text: string): string {
  const kept: string[] = [];
  let fence = "";
  for (const line of text.split("\n")) {
    if (fence === "") {
      const open = FENCE_OPEN.exec(line);
      if (open) fence = open[1];
      else kept.push(line);
    } else {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = "";
    }
  }
  return kept.join("\n").replace(/`[^`\n]*`/g, "");
}
