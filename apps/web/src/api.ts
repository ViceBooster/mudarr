const authStorageKey = "mudarr-auth";

type RuntimeConfig = {
  apiBaseUrl?: string | null;
};

const getRuntimeConfig = (): RuntimeConfig => {
  if (typeof window === "undefined") {
    return {};
  }
  return (window as typeof window & { __MUDARR_CONFIG__?: RuntimeConfig }).__MUDARR_CONFIG__ ?? {};
};

const normalizeBaseUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const runtimeApiBaseUrl = normalizeBaseUrl(getRuntimeConfig().apiBaseUrl);

export const apiBaseUrl =
  runtimeApiBaseUrl ??
  normalizeBaseUrl(import.meta.env.VITE_API_URL ?? null) ??
  "http://localhost:3001";

export const getAuthToken = () => {
  try {
    return localStorage.getItem(authStorageKey);
  } catch {
    return null;
  }
};

export const setAuthToken = (token: string | null) => {
  try {
    if (!token) {
      localStorage.removeItem(authStorageKey);
      return;
    }
    localStorage.setItem(authStorageKey, token);
  } catch {
    // ignore storage errors
  }
};

const withAuth = (options: RequestInit = {}): RequestInit => {
  const token = getAuthToken();
  const headers = new Headers(options.headers ?? undefined);
  if (token) {
    headers.set("Authorization", token);
  }
  return { ...options, headers };
};

export async function apiGet<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, withAuth(options));
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(
    `${apiBaseUrl}${path}`,
    withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
    })
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(
    `${apiBaseUrl}${path}`,
    withAuth({
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
    })
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}${path}`, withAuth({ method: "DELETE" }));
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(
    `${apiBaseUrl}${path}`,
    withAuth({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
    })
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
