-- Helper functions used by the photo-api edge function (called via service role).
-- EXECUTE revoked from client roles: the edge function is the only intended caller.

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

CREATE OR REPLACE FUNCTION public.api_fts(q text)
RETURNS TABLE(id uuid) LANGUAGE sql STABLE AS $$
  SELECT ph.id FROM photos ph
  WHERE ph.fts @@ websearch_to_tsquery('english', q)
  ORDER BY ts_rank(ph.fts, websearch_to_tsquery('english', q)) DESC
  LIMIT 2000;
$$;
REVOKE ALL ON FUNCTION public.api_fts(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_fts(text) TO service_role;
