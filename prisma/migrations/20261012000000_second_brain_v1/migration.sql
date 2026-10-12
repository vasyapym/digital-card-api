-- second brain v1 — notes / chunks / links / meta.
-- Reviewed by hand; `prisma migrate deploy` applies it verbatim and never diffs.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE brain_notes (
  id          text PRIMARY KEY,                 -- first 16 hex of sha256(vault-relative path)
  path        text NOT NULL UNIQUE,
  name        text NOT NULL,                    -- basename without .md (Obsidian link target)
  title       text NOT NULL,                    -- frontmatter title | first H1 | name
  keys        text[] NOT NULL,                  -- normalized link keys (name, path suffixes, aliases)
  tags        text[] NOT NULL DEFAULT '{}',
  frontmatter jsonb  NOT NULL DEFAULT '{}',
  body        text   NOT NULL,                  -- markdown without frontmatter
  hash        text   NOT NULL,                  -- sha256 of the raw file
  updated_at  timestamptz NOT NULL,             -- last commit time touching the file
  indexed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brain_notes_keys_gin ON brain_notes USING gin (keys);

CREATE TABLE brain_chunks (
  id       bigserial PRIMARY KEY,
  note_id  text NOT NULL REFERENCES brain_notes(id) ON DELETE CASCADE,
  ord      int  NOT NULL,
  heading  text NOT NULL DEFAULT '',            -- heading trail "Parent › Child"
  anchor   text NOT NULL DEFAULT '',            -- slug of the innermost heading
  text     text NOT NULL,
  tsv      tsvector GENERATED ALWAYS AS (
             setweight(to_tsvector('russian', heading), 'A') ||
             setweight(to_tsvector('english', heading), 'A') ||
             to_tsvector('russian', text) || to_tsvector('english', text)
           ) STORED,
  emb      vector(384) NOT NULL,
  UNIQUE (note_id, ord)
);
CREATE INDEX brain_chunks_tsv_gin   ON brain_chunks USING gin  (tsv);
CREATE INDEX brain_chunks_emb_hnsw  ON brain_chunks USING hnsw (emb vector_cosine_ops);

CREATE TABLE brain_links (
  src_id  text NOT NULL REFERENCES brain_notes(id) ON DELETE CASCADE,
  dst_key text NOT NULL,                        -- normalized target; resolved at read time
  PRIMARY KEY (src_id, dst_key)
);
CREATE INDEX brain_links_dst ON brain_links (dst_key);

CREATE TABLE brain_meta (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
