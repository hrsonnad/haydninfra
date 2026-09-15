-- Portfolio v2: target weights, constraints, entry provenance, and multiple
-- named scenarios per snapshot.
--
-- Same rules as 006: this repo is PUBLIC, so no position data and no owner
-- UUID here. Everything is gated by public.is_owner().

-- ============ scenarios ============
-- portfolio_plans already allows many rows per snapshot; these columns make
-- them usable as named, comparable scenarios rather than one implicit plan.
ALTER TABLE portfolio_plans
  ADD COLUMN IF NOT EXISTS archived   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- ============ entry provenance ============
-- Who put this line here. Entries written by the agent over service_role are
-- marked 'claude' so the workspace can show what was proposed vs. decided.
ALTER TABLE portfolio_plan_entries
  ADD COLUMN IF NOT EXISTS source    TEXT NOT NULL DEFAULT 'haydn',
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS accepted  BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE portfolio_plan_entries
    ADD CONSTRAINT portfolio_plan_entries_source_chk
    CHECK (source IN ('haydn', 'claude'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ target weights ============
-- What the portfolio is aiming at, by theme / symbol / asset class. Targets
-- belong to a scenario so alternatives can aim at different places.
CREATE TABLE IF NOT EXISTS portfolio_targets (
  id           BIGSERIAL PRIMARY KEY,
  plan_id      BIGINT NOT NULL REFERENCES portfolio_plans(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'theme'
                 CHECK (kind IN ('theme', 'symbol', 'asset_class')),
  key          TEXT NOT NULL,
  target_pct   NUMERIC,
  ceiling_pct  NUMERIC,
  note         TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_targets_key
  ON portfolio_targets (plan_id, kind, key);

-- ============ constraints ============
-- Cash the portfolio has to produce by a date, and positions that are off the
-- table regardless of what the numbers say.
CREATE TABLE IF NOT EXISTS portfolio_constraints (
  id          BIGSERIAL PRIMARY KEY,
  plan_id     BIGINT NOT NULL REFERENCES portfolio_plans(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'cash_need'
                CHECK (kind IN ('cash_need', 'untouchable', 'note')),
  label       TEXT NOT NULL,
  amount      NUMERIC,
  due_date    DATE,
  symbol      TEXT,
  account     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_constraints_plan_idx
  ON portfolio_constraints (plan_id, sort_order);

-- ============ triggers ============
DROP TRIGGER IF EXISTS portfolio_targets_touch ON portfolio_targets;
CREATE TRIGGER portfolio_targets_touch BEFORE UPDATE ON portfolio_targets
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_touch_updated_at();

DROP TRIGGER IF EXISTS portfolio_constraints_touch ON portfolio_constraints;
CREATE TRIGGER portfolio_constraints_touch BEFORE UPDATE ON portfolio_constraints
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_touch_updated_at();

-- ============ RLS ============
ALTER TABLE portfolio_targets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_targets     FORCE  ROW LEVEL SECURITY;
ALTER TABLE portfolio_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_constraints FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON portfolio_targets, portfolio_constraints FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON portfolio_targets, portfolio_constraints TO authenticated;
REVOKE TRUNCATE ON portfolio_targets, portfolio_constraints
  FROM anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['portfolio_targets', 'portfolio_constraints']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_insert ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_update ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_delete ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_owner_select ON %I FOR SELECT '
      'TO authenticated USING (public.is_owner())', t, t);
    EXECUTE format('CREATE POLICY %I_owner_insert ON %I FOR INSERT '
      'TO authenticated WITH CHECK (public.is_owner())', t, t);
    EXECUTE format('CREATE POLICY %I_owner_update ON %I FOR UPDATE '
      'TO authenticated USING (public.is_owner()) '
      'WITH CHECK (public.is_owner())', t, t);
    EXECUTE format('CREATE POLICY %I_owner_delete ON %I FOR DELETE '
      'TO authenticated USING (public.is_owner())', t, t);
  END LOOP;
END $$;

-- ============ snapshot history helper ============
-- Lists snapshots newest-first with their headline numbers, so the UI can
-- offer a picker and a "what would this composition be worth now" comparison
-- without shipping every blob to the client.
CREATE OR REPLACE VIEW portfolio_snapshot_index AS
  SELECT id, as_of, label, created_at,
         (data->>'total_value')::numeric      AS total_value,
         jsonb_array_length(data->'positions') AS n_positions
  FROM portfolio_snapshots
  ORDER BY as_of DESC;

-- A view runs with its definer's rights, so it would bypass the base table's
-- RLS. security_invoker makes it run as the caller instead, keeping the
-- owner gate intact.
ALTER VIEW portfolio_snapshot_index SET (security_invoker = on);
REVOKE ALL ON portfolio_snapshot_index FROM anon;
GRANT SELECT ON portfolio_snapshot_index TO authenticated;
