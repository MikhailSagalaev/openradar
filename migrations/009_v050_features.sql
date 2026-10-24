-- OpenRadar v0.5.0 Migration: GitHub Trial, Slashing Blacklist, and X-Ray Indexes

ALTER TABLE mesh_nodes
  ADD COLUMN IF NOT EXISTS github_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_mesh_nodes_is_banned ON mesh_nodes (is_banned);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_github_verified ON mesh_nodes (github_verified_at);

CREATE INDEX IF NOT EXISTS idx_leads_canonical_url ON leads (canonical_url);
CREATE INDEX IF NOT EXISTS idx_leads_url ON leads (url);
