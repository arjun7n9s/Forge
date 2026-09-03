CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Drafts are mutable workflow state. They are deliberately separate from
-- immutable edit and audit history.
CREATE TABLE IF NOT EXISTS drafts (
  id text PRIMARY KEY,
  note_id text NOT NULL,
  doi text NOT NULL,
  card_type text NOT NULL CHECK (card_type IN (
    'corroborated', 'openalex_only', 'crossref_only', 'disagree', 'eoc_only'
  )),
  proposed_body text NOT NULL,
  provenance jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS drafts_note_status_idx ON drafts(note_id, status);

-- Every confirmed/rejected resolution is inserted as a new immutable row.
CREATE TABLE IF NOT EXISTS edit_events (
  id text PRIMARY KEY,
  workspace_id varchar(80) NOT NULL,
  draft_id text NOT NULL,
  note_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('confirmed', 'rejected')),
  previous_hash text NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  link_hash text NOT NULL CHECK (link_hash ~ '^[0-9a-f]{64}$'),
  prev_note_hash text NOT NULL,
  new_note_hash text NOT NULL,
  provenance jsonb NOT NULL,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_edit_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'edit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS edit_events_append_only_update ON edit_events;
CREATE TRIGGER edit_events_append_only_update
BEFORE UPDATE OR DELETE ON edit_events
FOR EACH ROW EXECUTE PROCEDURE reject_edit_event_mutation();

CREATE TABLE IF NOT EXISTS audit_events (
  id serial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  workspace_id varchar(80) NOT NULL,
  event_type text NOT NULL,
  resource_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  link_hash text NOT NULL CHECK (link_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_workspace_idx ON audit_events(workspace_id, id);

CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only_update ON audit_events;
CREATE TRIGGER audit_events_append_only_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE PROCEDURE reject_audit_event_mutation();

CREATE TABLE IF NOT EXISTS doi_cache (
  doi text PRIMARY KEY,
  classification jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS doi_cache_expiry_idx ON doi_cache(expires_at);

CREATE TABLE IF NOT EXISTS workspace_sessions (
  id text PRIMARY KEY,
  workspace_id varchar(80) NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_sessions_hash_idx ON workspace_sessions(token_hash);
