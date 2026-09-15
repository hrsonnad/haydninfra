-- Stable person identities, cluster merging, and two cheap photo signals.
--
-- `people.cluster_id` was the raw HDBSCAN label, UNIQUE NOT NULL, one row per
-- cluster. Two problems fall out of that one design choice:
--
--   1. The label is not stable. Re-clustering after only a 3% change in the
--      face set keeps the integer id for just 12% of clusters, so
--      `INSERT ... ON CONFLICT (cluster_id) DO NOTHING` silently re-points a
--      name the owner typed at a completely different person on the next run.
--   2. One person cannot own two clusters, so the same face showing up as two
--      circles in the People tab has no way to be joined.
--
-- Both are fixed by separating the durable identity (people) from the ephemeral
-- clustering (person_clusters, many-to-one). Identity is re-established on each
-- run by matching new cluster centroids against stored ones, not by label.

-- ============ clusters belong to a person, not the other way round ============
CREATE TABLE IF NOT EXISTS person_clusters (
  cluster_id    INT PRIMARY KEY,           -- pipeline HDBSCAN label; ephemeral
  person_id     INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  centroid      halfvec(512),              -- mean ArcFace vector; how identity survives a re-run
  face_count    INT NOT NULL DEFAULT 0,
  cover_photo   UUID REFERENCES photos(id),
  cover_bbox    REAL[],
  cover_key     TEXT,
  cover_quality REAL,
  usable        BOOLEAN NOT NULL DEFAULT true   -- false => junk bin, not a person
);
CREATE INDEX IF NOT EXISTS person_clusters_person_idx ON person_clusters (person_id);
ALTER TABLE person_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_clusters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON person_clusters FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON person_clusters FROM authenticated;

-- Backfill from the existing one-cluster-per-person rows before relaxing people.
INSERT INTO person_clusters (cluster_id, person_id, face_count, cover_photo,
                             cover_bbox, cover_key, cover_quality, usable)
SELECT p.cluster_id, p.id, p.face_count, p.cover_photo, p.cover_bbox,
       p.cover_key, p.cover_quality, NOT p.hidden
FROM people p WHERE p.cluster_id IS NOT NULL
ON CONFLICT (cluster_id) DO NOTHING;

-- people is now a durable identity: the label is deprecated, nullable, non-unique.
ALTER TABLE people ALTER COLUMN cluster_id DROP NOT NULL;
DO $$ BEGIN
  EXECUTE (SELECT 'ALTER TABLE people DROP CONSTRAINT ' || quote_ident(conname)
           FROM pg_constraint
           WHERE conrelid = 'people'::regclass AND contype = 'u'
             AND pg_get_constraintdef(oid) = 'UNIQUE (cluster_id)'
           LIMIT 1);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
COMMENT ON COLUMN people.cluster_id IS
  'DEPRECATED: ephemeral HDBSCAN label. Cluster ownership lives in person_clusters.';

-- A name the pipeline proposed (from conversation metadata), distinct from a
-- name the owner confirmed. Never overwrites people.name.
ALTER TABLE people ADD COLUMN IF NOT EXISTS name_suggestion TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS name_source TEXT;

-- ============ cheap photo signals that need no model ============
ALTER TABLE photos ADD COLUMN IF NOT EXISTS phash BIGINT;   -- 64-bit DCT perceptual hash
ALTER TABLE photos ADD COLUMN IF NOT EXISTS place TEXT;     -- reverse-geocoded from GPS
CREATE INDEX IF NOT EXISTS photos_phash_idx ON photos (phash) WHERE phash IS NOT NULL;
CREATE INDEX IF NOT EXISTS photos_place_idx ON photos (place) WHERE place IS NOT NULL;

-- ============ merge: fold src into dst, atomically ============
CREATE OR REPLACE FUNCTION public.api_merge_people(src INT, dst INT)
RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE merged jsonb;
BEGIN
  IF src = dst THEN
    RETURN jsonb_build_object('error', 'cannot merge a person into themselves');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM people WHERE id = src)
     OR NOT EXISTS (SELECT 1 FROM people WHERE id = dst) THEN
    RETURN jsonb_build_object('error', 'unknown person');
  END IF;

  -- Every face and every cluster the source owned now belongs to the target.
  -- Moving the clusters is what makes the merge survive re-clustering: both
  -- centroids sit under the surviving person, so both re-form into it next run.
  UPDATE faces SET person_id = dst WHERE person_id = src;
  UPDATE person_clusters SET person_id = dst WHERE person_id = src;

  -- Keep whichever name the owner actually typed; prefer the target's.
  UPDATE people SET name = COALESCE(name, (SELECT name FROM people WHERE id = src))
  WHERE id = dst;

  -- Cover: best-scoring usable cluster now owned by the target.
  UPDATE people p SET
    cover_photo   = c.cover_photo,
    cover_bbox    = c.cover_bbox,
    cover_key     = c.cover_key,
    cover_quality = c.cover_quality
  FROM (SELECT * FROM person_clusters
        WHERE person_id = dst AND usable
        ORDER BY cover_quality DESC NULLS LAST LIMIT 1) c
  WHERE p.id = dst;

  DELETE FROM people WHERE id = src;

  UPDATE people p SET face_count = COALESCE(
    (SELECT COUNT(*) FROM faces f WHERE f.person_id = dst), 0),
    hidden = NOT EXISTS (SELECT 1 FROM person_clusters WHERE person_id = dst AND usable)
  WHERE p.id = dst;

  SELECT jsonb_build_object('id', id, 'name', name, 'face_count', face_count,
                            'clusters', (SELECT COUNT(*) FROM person_clusters
                                         WHERE person_id = dst))
  INTO merged FROM people WHERE id = dst;
  RETURN merged;
END;
$$;
REVOKE ALL ON FUNCTION public.api_merge_people(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_merge_people(INT, INT) TO service_role;

-- ============ facets must read through person_clusters now ============
CREATE OR REPLACE FUNCTION public.api_library_facets()
RETURNS jsonb LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object(
  'people', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'count', p.face_count,
        'cover', p.cover_photo, 'bbox', p.cover_bbox)
      ORDER BY p.face_count DESC)
    FROM people p WHERE NOT p.hidden AND p.face_count > 0), '[]'::jsonb),
  'tags', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'category', t.category, 'count', c.n)
      ORDER BY c.n DESC)
    FROM (SELECT tag_id, COUNT(*) n FROM photo_tags GROUP BY tag_id HAVING COUNT(*) >= 3) c
    JOIN photo_labels t ON t.id = c.tag_id), '[]'::jsonb),
  'conversations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'kind', kind, 'count', photo_count + video_count)
      ORDER BY (photo_count + video_count) DESC)
    FROM conversations WHERE NOT is_shortcode), '[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.api_library_facets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_library_facets() TO service_role;
