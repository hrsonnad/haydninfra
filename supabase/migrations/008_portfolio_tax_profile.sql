-- Tax profile: income, filing status and state rate, from which the app
-- derives the long-term capital-gains rate (for taxable sales) and the
-- ordinary marginal rate (for traditional-IRA withdrawals and short-term
-- gains). Both are overridable, because bracket thresholds move and the
-- app's are estimates.
--
-- Settings are per-owner rather than per-scenario: income does not change
-- because you are comparing two rebalancing plans. One row, enforced.

CREATE TABLE IF NOT EXISTS portfolio_settings (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  profile     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO portfolio_settings (id, profile)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS portfolio_settings_touch ON portfolio_settings;
CREATE TRIGGER portfolio_settings_touch BEFORE UPDATE ON portfolio_settings
  FOR EACH ROW EXECUTE FUNCTION public.portfolio_touch_updated_at();

ALTER TABLE portfolio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_settings FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON portfolio_settings FROM anon;
GRANT SELECT, UPDATE ON portfolio_settings TO authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON portfolio_settings FROM anon, authenticated;

DROP POLICY IF EXISTS portfolio_settings_owner_select ON portfolio_settings;
CREATE POLICY portfolio_settings_owner_select ON portfolio_settings
  FOR SELECT TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS portfolio_settings_owner_update ON portfolio_settings;
CREATE POLICY portfolio_settings_owner_update ON portfolio_settings
  FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
