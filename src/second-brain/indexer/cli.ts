// src/second-brain/indexer/cli.ts
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { SIGNATURE } from '../embedding/embedding.constants';
import { passageInput } from '../embedding/embedder';
import { TransformersEmbedder, loadCountTokens } from '../embedding/transformers-embedder';
import { keysForNote } from '../shared/link-keys';
import { CHUNKER_VERSION, Chunk, chunkNote } from './chunk';
import { loadVaultConfig, parseEnv } from './config';
import { gitHead, gitMarkdownChanges, gitMarkdownFiles, gitMarkdownUpdatedAt, runGit } from './git';
import { formatSummary, redactError } from './log';
import { ParsedNote, parseNote } from './parse';
import { applyActions, chooseMode, FileChange } from './plan';
import * as store from './store';
import { applyExcludes } from './vault-files';

function fail(err: unknown): void {
  const red = redactError(err);
  console.error(`index: error name=${red.name} code=${red.code ?? ''}`);
  process.exit(1);
}

process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function idForPath(relPath: string): string {
  return sha256Hex(relPath).slice(0, 16);
}

function linkTargetsOf(parsed: ParsedNote): string[] {
  return parsed.links.map((l) => l.target).filter((t) => t.length > 0);
}

interface PreparedNote {
  id: string;
  path: string;
  hash: string;
  parsed: ParsedNote;
}

