import type { NextFunction, Request, Response } from "express";
import { isSetupComplete } from "../services/appSettings.js";
import { verifyAdminCredentials } from "../services/auth.js";

const parseBasicAuth = (header?: string) => {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return null;
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
};

const getAuthHeader = (req: Request) => {
  const header = req.get("authorization");
  if (header) return header;
  const queryAuth = typeof req.query.auth === "string" ? req.query.auth.trim() : "";
  if (queryAuth) return queryAuth;
  return null;
};

const isTokenOnlyStreamPath = (path: string) => {
  if (path.startsWith("/streams/")) {
    if (path.includes("/hls/")) return true;
    if (path.endsWith("/playlist.m3u8")) return true;
    if (path.endsWith("/playlist.m3u")) return true;
    if (path.endsWith("/stream")) return true;
    return false;
  }
  if (path.startsWith("/tracks/")) {
    if (path.includes("/hls/")) return true;
    if (path.endsWith("/stream")) return true;
    return false;
  }
  return false;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/setup/status") {
    return next();
  }

  if (isTokenOnlyStreamPath(req.path)) {
    return next();
  }

  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    if (req.path.startsWith("/setup")) {
      return next();
    }
    return res.status(403).json({ error: "Initial setup required" });
  }

  if (req.path === "/auth/login") {
    return next();
  }

  const credentials = parseBasicAuth(getAuthHeader(req) ?? undefined);
  if (!credentials) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = await verifyAdminCredentials(credentials.username, credentials.password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.locals.user = user;
  return next();
};
