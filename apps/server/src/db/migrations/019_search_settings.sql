INSERT INTO settings (key, value, updated_at)
VALUES ('search', jsonb_build_object('skipNonOfficialMusicVideos', false), NOW())
ON CONFLICT (key) DO UPDATE
SET value = COALESCE(settings.value, '{}'::jsonb)
  || jsonb_build_object('skipNonOfficialMusicVideos', false),
    updated_at = NOW();
