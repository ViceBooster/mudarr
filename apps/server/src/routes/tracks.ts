import { Router } from "express";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import pool from "../db/pool.js";
import downloadQueue from "../queue/downloadQueue.js";
import { getMediaInfo } from "../services/media.js";
import { requireStreamToken } from "../services/streamAuth.js";

const router = Router();

const updateSchema = z.object({
  monitored: z.boolean()
});

const contentTypeByExt: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska"
};

const hlsCacheDirName = ".mudarr-hls";
const getTrackHlsDir = (filePath: string, trackId: number) =>
  path.join(path.dirname(filePath), hlsCacheDirName, `track-${trackId}`);

const loadTrackFilePath = async (trackId: number) => {
  const result = await pool.query(
    "SELECT file_path FROM videos WHERE track_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1",
    [trackId]
  );
  const filePath = result.rows[0]?.file_path as string | null | undefined;
  return filePath ?? null;
};

router.get("/:id/stream", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }

  const filePath = await loadTrackFilePath(id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Track media not found" });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  if (fileSize <= 0) {
    return res.status(404).json({ error: "Track media not ready" });
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypeByExt[ext] ?? "application/octet-stream";
  const range = req.headers.range;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");

  const sendFull = () => {
    res.setHeader("Content-Length", fileSize);
    return fs.createReadStream(filePath).pipe(res);
  };

  if (range) {
    const match = range.match(/bytes=(\\d+)-(\\d*)/);
    if (!match) {
      return sendFull();
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      return sendFull();
    }

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Content-Length", end - start + 1);
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  return sendFull();
});

router.get("/:id/hls/playlist.m3u8", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const filePath = await loadTrackFilePath(id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Track media not found" });
  }
  const playlistPath = path.join(getTrackHlsDir(filePath, id), "playlist.m3u8");
  try {
    const body = await fsPromises.readFile(playlistPath, "utf8");
    const tokenParam = encodeURIComponent(token);
    const appendToken = (value: string) =>
      value.includes("?") ? `${value}&token=${tokenParam}` : `${value}?token=${tokenParam}`;
    const baseUrl = `${req.protocol}://${req.get("host") ?? "localhost:3002"}`;
    const rewriteSegment = (segment: string) =>
      `${baseUrl}/api/tracks/${id}/hls/${encodeURIComponent(segment)}`;
    const rewritten = body
      .split(/\r?\n/)
      .map((line) => {
        if (!line) return line;
        if (line.startsWith("#EXT-X-MAP:")) {
          return line.replace(/URI="([^"]+)"/, (_match, uri) =>
            `URI="${appendToken(rewriteSegment(uri))}"`
          );
        }
        if (line.startsWith("#")) {
          return line;
        }
        return appendToken(rewriteSegment(line));
      })
      .join("\n");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    return res.send(rewritten);
  } catch {
    return res.status(404).json({ error: "HLS playlist not found" });
  }
});

router.get("/:id/hls/:segment", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const segment = req.params.segment;
  if (!/^[a-zA-Z0-9._-]+$/.test(segment)) {
    return res.status(400).json({ error: "Invalid segment" });
  }
  const filePath = await loadTrackFilePath(id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Track media not found" });
  }
  const hlsDir = getTrackHlsDir(filePath, id);
  const segmentPath = path.join(hlsDir, segment);
  if (!segmentPath.startsWith(hlsDir)) {
    return res.status(400).json({ error: "Invalid segment" });
  }
  try {
    const stats = await fsPromises.stat(segmentPath);
    if (!stats.isFile()) {
      return res.status(404).json({ error: "Segment not found" });
    }
  } catch {
    return res.status(404).json({ error: "Segment not found" });
  }
  if (segment.endsWith(".m3u8")) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  } else if (segment.endsWith(".m4s") || segment.endsWith(".mp4")) {
    res.setHeader("Content-Type", "video/mp4");
  } else if (segment.endsWith(".ts")) {
    res.setHeader("Content-Type", "video/mp2t");
  } else {
    res.setHeader("Content-Type", "application/octet-stream");
  }
  res.setHeader("Cache-Control", "no-store");
  return res.sendFile(segmentPath);
});

