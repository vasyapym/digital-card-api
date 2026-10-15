// src/second-brain/indexer/cli.ts
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SIGNATURE } from '../embedding/embedding.constants';
import { passageInput } from '../embedding/embedder';
import { TransformersEmbedder, loadCountTokens } from '../embedding/transformers-embedder';
import { keysForNote } from '../shared/link-keys';
import { CHUNKER_VERSION, chunkNote } from './chunk';
import { loadVaultConfig, parseEnv } from './config';
import { createDbRunner, DbRunner } from './db';
import { gitHead, gitMarkdownChanges, gitMarkdownFiles, gitMarkdownUpdatedAt, runGit } from './git';
import { formatProgress, formatSummary, redactError } from './log';
import { ParsedNote, parseNote } from './parse';
import { applyActions, chooseMode, FileChange } from './plan';
import * as store from './store';
import { applyExcludes } from './vault-files';

/**
 * Best-effort run-side telemetry: CI publishes step logs only after the step
 * ends, so while the run lives the database is the only readable window.
 * brain_meta.debug_phase records where the process is right now (counts only).
 */
async function setPhase(db: DbRunner, name: string): Promise<void> {
  try {
    await db.once('phase', (c) => store.writeMeta(c, { debug_phase: name }), 15_000);
  } catch {
    console.log('index: phase skipped');
  }
}

function fail(err: unknown): void {
  const red = redactError(err);
  // RangeError/TypeError messages are engine phrases ("Maximum call stack size
  // exceeded") — safe to print. Stack frames resolve to OUR dist files only, never
  // at vault content; print three frames so engine-limit bugs are locatable.
  const extra =
    err instanceof RangeError || err instanceof TypeError
      ? err.message + ' at ' + String((err as Error).stack || '').split('\n').slice(1, 4).join(' | ')
      : '';
  console.error(`index: error name=${red.name} code=${red.code ?? ''}${extra ? ' ' + extra : ''}`);
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
  const db = createDbRunner(env.BRAIN_DB_URL);

  try {
    await setPhase(db, 'boot');
    const meta = await db.run('read-meta', (c) =>
      store.readMeta(c, ['last_indexed_sha', 'embed_signature', 'chunker_version']),
    );
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

    // Stamp the build identity BEFORE any embed work, not only after success:
    // a full rebuild that dies at a ceiling never completed, and without the
    // stamp the next run could not prove the stored rows are ours — resume
    // stayed disabled and every retry re-embedded the whole vault from scratch.
    // Safe to stamp when absent: stored rows all come from builds of this exact
    // signature (embedding.constants has never changed since M0+M1), and when a
    // stamp IS present but differs the run keeps skip off and stamps nothing.
    if (mode === 'full' && !meta.embed_signature) {
      meta.embed_signature = SIGNATURE;
      meta.chunker_version = String(CHUNKER_VERSION);
      await db.run('stamp', (c) =>
        store.writeMeta(c, {
          embed_signature: meta.embed_signature,
          chunker_version: meta.chunker_version,
        }),
      );
    }
    await setPhase(db, `mode=${mode}`);

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

    // Skip-unchanged: incremental always; full too when the stored model signature
    // matches (makes a full rebuild RESUMABLE — a cancelled run re-embeds only
    // what is not yet stored, and the summary counts those skips as unchanged).
    let unchanged = 0;
    let toIndex = prepared;
    const skipSupported = mode === 'incremental' || meta.embed_signature === SIGNATURE;
    if (skipSupported && prepared.length > 0) {
      await setPhase(db, 'hash-skip');
      const known = await db.run('hash-skip', (c) =>
        store.selectNoteHashes(c, prepared.map((n) => n.id)),
      );
      toIndex = prepared.filter((n) => known.get(n.id) !== n.hash);
      unchanged = prepared.length - toIndex.length;
      await setPhase(db, `skip-done unchanged=${unchanged} toIndex=${toIndex.length}`);
    }

    let fullTimes: Map<string, string> | null = null;
    let headTime = '';
    if (mode === 'full') {
      await setPhase(db, 'git-times');
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

    // STREAM per note: chunk -> embed its passages -> store -> next. Every stored
    // note is banked durably, so a timeout or cancel inherits its progress via
    // hash-skip on the next run instead of losing hours of vectorization.
    let chunksStored = 0;
    let linksStored = 0;
    const loopStarted = Date.now();
    const PROGRESS_EVERY = 25;
    await setPhase(db, 'model-load');
    const embedder: TransformersEmbedder | null =
      toIndex.length > 0
        ? new TransformersEmbedder({ intraOpNumThreads: Math.min(4, os.cpus().length) })
        : null;
    const countTokens = toIndex.length > 0 ? await loadCountTokens() : null;
    await setPhase(db, `embed 0/${toIndex.length}`);

    for (let i = 0; i < toIndex.length; i += 1) {
      const n = toIndex[i];
      await setPhase(db, `note ${i + 1}/${toIndex.length} t0`);
      const chunks = chunkNote(n.parsed, countTokens!);
      await setPhase(db, `note ${i + 1}/${toIndex.length} chunks=${chunks.length}`);
      const embeddings = chunks.length
        ? await embedder!.embedPassages(
            chunks.map((chunk) => passageInput(n.parsed.title, chunk.heading, chunk.text)),
          )
        : [];
      await setPhase(db, `note ${i + 1}/${toIndex.length} embedded`);
      const result = await db.run('store-note', async (c) =>
        store.storeNote(c, {
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
        }),
      );
      chunksStored += chunks.length;
      linksStored += result.links;
      if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === toIndex.length) {
        console.log(
          formatProgress({
            done: i + 1,
            total: toIndex.length,
            chunks: chunksStored,
            ms: Date.now() - loopStarted,
          }),
        );
      }
    }

    // Full rebuild never truncates first: upsert everything, then delete the rest.
    const deleteIds = new Set([...deletePaths].map(idForPath));
    if (mode === 'full') {
      const seen = new Set([...prepared.map((n) => n.id), ...skippedIds]);
      for (const id of await db.run('list-note-ids', (c) => store.listNoteIds(c))) {
        if (!seen.has(id)) deleteIds.add(id);
      }
    }
    if (deleteIds.size > 0) await db.run('delete-notes', (c) => store.deleteNotes(c, [...deleteIds]));

    await setPhase(db, 'summary');
    const totals = await db.run('count-all', (c) => store.countAll(c));
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
    await db.run('meta-final', (c) => store.writeMeta(c, metaEntries));
    await setPhase(db, 'done');

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
    await db.close().catch(() => undefined);
  }
}

main().then(() => process.exit(0), fail);
