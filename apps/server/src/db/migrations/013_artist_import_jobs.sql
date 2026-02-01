CREATE TABLE IF NOT EXISTS artist_import_jobs (
  id SERIAL PRIMARY KEY,
  audiodb_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  import_mode TEXT NOT NULL DEFAULT 'discography',
  quality TEXT,
  auto_download BOOLEAN NOT NULL DEFAULT TRUE,
  progress_stage TEXT,
  progress_detail TEXT,
  artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS artist_import_jobs_status ON artist_import_jobs (status);
CREATE INDEX IF NOT EXISTS artist_import_jobs_created_at ON artist_import_jobs (created_at DESC);
