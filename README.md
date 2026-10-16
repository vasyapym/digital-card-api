# quiet-index

For a vault big enough that keyword search stops finding things: semantic and full-text search over a private Obsidian vault, in Postgres, from a phone, behind a passphrase.

Where things go when it runs, and where they stop:

| | Goes to | Stops at |
|---|---|---|
| Note text | your private vault repo, the Actions runner, your Neon Postgres | your Postgres. No AI provider, no log line. |
| Embeddings | computed on the runner by a local, sha256-pinned model | your Postgres |
| Logs | GitHub Actions | counts and error codes |
| Database access | the vault repo's secrets, as `BRAIN_DB_URL` | a `brain_indexer` role, `brain_*` tables only |
| Your GitHub credential | GitHub | GitHub. Render never holds one. |

Everything below is how that table stays true.

## How a run works

Obsidian Git pushes the vault to a private repo. A workflow in that repo checks out quiet-index at a pinned tag and runs the indexer on GitHub Actions. Changed `.md` notes are parsed (frontmatter, tags, aliases, wiki-links), chunked by heading at about 400 tokens, embedded on the runner, and upserted into Postgres: a pgvector HNSW index for the vectors, a `tsv` column for full text.

The reader on Render serves `/brain` behind an argon2id passphrase hash and a session secret: hybrid search (full text and vectors, merged by reciprocal rank fusion with k = 60), highlighted results, note views. It reads Postgres and holds no GitHub credential.

## Pinning

Two things are pinned, and a third depends on them.

- The code. The vault's workflow checks out this repo at a release tag and nothing changes until you bump the ref. On every run the checked-out code is grepped against your private denylist.
- The model. `Xenova/multilingual-e5-small`, int8 ONNX, pinned by sha256. The Docker build fails on a checksum mismatch; it does not warn.
- The vectors, indirectly. They are comparable only within one model and one quantisation, so the model pin is what keeps the index coherent.

## The model: multilingual-e5-small

`intfloat/multilingual-e5-small` is a 118M-parameter, 12-layer encoder with 384-dimensional output, 512-token input, mean pooling, MIT license. It was initialised from `microsoft/Multilingual-MiniLM-L12-H384` and covers 100 languages through the xlm-roberta vocabulary; low-resource languages degrade.

It was trained with the E5 recipe: weakly-supervised contrastive pre-training on about 1B multilingual text pairs, then supervised fine-tuning (arXiv 2402.05672).

It expects an instruction prefix, and this is the part newcomers miss: indexed text goes in as `passage: ...`, searches as `query: ...`. Skipping either measurably hurts retrieval. Chunks are stored with `passage: ` already applied; embed your queries with `query: `.

It was chosen because the Xenova int8 ONNX port runs on a free CI runner with no GPU and no Python, and 384 dimensions at int8 keep a few thousand notes comfortably inside Neon's free tier.

## Run your own

1. Create a free Neon Postgres. Set `DATABASE_URL` (pooled) and `DIRECT_URL`, then run `npx prisma migrate deploy`. If the migration role does not own the database, run `CREATE EXTENSION IF NOT EXISTS vector;` once as the owner.
2. Create a `brain_indexer` role granted on the `brain_*` tables only. Its connection string is the only secret that leaves your hands.
3. Copy `docs/vault-index.workflow.yml` from this repo to `<vault>/.github/workflows/second-brain-index.yml` and add `BRAIN_DB_URL` as a repository secret. Optional: `.second-brain/config.json` with `excludeFolders`, and your own `denylist.txt`.
4. Push. The workflow pins a release tag of this repo; bump the ref to the tag you trust.
5. For the reader, deploy this repo (Render's free tier is enough) and set `BRAIN_ENABLED`, `BRAIN_PASSPHRASE_HASH` (argon2id), `BRAIN_SESSION_SECRET` (32+ characters) and `BRAIN_SEMANTIC`. All four are off by default.

The whole thing runs on GitHub Actions, Neon and Render free tiers: $0/month.

## The card

The repo's first job was a read-only GraphQL "digital card". With `BRAIN_ENABLED=false`, the default, that is still all it does.

## License

MIT.
