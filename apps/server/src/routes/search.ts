import { Router } from "express";
import pool from "../db/pool.js";
import { searchArtists } from "../services/audiodb.js";
// Last.fm search disabled; AudioDB only for now

const router = Router();


router.get("/artists", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : "";
  if (!query.trim()) {
    return res.json([]);
  }
  try {
    // Search local database first for instant results with fuzzy matching
    const localResults = await pool.query(
      `SELECT id, name, image_url as thumb, external_id as audiodb_id, 'local' as source
       FROM artists
       WHERE LOWER(name) LIKE LOWER($1)
       ORDER BY 
         CASE 
           WHEN LOWER(name) = LOWER($2) THEN 1
           WHEN LOWER(name) LIKE LOWER($3) THEN 2
           ELSE 3
         END,
         name ASC
       LIMIT 5`,
      [`%${query}%`, query, `${query}%`]
    );
    
    const audiodbResults = await searchArtists(query);
    
    // Filter out AudioDB results that are already in local DB
    const localAudiodbIds = new Set(
      localResults.rows
        .map((row: { audiodb_id: string | null }) => row.audiodb_id)
        .filter((id): id is string => Boolean(id))
    );
    
    const localArtistNames = new Set(
      localResults.rows.map((row: { name: string }) => row.name.toLowerCase())
    );
    
    const uniqueAudiodbResults = audiodbResults
      .filter((artist) => !localAudiodbIds.has(artist.id))
      .map((artist) => ({
        ...artist,
        source: "theaudiodb",
        thumb: artist.thumb
      }));
    
    // Add Last.fm results that aren't in local DB or AudioDB results
    // Combine results: local first (for speed), then AudioDB, then Last.fm (sorted by popularity)
    const combined = [
      ...localResults.rows.map((row: { id: number; name: string; thumb: string | null; source: string }) => ({
        id: String(row.id),
        name: row.name,
        thumb: row.thumb,
        genre: null,
        style: null,
        source: row.source,
        listeners: null
      })),
      ...uniqueAudiodbResults.map((artist) => ({ ...artist, listeners: null }))
    ];

    const seenIds = new Set<string>();
    const deduped = combined.filter((result) => {
      if (seenIds.has(result.id)) {
        return false;
      }
      seenIds.add(result.id);
      return true;
    });
    
    res.json(deduped);
  } catch (error) {
    res.status(502).json({ error: "Search failed" });
  }
});

export default router;
