INSERT INTO settings (key, value, updated_at)
VALUES ('streams', jsonb_build_object('enabled', true), NOW())
ON CONFLICT (key) DO UPDATE
SET value = COALESCE(settings.value, '{}'::jsonb) || jsonb_build_object('enabled', true),
    updated_at = NOW();
