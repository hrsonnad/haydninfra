-- Photo library schema (private section: haydns.ai → Private → Photos)
-- Tables are created RLS-enabled with NO client policies: deny-all at birth.
-- Access policies (owner-scoped) and the owner registry arrive in 004_security_owner.sql.
-- All writes happen via the service role (ingest pipeline + photo-api edge function).

CREATE EXTENSION IF NOT EXISTS vector;

-- ============ conversations ============
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,                     -- slug: 'people/josh-levey', 'groups/acl-freaks'
  kind TEXT NOT NULL CHECK (kind IN ('person','group')),
  name TEXT NOT NULL,
  is_shortcode BOOLEAN NOT NULL DEFAULT false,  -- numeric sender (marketing/OTP) → clutter signal
  photo_count INT NOT NULL DEFAULT 0,
  video_count INT NOT NULL DEFAULT 0,
  first_at TIMESTAMPTZ,
  last_at TIMESTAMPTZ
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON conversations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON conversations FROM authenticated;

-- ============ photos ============
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL UNIQUE,       -- sha256 hex; basis of dedupe + R2 keys
  taken_at TIMESTAMPTZ NOT NULL,           -- earliest sent date across all sources
  mime TEXT NOT NULL,
  is_video BOOLEAN NOT NULL DEFAULT false,
  has_live BOOLEAN NOT NULL DEFAULT false,
  width INT,
  height INT,
  duration_s REAL,
  bytes BIGINT NOT NULL,
  blurhash TEXT,
  -- declutter tiers
  tier TEXT NOT NULL DEFAULT 'library' CHECK (tier IN ('library','screenshot','clutter')),
  tier_auto TEXT NOT NULL DEFAULT 'library' CHECK (tier_auto IN ('library','screenshot','clutter')),
  tier_override BOOLEAN NOT NULL DEFAULT false,
  tier_signals JSONB,
  -- EXIF
  camera_make TEXT,
  camera_model TEXT,
  has_gps BOOLEAN NOT NULL DEFAULT false,
  -- provenance
  ingest_source TEXT NOT NULL DEFAULT 'mac_export' CHECK (ingest_source IN ('mac_export','iphone_backup')),
  -- R2 object keys (content-hash addressed, unguessable by design)
  r2_original TEXT NOT NULL,
  r2_thumb TEXT NOT NULL,
  r2_medium TEXT,
  r2_playback TEXT,
  r2_poster TEXT,
  r2_live TEXT,
  -- searchable text
  ocr_text TEXT,
  caption TEXT,                            -- v2: Moondream captions
  fts tsvector GENERATED ALWAYS AS
    (to_tsvector('english', coalesce(ocr_text,'') || ' ' || coalesce(caption,''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_taken_idx ON photos (taken_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS photos_tier_idx  ON photos (tier, taken_at DESC);
CREATE INDEX IF NOT EXISTS photos_fts_idx   ON photos USING gin (fts);
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON photos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON photos FROM authenticated;

-- ============ photo_sources (one photo may arrive via many conversations) ============
CREATE TABLE IF NOT EXISTS photo_sources (
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  ingest_source TEXT NOT NULL DEFAULT 'mac_export',
  PRIMARY KEY (photo_id, conversation_id, sent_at)
);
CREATE INDEX IF NOT EXISTS photo_sources_conv_idx ON photo_sources (conversation_id, sent_at DESC);
ALTER TABLE photo_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_sources FORCE ROW LEVEL SECURITY;
REVOKE ALL ON photo_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE ON photo_sources FROM authenticated;

-- ============ photo_labels (zero-shot CLIP vocabulary) ============
-- Named photo_labels (not "tags") to avoid colliding with the pre-existing
-- vestigial `tags` table from the removed documents/notes feature.
CREATE TABLE IF NOT EXISTS photo_labels (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT                            -- scene|object|food|animal|document|event|meta
);
ALTER TABLE photo_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_labels FORCE ROW LEVEL SECURITY;
REVOKE ALL ON photo_labels FROM anon;
REVOKE INSERT, UPDATE, DELETE ON photo_labels FROM authenticated;

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES photo_labels(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  PRIMARY KEY (photo_id, tag_id)
);
CREATE INDEX IF NOT EXISTS photo_tags_tag_idx ON photo_tags (tag_id, score DESC);
ALTER TABLE photo_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_tags FORCE ROW LEVEL SECURITY;
REVOKE ALL ON photo_tags FROM anon;
REVOKE INSERT, UPDATE, DELETE ON photo_tags FROM authenticated;

-- ============ people (named face clusters) + faces ============
CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY,
  cluster_id INT UNIQUE NOT NULL,          -- HDBSCAN label; noise (-1) never inserted
  name TEXT,                               -- null until the owner names the cluster
  cover_photo UUID REFERENCES photos(id),
  cover_bbox REAL[],                       -- normalized [x,y,w,h] for CSS crop of cover
  face_count INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE people FORCE ROW LEVEL SECURITY;
REVOKE ALL ON people FROM anon;
REVOKE INSERT, UPDATE, DELETE ON people FROM authenticated;

CREATE TABLE IF NOT EXISTS faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  person_id INT REFERENCES people(id) ON DELETE SET NULL,
  bbox REAL[] NOT NULL,                    -- normalized [x,y,w,h]
  det_score REAL,
  embedding halfvec(512)                   -- ArcFace; halfvec needs pgvector >= 0.7
);
CREATE INDEX IF NOT EXISTS faces_photo_idx  ON faces (photo_id);
CREATE INDEX IF NOT EXISTS faces_person_idx ON faces (person_id);
ALTER TABLE faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE faces FORCE ROW LEVEL SECURITY;
REVOKE ALL ON faces FROM anon;
REVOKE INSERT, UPDATE, DELETE ON faces FROM authenticated;

-- ============ photo_embeddings (CLIP ViT-B/32 'openai' weights — matches
-- Xenova/clip-vit-base-patch32 text tower for v2 in-browser semantic search) ============
CREATE TABLE IF NOT EXISTS photo_embeddings (
  photo_id UUID PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  embedding halfvec(512)
);
CREATE INDEX IF NOT EXISTS photo_embeddings_hnsw ON photo_embeddings
  USING hnsw (embedding halfvec_cosine_ops);
ALTER TABLE photo_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_embeddings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON photo_embeddings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON photo_embeddings FROM authenticated;
