// src/second-brain/search/search.sql.ts
// brain_meta lookup; the key list travels as ONE text[] bind parameter ($1).
export const META_SQL = 'SELECT key, value FROM brain_meta WHERE key = ANY($1::text[])';

// ts_headline options pinned by the design. The private-use markers U+E000/U+E001
// wrap matches inside the RAW snippet; the view escapes first, then swaps them.
export const HEADLINE_OPTS =
  'StartSel=\uE000, StopSel=\uE001, MaxWords=30, MinWords=12, MaxFragments=2';

// Hybrid: FTS top-40 and vector top-40 fused by reciprocal rank (k = 60), one best chunk per note.
// Params: $1 query text, $2 vector as text literal '[x,y,...]', $3 headline options.
export const HYBRID_SQL = `WITH q AS (
  SELECT websearch_to_tsquery('russian', $1) || websearch_to_tsquery('english', $1) AS tsq
),
fts AS (
  SELECT id, row_number() OVER (ORDER BY rank DESC, id) AS r FROM (
    SELECT c.id, ts_rank_cd(c.tsv, q.tsq) AS rank
    FROM brain_chunks c, q WHERE c.tsv @@ q.tsq
    ORDER BY rank DESC, c.id LIMIT 40) t
),
vec AS (
  SELECT id, row_number() OVER (ORDER BY dist, id) AS r FROM (
    SELECT id, emb <=> $2::vector AS dist
    FROM brain_chunks ORDER BY emb <=> $2::vector LIMIT 40) t
),
fused AS (
  SELECT id, sum(1.0 / (60 + r)) AS score
  FROM (SELECT id, r FROM fts UNION ALL SELECT id, r FROM vec) u GROUP BY id
),
best AS (
  SELECT DISTINCT ON (c.note_id) c.note_id, c.heading, c.anchor, c.text, f.score
  FROM fused f JOIN brain_chunks c ON c.id = f.id
  ORDER BY c.note_id, f.score DESC
)
SELECT n.id, n.title, n.path, b.heading, b.anchor,
       ts_headline('russian', b.text, q.tsq, $3) AS snippet
FROM best b JOIN brain_notes n ON n.id = b.note_id, q
ORDER BY b.score DESC
LIMIT 20;`;

// Keyword-only: the same pipeline without the vector leg.
// Params: $1 query text, $2 headline options.
export const KEYWORD_SQL = `WITH q AS (
  SELECT websearch_to_tsquery('russian', $1) || websearch_to_tsquery('english', $1) AS tsq
),
fts AS (
  SELECT id, row_number() OVER (ORDER BY rank DESC, id) AS r FROM (
    SELECT c.id, ts_rank_cd(c.tsv, q.tsq) AS rank
    FROM brain_chunks c, q WHERE c.tsv @@ q.tsq
    ORDER BY rank DESC, c.id LIMIT 40) t
),
fused AS (
  SELECT id, sum(1.0 / (60 + r)) AS score
  FROM (SELECT id, r FROM fts) u GROUP BY id
),
best AS (
  SELECT DISTINCT ON (c.note_id) c.note_id, c.heading, c.anchor, c.text, f.score
  FROM fused f JOIN brain_chunks c ON c.id = f.id
  ORDER BY c.note_id, f.score DESC
)
SELECT n.id, n.title, n.path, b.heading, b.anchor,
       ts_headline('russian', b.text, q.tsq, $2) AS snippet
FROM best b JOIN brain_notes n ON n.id = b.note_id, q
ORDER BY b.score DESC
LIMIT 20;`;
