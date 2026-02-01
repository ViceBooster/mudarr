import { Router } from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import pool from "../db/pool.js";
import {
  getDefaultMediaRoot,
  getGeneralSettings,
  setGeneralSettings
} from "../services/appSettings.js";
import { getAdminUser, updateAdminUser } from "../services/auth.js";
import { invalidateIntegrationSettings } from "../services/settings.js";
import {
  ensureStreamToken,
  getStreamSettings,
  rotateStreamToken,
  setStreamToken
} from "../services/streams.js";

const router = Router();

const outputFormatOptions = ["original", "mp4-remux", "mp4-recode"] as const;

const youtubeSchema = z.object({
  cookiesPath: z.string().nullish(),
  cookiesFromBrowser: z.string().nullish(),
  cookiesHeader: z.string().nullish(),
  outputFormat: z.enum(outputFormatOptions).nullish()
});

const integrationsSchema = z.object({
  audiodbApiKey: z.string().nullish(),
  lastfmApiKey: z.string().nullish()
});

const streamSettingsSchema = z.object({
  token: z.string().optional(),
  enabled: z.boolean().optional()
});

const downloadSettingsSchema = z.object({
  concurrency: z.coerce.number().int().min(1).max(10).nullable().optional()
});

const generalSettingsSchema = z.object({
  mediaRoot: z.string().trim().min(1),
  domain: z.string().trim().optional().nullable(),
  publicApiBaseUrl: z.string().trim().optional().nullable()
});

const adminSettingsSchema = z.object({
  username: z.string().trim().min(1).optional(),
  password: z.string().min(6).optional()
});

const browseSchema = z.object({
  path: z.string().optional().nullable()
});

const listDirectories = async (targetPath: string) => {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(targetPath, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const normalizeCookiesHeader = (raw?: string | null) => {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^cookie\\s*:\\s*(.+)$/im);
  if (match?.[1]) {
    return match[1].trim();
  }
  const lines = trimmed.split(/\\r?\\n/);
  const cookieLine = lines.find((line) => /^cookie\\s*:/i.test(line));
  if (cookieLine) {
    return cookieLine.replace(/^cookie\\s*:/i, "").trim();
  }
  return trimmed;
};

const normalizeOutputFormat = (raw?: string | null) => {
  if (!raw) {
    return null;
  }
  return outputFormatOptions.includes(raw as (typeof outputFormatOptions)[number])
    ? raw
    : null;
};

router.get("/youtube", async (_req, res) => {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["youtube"]);
  if (result.rows.length === 0) {
    return res.json({
      cookiesPath: null,
      cookiesFromBrowser: null,
      cookiesHeader: null,
      outputFormat: null
    });
  }
  res.json(result.rows[0].value);
});

router.put("/youtube", async (req, res) => {
  const parsed = youtubeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const cookiesPath = parsed.data.cookiesPath?.trim() || null;
  const cookiesFromBrowser = parsed.data.cookiesFromBrowser?.trim() || null;
  const cookiesHeader = normalizeCookiesHeader(parsed.data.cookiesHeader);
  const outputFormat = normalizeOutputFormat(parsed.data.outputFormat);

  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["youtube", { cookiesPath, cookiesFromBrowser, cookiesHeader, outputFormat }]
  );

  res.json({ status: "saved", cookiesPath, cookiesFromBrowser, cookiesHeader, outputFormat });
});

router.get("/downloads", async (_req, res) => {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["downloads"]);
  const stored = result.rows[0]?.value ?? {};
  const concurrency =
    typeof stored.concurrency === "number" && Number.isFinite(stored.concurrency)
      ? Math.max(1, Math.min(10, Math.floor(stored.concurrency)))
      : null;
  res.json({ concurrency });
});

router.put("/downloads", async (req, res) => {
  const parsed = downloadSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const concurrency =
    typeof parsed.data.concurrency === "number" ? parsed.data.concurrency : null;
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["downloads", { concurrency }]
  );
  res.json({ concurrency });
});

