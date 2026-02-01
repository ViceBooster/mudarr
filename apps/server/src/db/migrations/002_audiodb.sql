ALTER TABLE artists ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS artists_external_key
  ON artists (external_source, external_id);

ALTER TABLE albums ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS albums_external_key
  ON albums (external_source, external_id);

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tracks_external_key
  ON tracks (external_source, external_id);
