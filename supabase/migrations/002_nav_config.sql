-- Nav config table: single-row JSONB tree config for the sidebar nav
CREATE TABLE IF NOT EXISTS nav_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tree JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE nav_config ENABLE ROW LEVEL SECURITY;

-- Public (anon) can read
CREATE POLICY "Public can read nav_config"
  ON nav_config FOR SELECT
  TO anon
  USING (true);

-- Authenticated users can read
CREATE POLICY "Authenticated can read nav_config"
  ON nav_config FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated can insert nav_config"
  ON nav_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated can update nav_config"
  ON nav_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_nav_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_nav_config_updated_at
  BEFORE UPDATE ON nav_config
  FOR EACH ROW
  EXECUTE FUNCTION update_nav_config_updated_at();

-- Seed with the current hardcoded tree (Welcome excluded — it's always pinned by the app)
INSERT INTO nav_config (tree) VALUES (
  '[
    {
      "id": "about",
      "label": "About.me",
      "type": "branch",
      "open": true,
      "children": [
        { "id": "resume", "label": "Resume", "type": "page" }
      ]
    },
    {
      "id": "projects",
      "label": "Projects",
      "type": "branch",
      "open": true,
      "children": [
        { "id": "prtfolio", "label": "Prtfolio.ai", "type": "page" }
      ]
    },
    {
      "id": "public-pages",
      "label": "Public",
      "type": "branch",
      "open": true,
      "children": [
        {
          "id": "orchestration",
          "label": "Orchestration",
          "type": "branch",
          "open": true,
          "children": [
            { "id": "wk-readme", "label": "Read.me", "type": "link", "href": "admin/workflow-readme.html" },
            {
              "id": "wk-agents",
              "label": "Agents",
              "type": "branch",
              "open": true,
              "children": [
                { "id": "wk-planning", "label": "Planning", "type": "link", "href": "admin/workflow-agents.html" }
              ]
            }
          ]
        },
        {
          "id": "just-for-fun",
          "label": "Just for Fun",
          "type": "branch",
          "open": true,
          "children": [
            { "id": "just-for-fun-ufc", "label": "UFC", "type": "link", "href": "public/ufc.html" }
          ]
        }
      ]
    }
  ]'::jsonb
);
