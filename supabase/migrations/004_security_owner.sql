-- Owner registry + owner-scoped access policies, and fixes for two pre-existing
-- overly-permissive policies (nav_config, page_display_config allowed ANY
-- authenticated user to INSERT/UPDATE).
--
-- NOTE: the owner UUID is seeded via psql AFTER this migration runs — never in
-- a migration file (this repo is public):
--   insert into private.owners (user_id, note) values ('<owner-uuid>', 'haydn');

-- ============ owner registry (private schema: not exposed via PostgREST) ============
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.owners (
  user_id UUID PRIMARY KEY,
  note TEXT
);
REVOKE ALL ON private.owners FROM anon, authenticated;

-- SECURITY DEFINER so RLS policies can consult private.owners; empty search_path
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM private.owners o WHERE o.user_id = (SELECT auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.is_owner() FROM public;
GRANT EXECUTE ON FUNCTION public.is_owner() TO anon, authenticated;

-- ============ owner-scoped SELECT on photo tables ============
-- (Writes have no policies at all → denied for client roles; service role bypasses RLS.)
CREATE POLICY conversations_owner_select ON conversations
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY photos_owner_select ON photos
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY photo_sources_owner_select ON photo_sources
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY photo_labels_owner_select ON photo_labels
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY photo_tags_owner_select ON photo_tags
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY people_owner_select ON people
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY faces_owner_select ON faces
  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY photo_embeddings_owner_select ON photo_embeddings
  FOR SELECT TO authenticated USING (public.is_owner());

-- ============ FIX EXISTING HOLES ============
-- Both tables previously allowed ANY authenticated user to INSERT/UPDATE with
-- USING(true). Guarded with to_regclass so this migration is portable across
-- projects where a table may be absent (page_display_config is not deployed on
-- the hosted haydns.ai project).
DO $$
BEGIN
  IF to_regclass('public.nav_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated can insert nav_config" ON nav_config;
    DROP POLICY IF EXISTS "Authenticated can update nav_config" ON nav_config;
    DROP POLICY IF EXISTS "Owner can insert nav_config" ON nav_config;
    DROP POLICY IF EXISTS "Owner can update nav_config" ON nav_config;
    CREATE POLICY "Owner can insert nav_config" ON nav_config
      FOR INSERT TO authenticated WITH CHECK (public.is_owner());
    CREATE POLICY "Owner can update nav_config" ON nav_config
      FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
  END IF;

  IF to_regclass('public.page_display_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can insert page_display_config" ON page_display_config;
    DROP POLICY IF EXISTS "Authenticated users can update page_display_config" ON page_display_config;
    DROP POLICY IF EXISTS "Owner can insert page_display_config" ON page_display_config;
    DROP POLICY IF EXISTS "Owner can update page_display_config" ON page_display_config;
    CREATE POLICY "Owner can insert page_display_config" ON page_display_config
      FOR INSERT TO authenticated WITH CHECK (public.is_owner());
    CREATE POLICY "Owner can update page_display_config" ON page_display_config
      FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
  END IF;
END $$;
