import type { Request, Response } from "express";
import { ensureStreamToken } from "./streams.js";

export const getTokenFromRequest = (req: Request) => {
  const queryToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (queryToken) return queryToken;
  const headerToken = req.get("x-streaming-options")?.trim();
  if (headerToken) return headerToken;
  const authHeader = req.get("authorization")?.trim() ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
};

export const requireStreamToken = async (req: Request, res: Response) => {
  const token = getTokenFromRequest(req);
  const expected = await ensureStreamToken();
  if (!token || token !== expected) {
    console.warn(`Stream token missing or invalid for ${req.method} ${req.originalUrl ?? req.path}`);
    res.status(401).json({ error: "Stream token required" });
    return null;
  }
  return expected;
};
