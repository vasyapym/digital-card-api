// indexer/chunk.ts — pure chunker (M2, round 2b). CHUNKER_VERSION bumps force a rebuild.
// chunkNote splits a note body into heading sections. Noise (fenced code incl.
// dataview, Templater <% ... %>, HTML and %% ... %% comments, embeds ![[...]], bare
// URLs) is removed from chunk text only — the stored body is untouched. Sections
// over CHUNK_TOKEN_CAP tokens (injected counter) split on paragraphs, then
// sentences, then a hard cut; empty sections are dropped. heading carries the
// trail "Parent › Child" (context, not duplicated text); anchor =
// headingSlug(innermost heading as written); the preamble has heading "" / anchor
// ""; ord is 0-based document order.
// Imports the shared 2a modules only (the ParsedNote import is type-only).
import { headingSlug } from "../shared/slug";
import type { ParsedNote } from "./parse";

export const CHUNKER_VERSION = 1;
export const CHUNK_TOKEN_CAP = 400;
export const TRAIL_SEPARATOR = " \u203A ";

export interface Chunk {
  heading: string;
  anchor: string;
  text: string;
  ord: number;
}

export type TokenCounter = (text: string) => number;

interface Section {
  trail: string[];
  anchor: string;
  lines: string[];
}

const ATX_HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

export function chunkNote(parsed: ParsedNote, countTokens: TokenCounter): Chunk[] {
  const sections: Section[] = [{ trail: [], anchor: "", lines: [] }];
  const stack: { level: number; text: string }[] = [];
  for (const line of stripNoise(parsed.body).split("\n")) {
    const m = ATX_HEADING.exec(line);
    const text = m ? m[2].trim() : "";
    if (!m || text === "") {
      sections[sections.length - 1].lines.push(line);
      continue;
    }
    const level = m[1].length;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text });
    sections.push({ trail: stack.map((h) => h.text), anchor: headingSlug(text), lines: [] });
  }

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const text = section.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text === "") continue;
    for (const piece of splitSection(text, countTokens)) {
      chunks.push({
        heading: section.trail.join(TRAIL_SEPARATOR),
        anchor: section.anchor,
        text: piece,
        ord: chunks.length,
      });
    }
  }
  return chunks;
}

function stripNoise(body: string): string {
  return stripFenced(body.replace(/\r\n?/g, "\n"))
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<%[\s\S]*?(?:%>|$)/g, "")
    .replace(/%%[\s\S]*?(?:%%|$)/g, "")
    .replace(/!\[\[[^\]\n]*\]\]/g, "")
    .replace(/\bhttps?:\/\/[^\s<>)\]]+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

/** Drops fenced blocks with their fences; an unclosed fence runs to the end. */
function stripFenced(text: string): string {
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
  return kept.join("\n");
}

function splitSection(text: string, count: TokenCounter): string[] {
  if (count(text) <= CHUNK_TOKEN_CAP) return [text];
  const paragraphs = text.split(/\n[ \t]*\n+/).map((p) => p.trim()).filter((p) => p !== "");
  return pack(paragraphs, "\n\n", count, (paragraph) =>
    pack(paragraph.split(/(?<=[.!?…])\s+/), " ", count, (sentence) => hardSplit(sentence, count)),
  );
}

/** Greedily joins parts under the cap; parts that alone exceed it go through splitBig. */
function pack(
  parts: string[],
  sep: string,
  count: TokenCounter,
  splitBig: (part: string) => string[],
): string[] {
  const out: string[] = [];
  let current = "";
  for (const part of parts) {
    if (count(part) > CHUNK_TOKEN_CAP) {
      if (current !== "") out.push(current);
      current = "";
      out.push(...splitBig(part));
      continue;
    }
    const joined = current === "" ? part : current + sep + part;
    if (current !== "" && count(joined) > CHUNK_TOKEN_CAP) {
      out.push(current);
      current = part;
    } else {
      current = joined;
    }
  }
  if (current !== "") out.push(current);
  return out;
}

/** Cuts the longest prefix within the cap (binary search on length), preferring a whitespace boundary. */
function hardSplit(text: string, count: TokenCounter): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest !== "") {
    if (count(rest) <= CHUNK_TOKEN_CAP) {
      out.push(rest);
      break;
    }
    let lo = 1;
    let hi = rest.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (count(rest.slice(0, mid)) <= CHUNK_TOKEN_CAP) lo = mid;
      else hi = mid - 1;
    }
    const space = rest.lastIndexOf(" ", lo);
    const cut = space > lo / 2 ? space : lo;
    const piece = rest.slice(0, cut).trim();
    if (piece !== "") out.push(piece);
    rest = rest.slice(cut).trim();
  }
  return out;
}
