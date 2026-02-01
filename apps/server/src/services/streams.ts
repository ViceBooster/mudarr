import crypto from "node:crypto";
import pool from "../db/pool.js";

type StreamSettings = {
  token: string | null;
  enabled: boolean;
};

type CachedToken = {
  token: string;
  loadedAt: number;
};

const cacheTtlMs = 30_000;
let tokenCache: CachedToken | null = null;

const normalizeToken = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeEnabled = (value: unknown) => (typeof value === "boolean" ? value : true);

const loadStreamSettings = async (): Promise<StreamSettings> => {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["streams"]);
  const stored = result.rows[0]?.value ?? {};
  return {
    token: normalizeToken(stored.token),
    enabled: normalizeEnabled(stored.enabled)
  };
};

export const getStreamSettings = async (): Promise<StreamSettings> => loadStreamSettings();

const storeStreamToken = async (token: string) => {
  const current = await loadStreamSettings();
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["streams", { token, enabled: current.enabled }]
  );
  tokenCache = { token, loadedAt: Date.now() };
};

const generateToken = () => crypto.randomBytes(24).toString("hex");

export const getStreamToken = async (): Promise<string | null> => {
  const now = Date.now();
  if (tokenCache && now - tokenCache.loadedAt < cacheTtlMs) {
    return tokenCache.token;
  }
  const settings = await loadStreamSettings();
  if (settings.token) {
    tokenCache = { token: settings.token, loadedAt: now };
    return settings.token;
  }
  tokenCache = null;
  return null;
};

export const ensureStreamToken = async (): Promise<string> => {
  const existing = await getStreamToken();
  if (existing) return existing;
  const token = generateToken();
  await storeStreamToken(token);
  return token;
};

export const setStreamToken = async (rawToken: string): Promise<string> => {
  const token = normalizeToken(rawToken);
  if (!token) {
    return ensureStreamToken();
  }
  await storeStreamToken(token);
  return token;
};

export const rotateStreamToken = async (): Promise<string> => {
  const token = generateToken();
  await storeStreamToken(token);
  return token;
};
