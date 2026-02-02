import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";
import downloadQueue from "../queue/downloadQueue.js";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, video_id, status, source, query, display_title, quality, progress_percent, progress_stage, progress_detail, started_at, finished_at, error, created_at FROM download_jobs ORDER BY created_at DESC LIMIT 200"
  );
  res.json(result.rows);
});

router.get("/failed", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, status, source, query, error, created_at FROM download_jobs WHERE status = $1 ORDER BY created_at DESC",
    ["failed"]
  );
  res.json(result.rows);
});

router.get("/failed.csv", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, status, source, query, error, created_at FROM download_jobs WHERE status = $1 ORDER BY created_at DESC",
    ["failed"]
  );
  const rows = result.rows;
  const header = ["id", "status", "source", "query", "error", "created_at"];
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    const escaped = text.replace(/\"/g, '\"\"');
    return `"${escaped}"`;
  };
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => escape(row[key])).join(","))].join(
    "\n"
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=\"failed-downloads.csv\"");
  res.send(csv);
});

router.delete("/failed", async (_req, res) => {
  await pool.query("DELETE FROM download_jobs WHERE status = $1", ["failed"]);
  res.status(204).send();
});

router.delete("/active", async (_req, res) => {
  const result = await pool.query(
    "UPDATE download_jobs SET status = $1, finished_at = NOW(), error = $2 WHERE status IN ('queued', 'downloading') RETURNING id",
    ["cancelled", "Cancelled by user"]
  );
  if (result.rows.length > 0) {
    await pool.query(
      "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
      [
        "download_cancelled",
        `Cancelled ${result.rows.length} download(s)`,
        { count: result.rows.length }
      ]
    );
  }
  res.status(204).send();
});

const createSchema = z.object({
  query: z.string().min(1),
  displayTitle: z.string().optional(),
  source: z.string().optional(),
  quality: z.enum(["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p", "4320p"]).optional(),
  artistName: z.string().optional(),
  albumTitle: z.string().optional(),
  trackId: z.number().int().optional(),
  albumId: z.number().int().optional()
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { query, displayTitle, source, quality, artistName, albumTitle, trackId, albumId } =
    parsed.data;
  const result = await pool.query(
    "INSERT INTO download_jobs (status, source, query, display_title, quality, progress_percent, progress_stage, track_id, album_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, status, source, query, display_title, quality, progress_percent, progress_stage, created_at",
    [
      "queued",
      source ?? "manual",
      query,
      displayTitle ?? null,
      quality ?? null,
      0,
      "queued",
      trackId ?? null,
      albumId ?? null
    ]
  );
  const job = result.rows[0];

  await pool.query(
    "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
    ["download_queued", `Queued download: ${query}`, { downloadJobId: job.id }]
  );

  let trackTitle: string | null = null;
  let resolvedArtistId: number | null = null;
  if (trackId) {
    const meta = await pool.query(
      "SELECT t.title, a.artist_id FROM tracks t LEFT JOIN albums a ON a.id = t.album_id WHERE t.id = $1",
      [trackId]
    );
    trackTitle = (meta.rows[0]?.title as string | undefined) ?? null;
    resolvedArtistId = (meta.rows[0]?.artist_id as number | undefined) ?? null;
  }

  await downloadQueue.add("download", {
    downloadJobId: job.id,
    query,
    source: source ?? "manual",
    quality: quality ?? null,
    artistName: artistName ?? null,
    albumTitle: albumTitle ?? null,
    trackId: trackId ?? null,
    trackTitle,
    artistId: resolvedArtistId
  });

  res.status(201).json(job);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid download id" });
  }
  const result = await pool.query(
    "UPDATE download_jobs SET status = $1, finished_at = NOW(), error = $2 WHERE id = $3 AND status IN ('queued', 'downloading') RETURNING id, query",
    ["cancelled", "Cancelled by user", id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Download not found or not cancellable" });
  }
  await pool.query(
    "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
    ["download_cancelled", `Cancelled download: ${result.rows[0].query}`, { downloadJobId: id }]
  );
  res.status(204).send();
});

export default router;
