// indexer/git.ts — git plumbing for the vault indexer (M2, round 2b).
// The parse* functions are pure string parsers for `-z` (NUL-separated) git
// output; -z keeps non-ASCII paths unquoted, and every path is returned exactly
// as git printed it, vault-relative. The run*/git* wrappers at the bottom are
// thin execFile glue (piped stdio, no shell, no env access) and are not unit-tested.
import { execFile } from "node:child_process";

export type ChangeStatus = "A" | "M" | "T" | "D";

export interface Change {
  status: ChangeStatus;
  path: string;
}

const STATUSES: ReadonlySet<string> = new Set(["A", "M", "T", "D"]);
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** `git diff -z --no-renames --name-status <sha> HEAD -- '*.md'`: status NUL path NUL ... */
export function parseNameStatus(raw: string): Change[] {
  const fields = raw.split("\0");
  const out: Change[] = [];
  let i = 0;
  while (i + 1 < fields.length) {
    const status = fields[i];
    const width = /^[RC]/.test(status) ? 3 : 2; // R/C never appear with --no-renames; skipped defensively
    const path = fields[i + width - 1];
    if (STATUSES.has(status) && path !== undefined && path !== "") {
      out.push({ status: status as ChangeStatus, path });
    }
    i += width;
  }
  return out;
}

/** `git ls-files -z -- '*.md'`: path NUL path NUL ... */
export function parseFileList(raw: string): string[] {
  return raw.split("\0").filter((path) => path !== "");
}

/**
 * `git log -z --no-renames --name-only --format=%cI -- '*.md'`.
 * A record is an RFC3339 timestamp followed by the NUL-separated paths of that
 * commit (git may put NUL or newlines between them). The log is newest-first,
 * so the first timestamp seen for a path wins.
 */
export function parseLogForUpdatedAt(raw: string): Map<string, string> {
  const updatedAt = new Map<string, string>();
  let stamp = "";
  for (const field of raw.split("\0")) {
    for (const line of field.split(/\r?\n/)) {
      if (line === "") continue;
      if (RFC3339.test(line)) stamp = line;
      else if (stamp !== "" && !updatedAt.has(line)) updatedAt.set(line, stamp);
    }
  }
  return updatedAt;
}

/** `git rev-parse HEAD` output: a 40-hex sha, or "" for anything else. */
export function parseRevision(input: string): string {
  const sha = input.trim();
  return /^[0-9a-fA-F]{40}$/.test(sha) ? sha.toLowerCase() : "";
}

// ---- untested execFile glue -------------------------------------------------

export function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

export const gitHead = (cwd: string): Promise<string> =>
  runGit(cwd, ["rev-parse", "HEAD"]).then(parseRevision);

export const gitMarkdownFiles = (cwd: string): Promise<string[]> =>
  runGit(cwd, ["ls-files", "-z", "--", "*.md"]).then(parseFileList);

export const gitMarkdownChanges = (cwd: string, sinceSha: string): Promise<Change[]> =>
  runGit(cwd, ["diff", "-z", "--no-renames", "--name-status", sinceSha, "HEAD", "--", "*.md"]).then(
    parseNameStatus,
  );

export const gitMarkdownUpdatedAt = (cwd: string): Promise<Map<string, string>> =>
  runGit(cwd, ["log", "-z", "--no-renames", "--name-only", "--format=%cI", "--", "*.md"]).then(
    parseLogForUpdatedAt,
  );
