ALTER TABLE download_jobs ADD COLUMN IF NOT EXISTS progress_stage TEXT;
ALTER TABLE download_jobs ADD COLUMN IF NOT EXISTS progress_detail TEXT;
