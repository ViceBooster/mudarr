import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import pool from "../db/pool.js";
import { getAlbums, getArtist, getTracks, searchArtists } from "../services/audiodb.js";
import {
  extractGenreNames,
  queueArtistImport,
  importArtistFromAudioDb,
  replaceArtistGenres
} from "../services/artistImport.js";
import downloadQueue from "../queue/downloadQueue.js";

const router = Router();

const resolveLatestAlbumIds = (albums: Array<{ id: string; year: number | null }>) => {
  const years = albums.map((album) => album.year).filter((year): year is number => year !== null);
  if (years.length === 0) {
    return new Set(albums[0] ? [albums[0].id] : []);
  }
  const latestYear = Math.max(...years);
  return new Set(albums.filter((album) => album.year === latestYear).map((album) => album.id));
};

router.get("/", async (_req, res) => {
  const result = await pool.query(
    `SELECT a.id, a.name, a.image_url, a.created_at,
      COALESCE(stats.has_downloads, false) AS has_downloads,
      COALESCE(stats.monitored_count, 0) AS monitored_count,
      COALESCE(stats.downloaded_count, 0) AS downloaded_count,
      COALESCE(genres.genres, '[]'::jsonb) AS genres
     FROM artists a
     LEFT JOIN LATERAL (
       SELECT
         COUNT(DISTINCT t.id) FILTER (WHERE t.monitored)::int AS monitored_count,
         COUNT(DISTINCT t.id) FILTER (WHERE t.monitored AND v.id IS NOT NULL)::int AS downloaded_count,
         (COUNT(DISTINCT t.id) FILTER (WHERE v.id IS NOT NULL) > 0) AS has_downloads
       FROM albums al
       LEFT JOIN tracks t ON t.album_id = al.id
       LEFT JOIN videos v ON v.track_id = t.id AND v.status = 'completed'
       WHERE al.artist_id = a.id
     ) stats ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('id', g.id, 'name', g.name))
           FILTER (WHERE g.id IS NOT NULL),
         '[]'::jsonb
       ) AS genres
       FROM artist_genres ag
       LEFT JOIN genres g ON g.id = ag.genre_id
       WHERE ag.artist_id = a.id
     ) genres ON true
     ORDER BY a.name ASC`
  );
  res.json(result.rows);
});

const createSchema = z.object({
  name: z.string().min(1),
  genreIds: z.array(z.number().int()).optional()
});

const importSchema = z.object({
  audiodbId: z.string().min(1),
  artistName: z.string().optional(),
  importMode: z.enum(["discography", "new", "custom"]).optional(),
  quality: z.enum(["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p", "4320p"]).optional(),
  autoDownload: z.boolean().optional()
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, genreIds } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      "INSERT INTO artists (name) VALUES ($1) RETURNING id, name, created_at",
      [name]
    );
    const artist = insert.rows[0];

    if (genreIds && genreIds.length > 0) {
      for (const genreId of genreIds) {
        await client.query(
          "INSERT INTO artist_genres (artist_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [artist.id, genreId]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json(artist);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to create artist" });
  } finally {
    client.release();
  }
});

router.post("/import", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    audiodbId,
    artistName,
    importMode = "discography",
    quality = "1080p",
    autoDownload = true
  } =
    parsed.data;

  try {
    // Try the new background import system
    const result = await queueArtistImport({
      audiodbId,
      artistName,
      importMode,
      quality,
      autoDownload
    });
    if (!result) {
      return res.status(404).json({ error: "Artist not found in AudioDB" });
    }
    res.status(202).json({ 
      jobId: result.jobId, 
      artistName: result.artistName,
      message: "Import started in background"
    });
  } catch (error) {
    // If artist_import_jobs table doesn't exist (migration not run), fall back to synchronous import
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
      console.log("Artist import jobs table not found, using synchronous import");
      try {
        const result = await importArtistFromAudioDb({
          audiodbId,
          artistName,
          importMode,
          quality,
          autoDownload
        });
        if (!result) {
          return res.status(404).json({ error: "Artist not found in AudioDB" });
        }
        return res.status(201).json(result.artist);
      } catch (syncError) {
        console.error("Synchronous import failed:", syncError);
        return res.status(500).json({ error: "Failed to import artist" });
      }
    }
    console.error("Failed to queue artist import:", error);
    res.status(500).json({ error: "Failed to queue artist import" });
  }
});

