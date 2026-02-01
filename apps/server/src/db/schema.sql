CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genres (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  import_source TEXT,
  import_limit INTEGER,
  import_mode TEXT,
  import_quality TEXT,
  import_auto_download BOOLEAN,
  import_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artists (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  external_source TEXT,
  external_id TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS artists_external_key
  ON artists (external_source, external_id);

CREATE TABLE IF NOT EXISTS artist_genres (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (artist_id, genre_id)
);

CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  year INTEGER,
  external_source TEXT,
  external_id TEXT,
  monitored BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS albums_external_key
  ON albums (external_source, external_id);

CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  track_no INTEGER,
  external_source TEXT,
  external_id TEXT,
  monitored BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tracks_external_key
  ON tracks (external_source, external_id);

CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  youtube_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS download_jobs (
  id SERIAL PRIMARY KEY,
  video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT,
  query TEXT,
  display_title TEXT,
  quality TEXT,
  progress_percent INTEGER DEFAULT 0,
  progress_stage TEXT,
  progress_detail TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS list_sources (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_preferences (
  artist_id INTEGER PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
  import_mode TEXT NOT NULL DEFAULT 'discography',
  quality TEXT NOT NULL DEFAULT '1080p',
  auto_download BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genre_import_jobs (
  id UUID PRIMARY KEY,
  genre_id INTEGER REFERENCES genres(id) ON DELETE SET NULL,
  genre_name TEXT NOT NULL,
  source TEXT NOT NULL,
  import_limit INTEGER NOT NULL,
  import_mode TEXT NOT NULL,
  import_quality TEXT NOT NULL,
  auto_download BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'queued',
  processed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  error_samples JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
