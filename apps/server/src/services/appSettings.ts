import pool from "../db/pool.js";

export type GeneralSettings = {
  mediaRoot: string | null;
  domain: string | null;
  publicApiBaseUrl: string | null;
};

type SetupStatus = {
  completed: boolean;
  completedAt: string | null;
};

type CacheEntry<T> = {
  value: T;
  loadedAt: number;
};

const cacheTtlMs = 30_000;
let generalCache: CacheEntry<GeneralSettings> | null = null;
let setupCache: CacheEntry<SetupStatus> | null = null;

const normalizeText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeMediaRoot = (value: unknown) => normalizeText(value);

export const normalizeDomain = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const withoutSlash = raw.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(withoutSlash)) {
    return withoutSlash;
  }
  return `https://${withoutSlash}`;
};

export const normalizeBaseUrl = (value: unknown) => normalizeDomain(value);

export const getGeneralSettings = async (): Promise<GeneralSettings> => {
  const now = Date.now();
  if (generalCache && now - generalCache.loadedAt < cacheTtlMs) {
    return generalCache.value;
  }
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["general"]);
  const stored = result.rows[0]?.value ?? {};
  const value = {
    mediaRoot: normalizeMediaRoot(stored.mediaRoot),
    domain: normalizeText(stored.domain),
    publicApiBaseUrl: normalizeText(stored.publicApiBaseUrl)
  };
  generalCache = { value, loadedAt: now };
  return value;
};

export const setGeneralSettings = async (settings: GeneralSettings) => {
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["general", settings]
  );
  generalCache = { value: settings, loadedAt: Date.now() };
};

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const now = Date.now();
  if (setupCache && now - setupCache.loadedAt < cacheTtlMs) {
    return setupCache.value;
  }
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["setup"]);
  const stored = result.rows[0]?.value ?? {};
  const value = {
    completed: stored.completed === true,
    completedAt: typeof stored.completedAt === "string" ? stored.completedAt : null
  };
  setupCache = { value, loadedAt: now };
  return value;
};

export const setSetupComplete = async () => {
  const payload = { completed: true, completedAt: new Date().toISOString() };
  await pool.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
    ["setup", payload]
  );
  setupCache = { value: payload, loadedAt: Date.now() };
};

export const isSetupComplete = async () => (await getSetupStatus()).completed;

export const getBaseUrl = async (req: {
  protocol: string;
  get: (name: string) => string | undefined;
}) => {
  const settings = await getGeneralSettings();
  const publicApiBaseUrl = normalizeBaseUrl(settings.publicApiBaseUrl);
  if (publicApiBaseUrl) return publicApiBaseUrl;
  const domain = normalizeDomain(settings.domain);
  if (domain) return domain;
  const host = req.get("host") ?? "localhost:3001";
  return `${req.protocol}://${host}`;
};

export const getDefaultMediaRoot = async () => {
  const settings = await getGeneralSettings();
  return settings.mediaRoot ?? process.env.MEDIA_ROOT ?? "/data/music";
};
