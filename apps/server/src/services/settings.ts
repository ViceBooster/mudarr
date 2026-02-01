import pool from "../db/pool.js";

export type IntegrationSettings = {
  audiodbApiKey: string | null;
  lastfmApiKey: string | null;
};

type CacheEntry = {
  value: IntegrationSettings;
  loadedAt: number;
};

const cacheTtlMs = 30_000;
let integrationCache: CacheEntry | null = null;

const normalizeKey = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

export const getIntegrationSettings = async (): Promise<IntegrationSettings> => {
  const now = Date.now();
  if (integrationCache && now - integrationCache.loadedAt < cacheTtlMs) {
    return integrationCache.value;
  }
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["integrations"]);
  const stored = result.rows[0]?.value ?? {};
  const value = {
    audiodbApiKey: normalizeKey(stored.audiodbApiKey),
    lastfmApiKey: normalizeKey(stored.lastfmApiKey)
  };
  integrationCache = { value, loadedAt: now };
  return value;
};

export const invalidateIntegrationSettings = () => {
  integrationCache = null;
};
