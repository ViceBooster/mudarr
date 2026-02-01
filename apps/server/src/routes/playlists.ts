import { Router } from "express";
import pool from "../db/pool.js";
import { getBaseUrl } from "../services/appSettings.js";

const router = Router();

const getAuthQuery = (req: { get: (name: string) => string | undefined; query: any }) => {
  const header = req.get("authorization")?.trim();
  if (header) {
    return `auth=${encodeURIComponent(header)}`;
  }
  const queryAuth = typeof req.query?.auth === "string" ? req.query.auth.trim() : "";
  return queryAuth ? `auth=${encodeURIComponent(queryAuth)}` : "";
};

const writeM3u = (res: { setHeader: (name: string, value: string) => void; send: (body: string) => void }, filename: string, lines: string[]) => {
  res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(["#EXTM3U", ...lines].join("\n"));
};

router.get("/artist/:id.m3u", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }

  const result = await pool.query(
    `SELECT t.id AS track_id, t.title, a.name AS artist_name, al.title AS album_title
     FROM artists a
     JOIN albums al ON al.artist_id = a.id
     JOIN tracks t ON t.album_id = al.id
     JOIN videos v ON v.track_id = t.id AND v.status = 'completed'
     WHERE a.id = $1
     ORDER BY al.year ASC NULLS LAST, al.title ASC, t.track_no ASC NULLS LAST, t.title ASC`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "No downloaded tracks found for this artist" });
  }

  const baseUrl = await getBaseUrl(req);
  const authQuery = getAuthQuery(req);
  const lines = result.rows.map((row: { track_id: number; title: string; artist_name: string }) => {
    const title = `${row.artist_name} - ${row.title}`.trim();
    const streamUrl = `${baseUrl}/api/tracks/${row.track_id}/stream${
      authQuery ? `?${authQuery}` : ""
    }`;
    return `#EXTINF:-1,${title}\n${streamUrl}`;
  });
  const safeName = String(result.rows[0].artist_name ?? "artist")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  writeM3u(res, `${safeName || "artist"}.m3u`, lines);
});

router.get("/album/:id.m3u", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid album id" });
  }

  const result = await pool.query(
    `SELECT t.id AS track_id, t.title, al.title AS album_title, a.name AS artist_name
     FROM albums al
     JOIN artists a ON a.id = al.artist_id
     JOIN tracks t ON t.album_id = al.id
     JOIN videos v ON v.track_id = t.id AND v.status = 'completed'
     WHERE al.id = $1
     ORDER BY t.track_no ASC NULLS LAST, t.title ASC`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "No downloaded tracks found for this album" });
  }

  const baseUrl = await getBaseUrl(req);
  const authQuery = getAuthQuery(req);
  const lines = result.rows.map((row: { track_id: number; title: string; artist_name: string }) => {
    const title = `${row.artist_name} - ${row.title}`.trim();
    const streamUrl = `${baseUrl}/api/tracks/${row.track_id}/stream${
      authQuery ? `?${authQuery}` : ""
    }`;
    return `#EXTINF:-1,${title}\n${streamUrl}`;
  });
  const safeAlbum = String(result.rows[0].album_title ?? "album")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  writeM3u(res, `${safeAlbum || "album"}.m3u`, lines);
});

export default router;