router.get("/:id/media-info", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }

  const result = await pool.query(
    "SELECT file_path FROM videos WHERE track_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1",
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Track media not found" });
  }
  const filePath = result.rows[0].file_path as string | null;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Track media not found" });
  }

  const info = await getMediaInfo(filePath);
  res.json({
    bytes: info.bytes,
    duration: info.duration,
    audioCodec: info.audioCodec,
    videoCodec: info.videoCodec,
    videoWidth: info.videoWidth,
    videoHeight: info.videoHeight,
    bitRate: info.bitRate
  });
});

router.delete("/:id/media", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }

  const result = await pool.query(
    "SELECT id, file_path FROM videos WHERE track_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1",
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Track media not found" });
  }

  const videoId = result.rows[0].id as number;
  const filePath = result.rows[0].file_path as string | null;
  if (filePath && fs.existsSync(filePath)) {
    await fsPromises.unlink(filePath);
  }

  await pool.query("UPDATE videos SET status = $1, file_path = $2 WHERE id = $3", [
    "deleted",
    null,
    videoId
  ]);

  res.status(204).send();
});

router.post("/:id/remux", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }

  const result = await pool.query(
    "SELECT id, file_path FROM videos WHERE track_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1",
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Track media not found" });
  }

  const videoId = result.rows[0].id as number;
  const filePath = result.rows[0].file_path as string | null;
  if (!filePath) {
    return res.status(404).json({ error: "Track media not found" });
  }

  await pool.query(
    "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
    ["remux_queued", `Queued remux for track ${id}`, { trackId: id, videoId }]
  );

  await downloadQueue.add("remux", {
    trackId: id,
    videoId,
    filePath
  });

  res.status(202).json({ status: "queued" });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid track id" });
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await pool.query(
    "UPDATE tracks SET monitored = $1 WHERE id = $2 RETURNING id, monitored, title, album_id",
    [parsed.data.monitored, id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Track not found" });
  }

  const track = result.rows[0] as {
    id: number;
    monitored: boolean;
    title: string;
    album_id: number;
  };

  if (track.monitored) {
    const albumResult = await pool.query(
      "SELECT title, artist_id FROM albums WHERE id = $1",
      [track.album_id]
    );
    const albumTitle = albumResult.rows[0]?.title ?? "Singles";
    const artistId = albumResult.rows[0]?.artist_id as number | undefined;
    const artistResult = artistId
      ? await pool.query("SELECT name FROM artists WHERE id = $1", [artistId])
      : { rows: [] };
    const prefsResult = artistId
      ? await pool.query("SELECT quality FROM artist_preferences WHERE artist_id = $1", [artistId])
      : { rows: [] };
    const quality = prefsResult.rows[0]?.quality ?? "1080p";
    const artistName = artistResult.rows[0]?.name ?? "Unknown Artist";
    const query = `${artistName} - ${track.title}`;

    const jobResult = await pool.query(
      "INSERT INTO download_jobs (status, source, query, quality, progress_percent, track_id, album_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      ["queued", "monitor", query, quality, 0, track.id, track.album_id]
    );
    await pool.query(
      "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
      ["download_queued", `Queued download: ${query}`, { downloadJobId: jobResult.rows[0].id }]
    );
    await downloadQueue.add("download-check", {
      downloadJobId: jobResult.rows[0].id,
      query,
      source: "monitor",
      quality,
      artistName,
      albumTitle,
      trackId: track.id,
      trackTitle: track.title,
      artistId: artistId ?? null
    });
  }

  res.json({ id: track.id, monitored: track.monitored });
});

export default router;