async function main(): Promise<void> {
  const started = Date.now();
  const env = parseEnv(process.env);
  const vaultDir = env.BRAIN_VAULT_DIR;
  const vaultConfig = loadVaultConfig(vaultDir);
  const prisma = new PrismaClient({
    datasources: { db: { url: env.BRAIN_DB_URL } },
  });

  try {
    const meta = await store.readMeta(prisma, [
      'last_indexed_sha',
      'embed_signature',
      'chunker_version',
    ]);
    const storedSha = meta.last_indexed_sha ?? null;
    const headSha = await gitHead(vaultDir);

    let headShaExists = false;
    if (storedSha) {
      try {
        await runGit(vaultDir, ['cat-file', '-e', storedSha]);
        headShaExists = true;
      } catch {
        headShaExists = false;
      }
    }

    const mode = chooseMode({
      brainFull: env.BRAIN_FULL,
      storedSha,
      headShaExists,
      storedSignature: meta.embed_signature ?? null,
      signature: SIGNATURE,
      storedChunkerVersion: meta.chunker_version != null ? Number(meta.chunker_version) : null,
      chunkerVersion: CHUNKER_VERSION,
    });

    let fullPaths: string[] = [];
    let changes: FileChange[] = [];
    if (mode === 'full') {
      fullPaths = await gitMarkdownFiles(vaultDir);
    } else {
      changes = await gitMarkdownChanges(vaultDir, storedSha as string);
    }

    const candidatePaths =
      mode === 'full'
        ? fullPaths
        : changes.flatMap((c) => (c.oldPath ? [c.oldPath, c.path] : [c.path]));
    const { excluded } = applyExcludes(candidatePaths, vaultConfig.excludeFolders ?? []);
    const plan = applyActions({ mode, fullPaths, changes, excludedPaths: excluded });

    const deletePaths = new Set(plan.deletePaths);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const skippedIds = new Set<string>();
    let skippedUtf8 = 0;
    let yamlErrors = 0;

    const prepared: PreparedNote[] = [];
    for (const rel of plan.upsertPaths) {
      const raw = await fs.readFile(path.join(vaultDir, rel));
      let text: string;
      try {
        text = decoder.decode(raw);
      } catch {
        skippedUtf8 += 1;
        skippedIds.add(idForPath(rel));
        continue;
      }
      const parsed = parseNote(text, rel);
      const fm = parsed.frontmatter as Record<string, unknown> | null | undefined;
      if (fm && fm.brain === false) {
        deletePaths.add(rel);
        continue;
      }
      if (parsed.yamlError) yamlErrors += 1;
      prepared.push({ id: idForPath(rel), path: rel, hash: sha256Hex(raw), parsed });
    }

    let unchanged = 0;
    let toIndex = prepared;
    if (mode === 'incremental' && prepared.length > 0) {
      const known = await store.selectNoteHashes(prisma, prepared.map((n) => n.id));
      toIndex = prepared.filter((n) => known.get(n.id) !== n.hash);
      unchanged = prepared.length - toIndex.length;
    }

    let noteChunks: Chunk[][] = [];
    if (toIndex.length > 0) {
      const countTokens = await loadCountTokens();
      noteChunks = toIndex.map((n) => chunkNote(n.parsed, countTokens));
    }

    const inputs: string[] = [];
    for (let i = 0; i < toIndex.length; i += 1) {
      for (const chunk of noteChunks[i]) {
        inputs.push(passageInput(toIndex[i].parsed.title, chunk.heading, chunk.text));
      }
    }
    let vectors: number[][] = [];
    if (inputs.length > 0) {
      const embedder = new TransformersEmbedder({
        intraOpNumThreads: Math.min(4, os.cpus().length),
      });
      vectors = await embedder.embedPassages(inputs);
    }

    let fullTimes: Map<string, string> | null = null;
    let headTime = '';
    if (mode === 'full') {
      fullTimes = await gitMarkdownUpdatedAt(vaultDir);
    } else if (toIndex.length > 0) {
      headTime = (await runGit(vaultDir, ['log', '-1', '--format=%cI'])).trim();
    }
    const resolveUpdatedAt = async (rel: string): Promise<string> => {
      if (mode === 'incremental') return headTime;
      const known = fullTimes?.get(rel);
      if (known) return known;
      return (await runGit(vaultDir, ['log', '-1', '--format=%cI', '--', rel])).trim();
    };

    let chunksStored = 0;
    let linksStored = 0;
    let cursor = 0;
    for (let i = 0; i < toIndex.length; i += 1) {
      const n = toIndex[i];
      const chunks = noteChunks[i];
      const embeddings = vectors.slice(cursor, cursor + chunks.length);
      cursor += chunks.length;
      const result = await store.storeNote(prisma, {
        id: n.id,
        path: n.path,
        name: n.parsed.name,
        title: n.parsed.title,
        keys: keysForNote(n.path, n.parsed.aliases),
        tags: n.parsed.tags,
        body: n.parsed.body,
        frontmatter: n.parsed.frontmatter ?? {},
        hash: n.hash,
        updatedAt: await resolveUpdatedAt(n.path),
        chunks,
        embeddings,
        linkTargets: linkTargetsOf(n.parsed),
      });
      chunksStored += chunks.length;
      linksStored += result.links;
    }

    // Full rebuild never truncates first: upsert everything, then delete the rest.
    const deleteIds = new Set([...deletePaths].map(idForPath));
    if (mode === 'full') {
      const seen = new Set([...prepared.map((n) => n.id), ...skippedIds]);
      for (const id of await store.listNoteIds(prisma)) {
        if (!seen.has(id)) deleteIds.add(id);
      }
    }
    if (deleteIds.size > 0) await store.deleteNotes(prisma, [...deleteIds]);

    const totals = await store.countAll(prisma);
    const metaEntries: Record<string, string> = {
      last_indexed_sha: headSha,
      last_indexed_at: new Date().toISOString(),
      notes_count: String(totals.notes),
      chunks_count: String(totals.chunks),
      links_count: String(totals.links),
    };
    if (mode === 'full') {
      metaEntries.embed_signature = SIGNATURE;
      metaEntries.chunker_version = String(CHUNKER_VERSION);
    }
    await store.writeMeta(prisma, metaEntries);

    console.log(
      formatSummary({
        mode,
        changed: toIndex.length,
        deleted: deleteIds.size,
        unchanged,
        notes: toIndex.length,
        chunks: chunksStored,
        links: linksStored,
        yamlErrors,
        skippedUtf8,
        ms: Date.now() - started,
      }),
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().then(() => process.exit(0), fail);
