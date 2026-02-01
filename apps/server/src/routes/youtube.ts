import { Router } from "express";
import { spawn } from "node:child_process";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

type YoutubeSearchResult = {
  id: string;
  title: string;
  channel: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string | null;
  qualities: string[];
};

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).optional()
});

const allowedHeights = new Set([144, 240, 360, 480, 720, 1080, 1440, 2160, 4320]);

const resolveYtDlpPath = () => process.env.YT_DLP_PATH?.trim() || "yt-dlp";

const spawnYtDlp = (command: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });
  });

const runYtDlpCommand = async (args: string[]) => {
  try {
    return await spawnYtDlp(resolveYtDlpPath(), args);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }
    return spawnYtDlp("python3", ["-m", "yt_dlp", ...args]);
  }
};

const resolveThumbnail = (entry: any) => {
  if (typeof entry?.thumbnail === "string") {
    return entry.thumbnail;
  }
  if (Array.isArray(entry?.thumbnails) && entry.thumbnails.length > 0) {
    const last = entry.thumbnails[entry.thumbnails.length - 1];
    if (last && typeof last.url === "string") {
      return last.url;
    }
  }
  return null;
};

const resolveQualities = (formats: any[]) => {
  if (!Array.isArray(formats)) return [];
  const found = new Set<number>();
  for (const format of formats) {
    const height = format?.height;
    if (typeof height !== "number" || !allowedHeights.has(height)) {
      continue;
    }
    if (format?.vcodec === "none") {
      continue;
    }
    found.add(height);
  }
  return Array.from(found)
    .sort((a, b) => b - a)
    .map((height) => `${height}p`);
};

const buildSearchArgs = (query: string, limit: number, options?: any) => {
  const args = ["--dump-json", "--no-playlist", "--no-warnings", "--skip-download"];
  if (options?.cookiesPath) {
    args.push("--cookies", options.cookiesPath);
  } else if (options?.cookiesFromBrowser) {
    args.push("--cookies-from-browser", options.cookiesFromBrowser);
  } else if (options?.cookiesHeader) {
    const trimmed = String(options.cookiesHeader ?? "").trim();
    const headerValue = trimmed.toLowerCase().startsWith("cookie:")
      ? trimmed.slice(trimmed.indexOf(":") + 1).trim()
      : trimmed;
    const singleLineValue = headerValue.split(/\r?\n/)[0]?.trim();
    if (singleLineValue) {
      args.push("--add-header", `Cookie: ${singleLineValue}`);
    }
  }
  args.push(`ytsearch${limit}:${query}`);
  return args;
};

const parseSearchOutput = (output: string): YoutubeSearchResult[] => {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results: YoutubeSearchResult[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry?.id || !entry?.title) {
        continue;
      }
      results.push({
        id: String(entry.id),
        title: String(entry.title),
        channel: (entry.uploader || entry.channel || null) as string | null,
        duration: typeof entry.duration === "number" ? entry.duration : null,
        thumbnail: resolveThumbnail(entry),
        webpageUrl: typeof entry.webpage_url === "string" ? entry.webpage_url : null,
        qualities: resolveQualities(entry.formats)
      });
    } catch (error) {
      continue;
    }
  }
  return results;
};

router.get("/search", async (req, res) => {
  const parsed = searchSchema.safeParse({ query: req.query.query, limit: req.query.limit });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const query = parsed.data.query.trim();
  if (!query) {
    return res.json([]);
  }
  const limit = parsed.data.limit ?? 6;
  try {
    const settingsResult = await pool.query("SELECT value FROM settings WHERE key = $1", [
      "youtube"
    ]);
    const youtubeSettings = settingsResult.rows[0]?.value ?? {};
    const output = await runYtDlpCommand(buildSearchArgs(query, limit, youtubeSettings));
    res.json(parseSearchOutput(output));
  } catch (error) {
    res.status(502).json({ error: "YouTube search failed" });
  }
});

export default router;