router.get("/integrations", async (_req, res) => {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["integrations"]);
  const stored = result.rows[0]?.value ?? {};
  const audiodbApiKey =
    typeof stored.audiodbApiKey === "string" ? stored.audiodbApiKey : null;
  const lastfmApiKey = typeof stored.lastfmApiKey === "string" ? stored.lastfmApiKey : null;
  res.json({
    audiodbApiKey,
    lastfmApiKey,
    audiodbConfigured: Boolean(audiodbApiKey || process.env.AUDIODB_API_KEY),
    lastfmConfigured: Boolean(lastfmApiKey || process.env.LASTFM_API_KEY)
  });
});

router.put("/integrations", async (req, res) => {
  const parsed = integrationsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const audiodbApiKey = parsed.data.audiodbApiKey?.trim() || null;
  const lastfmApiKey = parsed.data.lastfmApiKey?.trim() || null;

  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["integrations", { audiodbApiKey, lastfmApiKey }]
  );
  invalidateIntegrationSettings();

  res.json({
    status: "saved",
    audiodbApiKey,
    lastfmApiKey,
    audiodbConfigured: Boolean(audiodbApiKey || process.env.AUDIODB_API_KEY),
    lastfmConfigured: Boolean(lastfmApiKey || process.env.LASTFM_API_KEY)
  });
});

router.get("/streams", async (_req, res) => {
  const settings = await getStreamSettings();
  const token = settings.token ?? (await ensureStreamToken());
  res.json({ token, enabled: settings.enabled });
});

router.put("/streams", async (req, res) => {
  const parsed = streamSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const current = await getStreamSettings();
  const enabled =
    typeof parsed.data.enabled === "boolean" ? parsed.data.enabled : current.enabled;
  const token =
    typeof parsed.data.token === "string" ? await setStreamToken(parsed.data.token) : current.token;
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["streams", { token, enabled }]
  );
  res.json({ token: token ?? (await ensureStreamToken()), enabled });
});

router.post("/streams/token", async (_req, res) => {
  const token = await rotateStreamToken();
  const settings = await getStreamSettings();
  res.json({ token, enabled: settings.enabled });
});

router.get("/general", async (_req, res) => {
  const settings = await getGeneralSettings();
  res.json(settings);
});

router.put("/general", async (req, res) => {
  const parsed = generalSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const mediaRoot = parsed.data.mediaRoot.trim();
  const domain = parsed.data.domain?.trim() || null;
  const publicApiBaseUrl = parsed.data.publicApiBaseUrl?.trim() || null;
  try {
    await fs.mkdir(mediaRoot, { recursive: true });
  } catch {
    return res.status(400).json({ error: "Unable to access media storage directory" });
  }
  await setGeneralSettings({ mediaRoot, domain, publicApiBaseUrl });
  res.json({ mediaRoot, domain, publicApiBaseUrl });
});

router.get("/admin", async (_req, res) => {
  const user = await getAdminUser();
  res.json({ username: user?.username ?? null });
});

router.put("/admin", async (req, res) => {
  const parsed = adminSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!parsed.data.username && !parsed.data.password) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  const updated = await updateAdminUser({
    username: parsed.data.username,
    password: parsed.data.password
  });
  if (!updated) {
    return res.status(404).json({ error: "Admin user not found" });
  }
  res.json({ username: updated.username });
});

router.get("/storage/browse", async (req, res) => {
  const parsed = browseSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid browse request" });
  }
  const requested = parsed.data.path?.trim();
  const targetPath = requested || (await getDefaultMediaRoot()) || os.homedir();
  let resolved = path.resolve(targetPath);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }
  } catch {
    if (!requested) {
      resolved = path.resolve(os.homedir());
      try {
        const stats = await fs.stat(resolved);
        if (!stats.isDirectory()) {
          return res.status(400).json({ error: "Path is not a directory" });
        }
      } catch {
        return res.status(404).json({ error: "Directory not found" });
      }
    } else {
      return res.status(404).json({ error: "Directory not found" });
    }
  }
  const parent = path.dirname(resolved);
  const entries = await listDirectories(resolved);
  res.json({
    path: resolved,
    parent: parent === resolved ? null : parent,
    entries
  });
});

export default router;
