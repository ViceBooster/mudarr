CREATE TABLE IF NOT EXISTS stats_samples (
  id SERIAL PRIMARY KEY,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_connections INTEGER NOT NULL,
  bandwidth_bps BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS stats_samples_sampled_at_idx
  ON stats_samples (sampled_at DESC);