// Get active artist import jobs
router.get("/imports/active", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, audiodb_id, artist_name, status, progress_stage, progress_detail, error_message, created_at, started_at
       FROM artist_import_jobs
       WHERE status IN ('pending', 'processing')
       ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    // If table doesn't exist yet, return empty array
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
      return res.json([]);
    }
    console.error("Failed to fetch import jobs:", error);
    res.status(500).json({ error: "Failed to fetch import jobs" });
  }
});

// Get specific import job status
router.get("/imports/:jobId", async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (Number.isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job ID" });
  }

  try {
    const result = await pool.query(
      `SELECT id, audiodb_id, artist_name, artist_id, status, progress_stage, progress_detail, error_message, created_at, started_at, completed_at
       FROM artist_import_jobs
       WHERE id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Import job not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch import job" });
  }
});

router.post("/imports/:jobId/cancel", async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (Number.isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job ID" });
  }
  try {
    const result = await pool.query(
      `UPDATE artist_import_jobs
       SET status = 'cancelled', error_message = COALESCE(error_message, 'Cancelled'), completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'processing')
       RETURNING id, status`,
      [jobId]
    );
    if (result.rows.length > 0) {
      return res.json(result.rows[0]);
    }
    const exists = await pool.query("SELECT status FROM artist_import_jobs WHERE id = $1", [
      jobId
    ]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: "Import job not found" });
    }
    return res.status(409).json({ error: "Import job cannot be cancelled" });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel import job" });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }

  const artistResult = await pool.query(
    `SELECT a.id, a.name, a.image_url, a.created_at,
      COALESCE(
        json_agg(json_build_object('id', g.id, 'name', g.name))
        FILTER (WHERE g.id IS NOT NULL),
        '[]'
      ) AS genres
     FROM artists a
     LEFT JOIN artist_genres ag ON ag.artist_id = a.id
     LEFT JOIN genres g ON g.id = ag.genre_id
     WHERE a.id = $1
     GROUP BY a.id`,
    [id]
  );
  if (artistResult.rows.length === 0) {
    return res.status(404).json({ error: "Artist not found" });
  }

  const albumsResult = await pool.query(
    "SELECT id, title, year, monitored, created_at FROM albums WHERE artist_id = $1 ORDER BY year DESC NULLS LAST, title ASC",
    [id]
  );
  const albumIds = albumsResult.rows.map((album) => album.id) as number[];
  const tracksResult =
    albumIds.length === 0
      ? { rows: [] }
      : await pool.query(
          "SELECT t.id, t.album_id, t.title, t.track_no, t.monitored, CASE WHEN v.id IS NULL THEN FALSE ELSE TRUE END AS downloaded, dj.status AS download_status, dj.progress_percent, dj.error AS download_error FROM tracks t LEFT JOIN videos v ON v.track_id = t.id AND v.status = 'completed' LEFT JOIN LATERAL (SELECT status, progress_percent, error FROM download_jobs WHERE track_id = t.id ORDER BY created_at DESC LIMIT 1) dj ON true WHERE t.album_id = ANY($1::int[]) ORDER BY t.track_no ASC NULLS LAST, t.title ASC",
          [albumIds]
        );

  const tracksByAlbum = new Map<number, typeof tracksResult.rows>();
  for (const track of tracksResult.rows as Array<{
    id: number;
    album_id: number;
    title: string;
    track_no: number | null;
    monitored: boolean;
    downloaded: boolean;
    download_status: string | null;
    progress_percent: number | null;
    download_error: string | null;
  }>) {
    const list = tracksByAlbum.get(track.album_id) ?? [];
    list.push(track);
    tracksByAlbum.set(track.album_id, list);
  }

  const albums = albumsResult.rows.map((album: { id: number }) => ({
    ...album,
    tracks: tracksByAlbum.get(album.id) ?? []
  }));

  res.json({
    artist: artistResult.rows[0],
    albums
  });
});

router.post("/:id/resync", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }

  const artistResult = await pool.query(
    "SELECT id, name, external_source, external_id, image_url FROM artists WHERE id = $1",
    [id]
  );
  if (artistResult.rows.length === 0) {
    return res.status(404).json({ error: "Artist not found" });
  }

  const artistRow = artistResult.rows[0] as {
    id: number;
    name: string;
    external_source: string | null;
    external_id: string | null;
    image_url: string | null;
  };

  let audiodbId = artistRow.external_source === "theaudiodb" ? artistRow.external_id : null;
  if (!audiodbId) {
    const matches = await searchArtists(artistRow.name);
    audiodbId = matches[0]?.id ?? null;
  }

  if (!audiodbId) {
    return res.status(404).json({ error: "Artist not found in AudioDB" });
  }

  const artistData = await getArtist(audiodbId);
  if (!artistData) {
    return res.status(404).json({ error: "Artist not found in AudioDB" });
  }

  const prefsResult = await pool.query(
    "SELECT import_mode FROM artist_preferences WHERE artist_id = $1",
    [artistRow.id]
  );
  const importMode =
    prefsResult.rows.length === 0 ? "discography" : prefsResult.rows[0].import_mode;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const genreNames = extractGenreNames(artistData);
    await replaceArtistGenres(client, artistRow.id, genreNames);

    await client.query(
      "UPDATE artists SET external_source = $1, external_id = $2, image_url = COALESCE(image_url, $3) WHERE id = $4",
      ["theaudiodb", audiodbId, artistData.thumb ?? null, artistRow.id]
    );

    const albums = await getAlbums(audiodbId, artistData.name);
    const latestAlbumIds = resolveLatestAlbumIds(albums);
    for (const album of albums) {
      const shouldMonitor =
        importMode === "discography" || (importMode === "new" && latestAlbumIds.has(album.id));
      let resolvedAlbumId: number | null = null;
      const existingByTitle = await client.query(
        "SELECT id FROM albums WHERE artist_id = $1 AND lower(title) = lower($2) AND ($3::int IS NULL OR year = $3) LIMIT 1",
        [artistRow.id, album.title, album.year]
      );
      if (existingByTitle.rows.length > 0) {
        resolvedAlbumId = existingByTitle.rows[0].id as number;
        await client.query(
          "UPDATE albums SET external_source = $1, external_id = $2, year = COALESCE($3, year), monitored = albums.monitored WHERE id = $4",
          [album.source, album.id, album.year, resolvedAlbumId]
        );
      } else {
        const albumResult = await client.query(
          "INSERT INTO albums (artist_id, title, year, external_source, external_id, monitored) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (external_source, external_id) DO UPDATE SET title = EXCLUDED.title, year = EXCLUDED.year, artist_id = EXCLUDED.artist_id, monitored = albums.monitored RETURNING id",
          [artistRow.id, album.title, album.year, album.source, album.id, shouldMonitor]
        );
        resolvedAlbumId = albumResult.rows[0].id as number;
      }

      if (album.canFetchTracks && resolvedAlbumId) {
        const tracks = await getTracks(album.id);
        for (const track of tracks) {
          const trackTitle = track.title?.trim();
          if (!trackTitle) continue;
          await client.query(
            "INSERT INTO tracks (album_id, title, track_no, external_source, external_id, monitored) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (external_source, external_id) DO UPDATE SET title = EXCLUDED.title, track_no = EXCLUDED.track_no, album_id = EXCLUDED.album_id, monitored = tracks.monitored",
            [resolvedAlbumId, trackTitle, track.trackNo, album.source, track.id, shouldMonitor]
          );
        }
      }
    }

    await client.query(
      "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
      ["audiodb_resync", `Resynced ${artistRow.name} from AudioDB`, { artistId: artistRow.id }]
    );

    await client.query("COMMIT");
    res.json({ status: "resynced" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to resync artist" });
  } finally {
    client.release();
  }
});

router.get("/:id/preferences", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }

  const result = await pool.query(
    "SELECT import_mode, quality, auto_download FROM artist_preferences WHERE artist_id = $1",
    [id]
  );
  if (result.rows.length === 0) {
    return res.json({ import_mode: "discography", quality: "1080p", auto_download: true });
  }
  res.json(result.rows[0]);
});

router.put("/:id/preferences", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }

  const parsed = z
    .object({
      importMode: z.enum(["discography", "new", "custom"]),
      quality: z.enum(["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p", "4320p"]),
      autoDownload: z.boolean()
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  await pool.query(
    "INSERT INTO artist_preferences (artist_id, import_mode, quality, auto_download, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (artist_id) DO UPDATE SET import_mode = $2, quality = $3, auto_download = $4, updated_at = NOW()",
    [id, parsed.data.importMode, parsed.data.quality, parsed.data.autoDownload]
  );

  res.json({ status: "saved" });
});

router.patch("/:id/albums/monitor", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }

  const parsed = z
    .object({
      albumIds: z.array(z.number().int()).min(1),
      monitored: z.boolean()
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  await pool.query(
    "UPDATE albums SET monitored = $1 WHERE artist_id = $2 AND id = ANY($3::int[])",
    [parsed.data.monitored, id, parsed.data.albumIds]
  );
  await pool.query(
    "UPDATE tracks SET monitored = $1 WHERE album_id = ANY($2::int[])",
    [parsed.data.monitored, parsed.data.albumIds]
  );

  if (parsed.data.monitored) {
    const artistResult = await pool.query("SELECT name FROM artists WHERE id = $1", [id]);
    const prefsResult = await pool.query(
      "SELECT quality FROM artist_preferences WHERE artist_id = $1",
      [id]
    );
    const quality = prefsResult.rows[0]?.quality ?? "1080p";
    const artistName = artistResult.rows[0]?.name ?? "Unknown Artist";
    const tracksResult = await pool.query(
      "SELECT t.id, t.album_id, t.title, a.title AS album_title FROM tracks t JOIN albums a ON a.id = t.album_id WHERE t.album_id = ANY($1::int[]) ORDER BY t.track_no ASC NULLS LAST, t.title ASC",
      [parsed.data.albumIds]
    );

    for (const row of tracksResult.rows as Array<{
      id: number;
      album_id: number;
      title: string;
      album_title: string;
    }>) {
      const query = `${artistName} - ${row.title}`;
      const jobResult = await pool.query(
        "INSERT INTO download_jobs (status, source, query, quality, progress_percent, track_id, album_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        ["queued", "monitor", query, quality, 0, row.id, row.album_id]
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
        albumTitle: row.album_title
      });
    }
  }

  res.json({ status: "updated" });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid artist id" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Get artist name for folder deletion
    const artistResult = await client.query(
      "SELECT name FROM artists WHERE id = $1",
      [id]
    );
    const artistName = artistResult.rows[0]?.name as string | undefined;
    
    const mediaResult = await client.query(
      `SELECT v.id AS video_id, v.file_path
       FROM videos v
       JOIN tracks t ON t.id = v.track_id
       JOIN albums a ON a.id = t.album_id
       WHERE a.artist_id = $1`,
      [id]
    );
    const filePaths = mediaResult.rows
      .map((row: { file_path: string | null }) => row.file_path)
      .filter((value): value is string => Boolean(value));

    if (mediaResult.rows.length > 0) {
      const videoIds = mediaResult.rows.map((row: { video_id: number }) => row.video_id);
      await client.query("DELETE FROM videos WHERE id = ANY($1::int[])", [videoIds]);
    }

    await client.query(
      `DELETE FROM download_jobs
       WHERE track_id IN (
         SELECT t.id
         FROM tracks t
         JOIN albums a ON a.id = t.album_id
         WHERE a.artist_id = $1
       )
       OR album_id IN (
         SELECT id FROM albums WHERE artist_id = $1
       )`,
      [id]
    );

    await client.query("DELETE FROM artists WHERE id = $1", [id]);
    await client.query("COMMIT");

    // Delete individual files
    await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch {
          // ignore missing/unreadable files
        }
      })
    );
    
    // Delete artist folder if it exists
    if (artistName && filePaths.length > 0) {
      try {
        // Get the artist folder path from the first file path
        // File paths are typically: /path/to/music/Artist Name/Album Name/track.mp4
        const firstFilePath = filePaths[0];
        const artistFolderPath = path.dirname(path.dirname(firstFilePath));
        const folderBasename = path.basename(artistFolderPath);
        
        // Verify the folder name matches the artist name (safety check)
        if (folderBasename === artistName) {
          await fs.rm(artistFolderPath, { recursive: true, force: true });
          console.log(`Deleted artist folder: ${artistFolderPath}`);
        }
      } catch (err) {
        console.error(`Failed to delete artist folder for "${artistName}":`, err);
        // Don't fail the request if folder deletion fails
      }
    }

    res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to delete artist" });
  } finally {
    client.release();
  }
});

export default router;
