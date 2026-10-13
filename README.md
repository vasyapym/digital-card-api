# Card & Second Brain

> A **$0/month** self-hosted stack: my Obsidian vault, searchable from any device — by keywords and by meaning — and the read-only digital-card API it grew out of.

Live: https://vasyapym.onrender.com — GraphQL sandbox: https://vasyapym.onrender.com/graphql — Health: https://vasyapym.onrender.com/health

Status: the **indexer is live** (milestones M0–M2, tagged `v1.0.1`). The passphrase-gated web reader (`/brain/*`) is the next milestone (M3); until then every `BRAIN_*` flag defaults to off and the public service is just the card.

## How the second brain works

```
 PRIVATE vault repo                              PUBLIC repo (this one, tagged vX)
   Obsidian Git pushes *.md         checkout       src/second-brain/indexer (CLI)
 .github/workflows/second-brain.yml ─────────────▶ src/second-brain/embedding (pinned model)
   runs the indexer ON THE RUNNER                  the card + /brain web (Nest)
            │  upserts (least-privilege DB role)              │
            ▼                                                 ▼
   Neon free Postgres  ◀────────── SELECT only ──────── Render free web service
   vault copy in brain_* tables                        (always awake, $0)
```

1. Obsidian pushes notes; the private repo's workflow checks out this repo at a pinned tag.
2. The indexer diffs against the last indexed commit (`brain_meta.last_indexed_sha`): changed notes are parsed (frontmatter, tags, aliases), chunked by headings (~400 tokens), wiki-links extracted.
3. Chunk texts are embedded **on the CI runner** by a sha256-pinned `Xenova/multilingual-e5-small` (int8 ONNX, 384-dim) — content never leaves GitHub+Neon; no AI provider is ever called.
4. Everything is upserted into Neon (`brain_notes`, `brain_chunks`, `brain_links`, `brain_meta`); full rebuilds never truncate first, so search works on every fresh copy: a cancelled run self-heals on the next one.
5. `/brain/*` will serve keyword + semantic (pgvector + full-text, reciprocal-rank fusion) search behind a passphrase — nothing to edit, the vault stays the only place where writing happens.

## Privacy model

- **The vault never flows through the public repo.** No vault names or paths in code, fixtures or README; fixtures are synthetic; URLs use opaque ids.
- **Logs count only.** Indexer and web error paths print `name`/`code` — never messages, paths or text; a leak-guard in the vault workflow greps the pinned code against the vault's private denylist every run.
- **Least privilege everywhere.** The only stored secret (`BRAIN_DB_URL`) is a dedicated DB role that can touch `brain_*` tables and nothing else; Render holds no GitHub credential; the app issues SELECT-only against vault data.
- **No AI provider.** Embeddings come from a checksum-verified model file baked into the image; keyword-only search is a fully supported mode.

## The $0 math

| Resource | Free cap | Planned use |
| --- | --- | --- |
| Render web service | 750 h/mo, sleeps | ~730 h — already awake for the card, the brain adds 0 h |
| GitHub Actions (private vault repo) | 2,000 min/mo | ~100–150 min: pushes × ~3 min + one full index |
| Neon Postgres | scale-to-zero | ~80 MB data, well below the free storage cap |
| Embedding model | none | ~120 MB baked into the image at build (weights only) |

## The card

This stack started as a read-only GraphQL API for my digital business card: profile, skills, experience and projects — still serving at the links above, unchanged by the brain (`BRAIN_ENABLED=false` leaves the app byte-identical to its pre-brain behavior).

## Stack

TypeScript · NestJS 11 · GraphQL (Apollo) · Prisma 6 · PostgreSQL (Neon) + pgvector · Jest · Docker

---

## Operations

### How it runs

- Render (free plan, Docker runtime, health check `/health`). A UptimeRobot HEAD to `/graphql` every 5 min keeps it warm; `/health` is process-only and never touches Postgres, `/health/db` and `HEAD /` are also database-free.
- Neon holds the data. `DATABASE_URL` uses the pooled connection, `DIRECT_URL` the direct one (zod-validated, fail-fast).
- Startup chain: `check-env → prisma migrate deploy → seed → server`; any failed step prevents boot.

### Environment flags

All default **off**; with none set the deployed app behaves as before.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BRAIN_ENABLED` | `false` | Master switch; `true` requires the two secrets below. |
| `BRAIN_PASSPHRASE_HASH` | – | argon2id hash (`$argon2id$…`) of the access passphrase. |
| `BRAIN_SESSION_SECRET` | – | ≥32 chars, signs the session cookie. |
| `BRAIN_SEMANTIC` | `false` | Vector search on top of keyword search; `false` = keyword-only, a supported mode. |

Deploying with the brain disabled is the normal path: `prisma migrate deploy` creates the empty `brain_*` tables, the model sits unused in the image, and no route exists to escape the flag.

### Migration discipline

- `prisma migrate deploy` applies committed SQL verbatim — production is always safe.
- Brain migrations are created with `prisma migrate dev --create-only` and reviewed by hand: Prisma cannot represent the generated `tsv` column, the HNSW index or the tsv GIN index, and an unreviewed autogenerated migration would drop them.
- `migrations.lint.spec.ts` fails the build if any later migration touches those objects.
- The `brain_*` tables are read/written only via `$queryRaw` / `$executeRaw`.

### Model pinning

The model is a code constant (`src/second-brain/embedding/embedding.constants.ts`), never an environment variable: vectors are only comparable within one model+quantisation. `fetch-model.ts` runs in the Docker build stage, downloads the pinned files, verifies the sha256 of the ONNX graph and fails the build on mismatch.

### One-time Neon setup

The migration starts with `CREATE EXTENSION IF NOT EXISTS vector;`. If the migration role is not the database owner, run it once as the project owner on the **direct** connection before the first deploy. The indexer writes through a separate `brain_indexer` role granted only on `brain_*` tables, so a leaked CI secret cannot read or modify the card's tables.

## Local run

```bash
docker compose up --build
# card: http://localhost:3000   sandbox: /graphql   health: /health
```

```graphql
query {
  profile {
    name
    title
    skills { name category }
    experience { company position isCurrent durationInMonths }
    projects { name url repositoryUrl technologies }
  }
}
```

MIT.
