-- Portfolio workspace: a position snapshot (read-only to the owner) plus the
-- rebalancing plan, its line items, and a notes log that the owner writes from
-- the app.
--
-- SECURITY NOTE: this repo is PUBLIC and served by GitHub Pages, so a data file
-- committed here would be world-readable at haydns.ai/<path>. No position data
-- and no owner UUID may appear in a migration. Snapshot rows are loaded
-- separately over psql; the owner UUID lives in private.owners (seeded via
-- psql in 004). Everything below is gated by public.is_owner().

-- ============ snapshot: the position set, written server-side only ============
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  as_of       DATE NOT NULL,
  label       TEXT,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_snapshots_as_of_key
  ON portfolio_snapshots (as_of);

-- ============ plan: one working plan per snapshot, owner-editable ============
CREATE TABLE IF NOT EXISTS portfolio_plans (
  id           BIGSERIAL PRIMARY KEY,
  snapshot_id  BIGINT NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Working plan',
  -- draft  : still being worked out in conversation
  -- locked : agreed; tab 3 renders pre/post and the execution sequence
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'locked', 'executed')),
  summary      TEXT,
  locked_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ plan line items ============
-- Deliberately a record of decisions, not a model. Amounts are entered as
-- whichever unit the decision was actually made in; the UI resolves them
-- against the snapshot for display.
CREATE TABLE IF NOT EXISTS portfolio_plan_entries (
  id          BIGSERIAL PRIMARY KEY,
  plan_id     BIGINT NOT NULL REFERENCES portfolio_plans(id) ON DELETE CASCADE,
  account     TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  action      TEXT NOT NULL DEFAULT 'sell'
                CHECK (action IN ('sell', 'buy', 'hold')),
  -- exactly one of these is normally set; unit says which one is authoritative
  unit        TEXT NOT NULL DEFAULT 'pct'
                CHECK (unit IN ('pct', 'shares', 'usd')),
  amount      NUMERIC,
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_plan_entries_plan_idx
  ON portfolio_plan_entries (plan_id, sort_order);

-- ============ notes log ============
CREATE TABLE IF NOT EXISTS portfolio_notes (
  id          BIGSERIAL PRIMARY KEY,
  plan_id     BIGINT NOT NULL REFERENCES portfolio_plans(id) ON DELETE CASCADE,
  symbol      TEXT,                      -- optional: pin a note to a position
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_notes_plan_idx
  ON portfolio_notes (plan_id, created_at DESC);

-- ============ updated_at maintenance ============
CREATE OR REPLACE FUNCTION public.portfolio_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS portfolio_plans_touch ON portfolio_plans;
CREATE TRIGGER portfolio_plans_touch BEFORE UPDATE ON portfolio_plans
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_touch_updated_at();

DROP TRIGGER IF EXISTS portfolio_plan_entries_touch ON portfolio_plan_entries;
CREATE TRIGGER portfolio_plan_entries_touch BEFORE UPDATE ON portfolio_plan_entries
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_touch_updated_at();

-- ============ RLS ============
-- ENABLE + FORCE on every table: FORCE means even the table owner is subject to
-- policy, so a mistake elsewhere cannot quietly open a hole. service_role still
-- bypasses RLS, which is how the snapshot loader writes.
ALTER TABLE portfolio_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots     FORCE  ROW LEVEL SECURITY;
ALTER TABLE portfolio_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_plans         FORCE  ROW LEVEL SECURITY;
ALTER TABLE portfolio_plan_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_plan_entries  FORCE  ROW LEVEL SECURITY;
ALTER TABLE portfolio_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_notes         FORCE  ROW LEVEL SECURITY;

-- anon gets nothing at all, on top of RLS denying it anyway
REVOKE ALL ON portfolio_snapshots, portfolio_plans,
              portfolio_plan_entries, portfolio_notes FROM anon;

-- authenticated may attempt these; public.is_owner() decides.
GRANT SELECT ON portfolio_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON portfolio_plans, portfolio_plan_entries, portfolio_notes TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- TRUNCATE is not gated by RLS and is not reachable through PostgREST, but
-- revoke it anyway so the grant set matches the intent.
REVOKE TRUNCATE ON portfolio_snapshots, portfolio_plans,
                   portfolio_plan_entries, portfolio_notes
  FROM anon, authenticated;

-- Supabase's default privileges hand `authenticated` full DML on every new
-- table in public, so the GRANT above does not by itself make the snapshot
-- read-only -- the extra INSERT/UPDATE/DELETE survive. RLS already denies those
-- (no write policies exist), but revoke them so the grant matches the intent
-- and a future policy change cannot silently open writes.
-- Verify with pg_class.relacl, NOT information_schema.role_table_grants, which
-- reports misleadingly empty here.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON portfolio_snapshots FROM authenticated;

-- Snapshot is read-only to the client: SELECT policy only, no write policies,
-- so INSERT/UPDATE/DELETE are denied for anon and authenticated alike.
DROP POLICY IF EXISTS portfolio_snapshots_owner_select ON portfolio_snapshots;
CREATE POLICY portfolio_snapshots_owner_select ON portfolio_snapshots
  FOR SELECT TO authenticated USING (public.is_owner());

-- Plan, entries and notes are owner read/write.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['portfolio_plans',
                           'portfolio_plan_entries',
                           'portfolio_notes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_insert ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_update ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_delete ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_owner_select ON %I FOR SELECT TO authenticated '
      'USING (public.is_owner())', t, t);
    EXECUTE format(
      'CREATE POLICY %I_owner_insert ON %I FOR INSERT TO authenticated '
      'WITH CHECK (public.is_owner())', t, t);
    EXECUTE format(
      'CREATE POLICY %I_owner_update ON %I FOR UPDATE TO authenticated '
      'USING (public.is_owner()) WITH CHECK (public.is_owner())', t, t);
    EXECUTE format(
      'CREATE POLICY %I_owner_delete ON %I FOR DELETE TO authenticated '
      'USING (public.is_owner())', t, t);
  END LOOP;
END $$;
