import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type UpdateSource = "github" | "custom" | "none";

export type UpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  releaseUrl: string | null;
  checkedAt: string;
  source: UpdateSource;
  message?: string | null;
};

const cacheTtlMs = 10 * 60 * 1000;
let cachedStatus: { checkedAtMs: number; data: UpdateStatus } | null = null;

const updatesUrl = process.env.UPDATE_CHECK_URL?.trim() || null;
const githubRepo = process.env.GITHUB_REPO?.trim() || null;

const packageJsonPath = (() => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "../../package.json");
})();

const normalizeVersion = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed;
};

const parseVersion = (value: string | null) => {
  if (!value) return null;
  if (!/^\d+(\.\d+)*$/.test(value)) return null;
  return value.split(".").map((part) => Number(part));
};

const compareVersions = (current: number[], latest: number[]) => {
  const length = Math.max(current.length, latest.length);
  for (let i = 0; i < length; i += 1) {
    const currentValue = current[i] ?? 0;
    const latestValue = latest[i] ?? 0;
    if (currentValue === latestValue) continue;
    return currentValue < latestValue ? -1 : 1;
  }
  return 0;
};

const calculateUpdateAvailable = (current: string, latest: string | null) => {
  const currentParsed = parseVersion(normalizeVersion(current));
  const latestParsed = parseVersion(normalizeVersion(latest));
  if (!currentParsed || !latestParsed) {
    return null;
  }
  return compareVersions(currentParsed, latestParsed) < 0;
};

const readPackageVersion = async () => {
  try {
    const raw = await readFile(packageJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version?.trim() || null;
  } catch {
    return null;
  }
};

const getCurrentVersion = async () => {
  const envVersion = process.env.APP_VERSION?.trim();
  if (envVersion) return envVersion;
  const pkgVersion = await readPackageVersion();
  return pkgVersion || "dev";
};

const fetchJson = async <T>(url: string, headers?: Record<string, string>) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Update check failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text || !text.trim()) {
    throw new Error("Update check returned empty response");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Update check returned invalid JSON");
  }
};

const fetchCustomUpdate = async (url: string) => {
  const data = await fetchJson<Record<string, unknown>>(url);
  const latestVersion =
    normalizeVersion(
      (data.version as string | undefined) ??
        (data.latest as string | undefined) ??
        (data.tag as string | undefined)
    ) ?? null;
  const releaseUrl =
    (data.releaseUrl as string | undefined) ??
    (data.url as string | undefined) ??
    (data.html_url as string | undefined) ??
    null;
  return { latestVersion, releaseUrl };
};

const fetchGithubUpdate = async (repo: string) => {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const data = await fetchJson<{ tag_name?: string; html_url?: string }>(url, {
    Accept: "application/vnd.github+json",
    "User-Agent": "mudarr-update-check"
  });
  const latestVersion = normalizeVersion(data.tag_name ?? null);
  const releaseUrl = data.html_url ?? null;
  return { latestVersion, releaseUrl };
};

export const getUpdateStatus = async (options: { force?: boolean } = {}) => {
  const force = options.force ?? false;
  const now = Date.now();
  if (!force && cachedStatus && now - cachedStatus.checkedAtMs < cacheTtlMs) {
    return cachedStatus.data;
  }

  const currentVersion = await getCurrentVersion();
  const checkedAt = new Date().toISOString();
  const source: UpdateSource = updatesUrl ? "custom" : githubRepo ? "github" : "none";

  if (source === "none") {
    const data: UpdateStatus = {
      currentVersion,
      latestVersion: null,
      updateAvailable: null,
      releaseUrl: null,
      checkedAt,
      source,
      message: "Update check not configured."
    };
    cachedStatus = { checkedAtMs: now, data };
    return data;
  }

  try {
    const result =
      source === "custom"
        ? await fetchCustomUpdate(updatesUrl ?? "")
        : await fetchGithubUpdate(githubRepo ?? "");
    const updateAvailable = calculateUpdateAvailable(currentVersion, result.latestVersion);
    const data: UpdateStatus = {
      currentVersion,
      latestVersion: result.latestVersion,
      updateAvailable,
      releaseUrl: result.releaseUrl,
      checkedAt,
      source,
      message: null
    };
    cachedStatus = { checkedAtMs: now, data };
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update check failed";
    const data: UpdateStatus = {
      currentVersion,
      latestVersion: null,
      updateAvailable: null,
      releaseUrl: null,
      checkedAt,
      source,
      message
    };
    cachedStatus = { checkedAtMs: now, data };
    return data;
  }
};
