import { Router } from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import pool from "../db/pool.js";
import {
  getDefaultMediaRoot,
  getGeneralSettings,
  getSetupStatus,
  setGeneralSettings,
  setSetupComplete
} from "../services/appSettings.js";
import { getAdminUser, setAdminUser } from "../services/auth.js";
import { ensureStreamToken, getStreamSettings } from "../services/streams.js";

const router = Router();

const setupSchema = z.object({
  adminUsername: z.string().trim().min(1),
  adminPassword: z.string().min(6),
  mediaRoot: z.string().trim().min(1),
  domain: z.string().trim().optional().nullable(),
  publicApiBaseUrl: z.string().trim().optional().nullable(),
  streamEnabled: z.boolean().optional()
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

router.get("/status", async (_req, res) => {
  const status = await getSetupStatus();
  if (status.completed) {
    return res.json({ completed: true });
  }
  const general = await getGeneralSettings();
  const streams = await getStreamSettings();
  const mediaRoot = general.mediaRoot ?? (await getDefaultMediaRoot());
  res.json({
    completed: false,
    defaults: {
      mediaRoot,
      domain: general.domain,
      publicApiBaseUrl: general.publicApiBaseUrl,
      streamEnabled: streams.enabled
    }
  });
});

router.get("/browse", async (req, res) => {
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

router.post("/", async (req, res) => {
  const status = await getSetupStatus();
  const existingUser = await getAdminUser();
  if (status.completed || existingUser) {
    return res.status(409).json({ error: "Initial setup already completed" });
  }
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { adminUsername, adminPassword, mediaRoot, domain, publicApiBaseUrl, streamEnabled } =
    parsed.data;
  try {
    await fs.mkdir(mediaRoot, { recursive: true });
  } catch {
    return res.status(400).json({ error: "Unable to create media storage directory" });
  }
  await setAdminUser(adminUsername, adminPassword);
  await setGeneralSettings({
    mediaRoot: mediaRoot.trim(),
    domain: domain?.trim() || null,
    publicApiBaseUrl: publicApiBaseUrl?.trim() || null
  });
  const streamSettings = await getStreamSettings();
  const enabled =
    typeof streamEnabled === "boolean" ? streamEnabled : streamSettings.enabled ?? true;
  const token = streamSettings.token ?? (await ensureStreamToken());
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["streams", { token, enabled }]
  );
  await setSetupComplete();
  res.json({ completed: true });
});

export default router;
