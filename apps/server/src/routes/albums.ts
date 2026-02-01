import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";
import downloadQueue from "../queue/downloadQueue.js";

const router = Router();

const updateSchema = z.object({
  monitored: z.boolean()
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid album id" });
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await pool.query(
    "UPDATE albums SET monitored = $1 WHERE id = $2 RETURNING id, monitored, artist_id, title",
    [parsed.data.monitored, id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Album not found" });
  }

  const album = result.rows[0] as {
    id: number;
    monitored: boolean;
    artist_id: number;
    title: string;
  };

  await pool.query("UPDATE tracks SET monitored = $1 WHERE album_id = $2", [
    album.monitored,
    album.id
  ]);

  if (album.monitored) {
    const artistResult = await pool.query("SELECT name FROM artists WHERE id = $1", [
      album.artist_id
    ]);
    const prefsResult = await pool.query(
      "SELECT quality FROM artist_preferences WHERE artist_id = $1",
      [album.artist_id]
    );
    const quality = prefsResult.rows[0]?.quality ?? "1080p";
    const artistName = artistResult.rows[0]?.name ?? "Unknown Artist";
    const tracksResult = await pool.query(
      "SELECT id, title FROM tracks WHERE album_id = $1 ORDER BY track_no ASC NULLS LAST, title ASC",
      [album.id]
    );

    for (const track of tracksResult.rows as Array<{ id: number; title: string }>) {
      const query = `${artistName} - ${track.title}`;
      const jobResult = await pool.query(
        "INSERT INTO download_jobs (status, source, query, quality, progress_percent, track_id, album_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        ["queued", "monitor", query, quality, 0, track.id, album.id]
      );
      await pool.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        ["download_queued", `Queued download: ${query}`, { downloadJobId: jobResult.rows[0].id }]
      );
      await downloadQueue.add("download", {
        downloadJobId: jobResult.rows[0].id,
        query,
        source: "monitor",
        quality,
        artistName,
        albumTitle: album.title
      });
    }
  }

  res.json({ id: album.id, monitored: album.monitored });
});

export default router;
