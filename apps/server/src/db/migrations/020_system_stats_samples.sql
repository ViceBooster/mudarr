ALTER TABLE stats_samples
  ADD COLUMN IF NOT EXISTS cpu_usage_percent REAL NOT NULL DEFAULT 0;

ALTER TABLE stats_samples
  ADD COLUMN IF NOT EXISTS memory_usage_percent REAL NOT NULL DEFAULT 0;
