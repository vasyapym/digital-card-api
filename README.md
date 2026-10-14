# quiet-index

Indexes a private Obsidian vault into Postgres without the notes going anywhere they don't need to. Embeddings are computed in CI by a pinned local model, the logs say almost nothing, and the public code knows nothing about the vault.

**Status:** the indexer is live (M0–M2, `v1.0.1`). The passphrase-gated reader at `/brain` is M3 and not live, so every `BRAIN_*` flag is off. The deployment serves only my [card](#the-card): https://vasyapym.onrender.com · [/graphql](https://vasyapym.onrender.com/graphql) · [/health](https://vasyapym.onrender.com/health)

## What crosses which boundary

| From → to | What crosses | What doesn't |
| --- | --- | --- |
| vault repo → runner | changed `*.md` since `brain_meta.last_indexed_sha` | – |
| runner → AI provider | nothing | notes; embedding runs on the runner |
| runner → Neon | upserts, via a role scoped to `brain_*` | access to the card's tables |
| Neon → web app | SELECT only | writes; the vault stays the only place notes are written |
| anything → logs | counts and error codes | messages, paths, note text |
| vault → this repo | nothing | fixtures are synthetic, URLs use opaque ids |

The vault workflow greps the pinned code against a private denylist on every run. Render holds no GitHub credential.

## How a run works

Obsidian Git pushes to the private vault repo. Its workflow checks out this repo at a pinned tag and runs the indexer. Changed notes are parsed (frontmatter, tags, aliases, wiki-links) and chunked by heading (~400 tokens). They are embedded by a sha256-pinned `Xenova/multilingual-e5-small` (int8 ONNX, 384-dim, e5 `passage:` prefix) and upserted into pgvector (HNSW) and full-text `tsv`. Full rebuilds never truncate, so a cancelled run heals on the next one.

Pinning is deliberate: vectors are only comparable within one model and quantisation, and the Docker build fails on a checksum mismatch. Brain migrations are hand-reviewed (`--create-only`), because Prisma would drop the `tsv` column and the HNSW/GIN indexes it can't represent. `migrations.lint.spec.ts` guards them.

## Run your own

1. Free Neon Postgres. Set `DATABASE_URL` (pooled) and `DIRECT_URL` (direct), then run `npx prisma migrate deploy`. If the migration role doesn't own the database, first run `CREATE EXTENSION IF NOT EXISTS vector;` once as the owner.
2. Create a `brain_indexer` role with grants on `brain_*` only. This is the only secret that leaves your hands.
3. Copy [docs/vault-index.workflow.yml](docs/vault-index.workflow.yml) to `<vault>/.github/workflows/second-brain-index.yml` and set the secret `BRAIN_DB_URL`. Optional: `.second-brain/config.json` (`excludeFolders`) and your own `denylist.txt`.
4. Push. Read `brain_*` with SQL until the M3 reader ships: hybrid full-text + vector search, reciprocal-rank fusion, behind a passphrase.

## The card

This repo started as `digital-card-api`, a read-only GraphQL business card. With `BRAIN_ENABLED=false` (the default), it behaves exactly as before. For your own, put one `isPrimary: true` profile in `src/data/profiles.data.ts`, then run `docker compose up --build` (`localhost:3000`) or deploy to Render free (Docker, flags off). Boot: `check-env → prisma migrate deploy → seed → server`, fail-fast with zod-validated env. `/health` never touches Postgres. UptimeRobot keeps it awake via `/graphql`.

Brain flags, all off by default: `BRAIN_ENABLED`, `BRAIN_PASSPHRASE_HASH` (argon2id), `BRAIN_SESSION_SECRET` (≥32 chars), `BRAIN_SEMANTIC`. Cost is $0/month on Render, GitHub Actions and Neon free tiers.

## License

MIT
