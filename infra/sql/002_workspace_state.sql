CREATE TABLE IF NOT EXISTS workspace_state (
  workspace_id varchar(80) PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
