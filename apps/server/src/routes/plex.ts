import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";
import { isEnabled } from "../utils/env.js";

const router = Router();

const settingsSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  librarySectionId: z.string().min(1)
});

async function getPlexSettings() {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["plex"]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].value as {
    baseUrl: string;
    token: string;
    librarySectionId: string;
  };
}

router.get("/status", async (_req, res) => {
  const enabled = isEnabled(process.env.PLEX_ENABLED);
  const settings = await getPlexSettings();
  res.json({
    enabled,
    configured: Boolean(settings),
    baseUrl: settings?.baseUrl ?? null
  });
});

router.post("/settings", async (req, res) => {
  if (!isEnabled(process.env.PLEX_ENABLED)) {
    return res.status(501).json({ status: "disabled", message: "Plex integration disabled" });
  }
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const value = parsed.data;
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["plex", value]
  );
  res.json({ status: "saved" });
});

router.post("/refresh", async (_req, res) => {
  if (!isEnabled(process.env.PLEX_ENABLED)) {
    return res.status(501).json({ status: "disabled", message: "Plex integration disabled" });
  }
  const settings = await getPlexSettings();
  if (!settings) {
    return res.status(400).json({ error: "Plex not configured" });
  }

  const url = `${settings.baseUrl}/library/sections/${settings.librarySectionId}/refresh?X-Plex-Token=${settings.token}`;
  const response = await fetch(url, { method: "POST" });

  if (!response.ok) {
    return res.status(502).json({ error: "Failed to refresh Plex library" });
  }

  await pool.query(
    "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
    ["plex_refresh", "Triggered Plex library refresh", { librarySectionId: settings.librarySectionId }]
  );

  res.json({ status: "refreshed" });
});

router.post("/scan", async (_req, res) => {
  if (!isEnabled(process.env.PLEX_ENABLED)) {
    return res.status(501).json({ status: "disabled", message: "Plex integration disabled" });
  }
  const settings = await getPlexSettings();
  if (!settings) {
    return res.status(400).json({ error: "Plex not configured" });
  }

  const url = `${settings.baseUrl}/library/sections/${settings.librarySectionId}/refresh?X-Plex-Token=${settings.token}`;
  const response = await fetch(url, { method: "POST" });

  if (!response.ok) {
    return res.status(502).json({ error: "Failed to scan Plex library" });
  }

  await pool.query(
    "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
    ["plex_scan", "Triggered Plex library scan", { librarySectionId: settings.librarySectionId }]
  );

  res.json({ status: "scanned" });
});

export default router;
