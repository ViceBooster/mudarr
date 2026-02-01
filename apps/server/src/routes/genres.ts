import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";
import { searchArtistExact } from "../services/audiodb.js";
import { addArtistGenres, importArtistFromAudioDb } from "../services/artistImport.js";
import { getTopArtistsByTag, getTopTags } from "../services/lastfm.js";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, name, import_source, import_limit, import_mode, import_quality, import_auto_download, import_enabled, imported_at, created_at, updated_at FROM genres ORDER BY name ASC"
  );
  res.json(result.rows);
});

router.get("/tags", async (req, res) => {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(1000).default(250)
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const tags = await getTopTags(parsed.data.limit);
    res.json({ tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch tags";
    res.status(502).json({ error: message });
  }
});

const createSchema = z.object({
  name: z.string().min(1)
});

const importSchema = z.object({
  source: z.enum(["lastfm"]).optional(),
  genre: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  importMode: z.enum(["discography", "new", "custom"]).optional(),
  quality: z
    .enum(["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p", "4320p"])
    .optional(),
  autoDownload: z.boolean().optional(),
  enabled: z.boolean().optional(),
  async: z.boolean().optional()
});

const importSettingsSchema = z.object({
  source: z.enum(["lastfm"]),
  limit: z.number().int().min(1).max(200),
  importMode: z.enum(["discography", "new", "custom"]),
  quality: z.enum(["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p", "4320p"]),
  autoDownload: z.boolean(),
  enabled: z.boolean()
});

const normalizeGenreName = (value: string) => value.replace(/\s+/g, " ").trim();

const buildArtistNames = async (source: "lastfm", genre: string, limit: number) => {
  let topArtists: Array<{ name: string | undefined }> = [];
  if (source === "lastfm") {
    topArtists = await getTopArtistsByTag(genre, limit);
  }
  const seen = new Set<string>();
  const artistNames: string[] = [];
  for (const artist of topArtists) {
    const name = artist.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    artistNames.push(name);
  }
  return artistNames.slice(0, limit);
};

const updateGenreImportTimestamp = async (genreId?: number | null) => {
  if (!genreId) return;
  await pool.query("UPDATE genres SET imported_at = NOW(), updated_at = NOW() WHERE id = $1", [
    genreId
  ]);
};

const updateImportJobProgress = async (
  jobId: string,
  data: {
    processed: number;
    imported: number;
    skipped: number;
    errors: number;
    errorSamples?: Array<{ name: string; message: string }>;
  }
) => {
  const errorSamplesJson = data.errorSamples ? JSON.stringify(data.errorSamples) : null;
  await pool.query(
    "UPDATE genre_import_jobs SET processed = $1, imported = $2, skipped = $3, errors = $4, error_samples = $5, updated_at = NOW() WHERE id = $6",
    [data.processed, data.imported, data.skipped, data.errors, errorSamplesJson, jobId]
  );
};

const runGenreImport = async (params: {
  jobId?: string;
  genreId?: number;
  genreName: string;
  source: "lastfm";
  limit: number;
  importMode: "discography" | "new" | "custom";
  quality: "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "4320p";
  autoDownload: boolean;
  artistNames: string[];
}) => {
  const { jobId, genreId, genreName, source, limit, importMode, quality, autoDownload } = params;
  const artistNames = params.artistNames;
  const concurrency = Math.max(1, Number(process.env.GENRE_IMPORT_CONCURRENCY ?? 3));
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ name: string; message: string }> = [];
  let processed = 0;
  const total = artistNames.length;
  let lastProgressUpdate = 0;
  let progressQueue = Promise.resolve();

  console.log("Genre import started", {
    jobId,
    genre: genreName,
    source,
    total,
    importMode,
    quality,
    autoDownload
  });

  const queueProgressUpdate = (force = false) => {
    if (!jobId) return;
    const now = Date.now();
    if (!force && now - lastProgressUpdate < 1500 && processed % 5 !== 0 && processed !== total) {
      return;
    }
    lastProgressUpdate = now;
    const payload = {
      processed,
      imported,
      skipped,
      errors,
      errorSamples: errorDetails.slice(0, 10)
    };
    progressQueue = progressQueue
      .then(() => updateImportJobProgress(jobId, payload))
      .catch(() => undefined);
  };

  let cursor = 0;
  const runNext = async () => {
    while (cursor < artistNames.length) {
      const name = artistNames[cursor];
      cursor += 1;
      try {
        const matches = await searchArtistExact(name);
        const match = matches[0];
        if (!match) {
          skipped += 1;
          continue;
        }
        const result = await importArtistFromAudioDb({
          audiodbId: match.id,
          importMode,
          quality,
          autoDownload
        });
        if (!result) {
          skipped += 1;
          continue;
        }
        await addArtistGenres(pool, result.artist.id, [genreName]);
        imported += 1;
      } catch (error) {
        errors += 1;
        const message = error instanceof Error ? error.message : "Unknown error";
        errorDetails.push({ name, message });
        console.error("Genre import failed", { genre: genreName, artist: name, error });
      } finally {
        processed += 1;
        queueProgressUpdate();
        if (processed % 5 === 0 || processed === total) {
          console.log("Genre import progress", {
            jobId,
            genre: genreName,
            processed,
            total,
            imported,
            skipped,
            errors
          });
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => runNext()));
  queueProgressUpdate(true);
  await progressQueue;

  await updateGenreImportTimestamp(genreId);

  await pool.query("INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)", [
    "genre_import",
    `Imported ${imported} artists for ${genreName}`,
    {
      genre: genreName,
      source,
      requested: limit,
      processed: artistNames.length,
      imported,
      skipped,
      errors,
      errorSamples: errorDetails.slice(0, 10)
    }
  ]);

  console.log("Genre import completed", {
    jobId,
    genre: genreName,
    processed: artistNames.length,
    imported,
    skipped,
    errors
  });

  return {
    imported,
    skipped,
    errors,
    processed: artistNames.length,
    errorSamples: errorDetails.slice(0, 10)
  };
};

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await pool.query(
      "INSERT INTO genres (name) VALUES ($1) RETURNING id, name, created_at",
      [parsed.data.name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to create genre" });
  }
});

router.post("/import", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    source = "lastfm",
    genre,
    limit = 50,
    importMode = "new",
    quality = "1080p",
    autoDownload = false,
    enabled = true,
    async: asyncImport = false
  } = parsed.data;
  const normalizedGenre = normalizeGenreName(genre);
  if (!normalizedGenre) {
    return res.status(400).json({ error: "Genre is required" });
  }

  const genreResult = await pool.query(
    "INSERT INTO genres (name, import_source, import_limit, import_mode, import_quality, import_auto_download, import_enabled, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (name) DO UPDATE SET import_source = $2, import_limit = $3, import_mode = $4, import_quality = $5, import_auto_download = $6, import_enabled = $7, updated_at = NOW() RETURNING id, name",
    [normalizedGenre, source, limit, importMode, quality, autoDownload, enabled]
  );
  const genreId = genreResult.rows[0]?.id as number | undefined;

  let artistNames: string[] = [];
  try {
    artistNames = await buildArtistNames(source, normalizedGenre, limit);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch genre artists";
    return res.status(502).json({ error: message });
  }

  if (asyncImport) {
    const jobId = randomUUID();
    await pool.query(
      "INSERT INTO genre_import_jobs (id, genre_id, genre_name, source, import_limit, import_mode, import_quality, auto_download, enabled, status, total, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())",
      [
        jobId,
        genreId ?? null,
        normalizedGenre,
        source,
        limit,
        importMode,
        quality,
        autoDownload,
        enabled,
        "queued",
        artistNames.length
      ]
    );

    res.status(202).json({ status: "queued", jobId, total: artistNames.length });

    void (async () => {
      try {
        await pool.query(
          "UPDATE genre_import_jobs SET status = $1, started_at = NOW(), total = $2, updated_at = NOW() WHERE id = $3",
          ["running", artistNames.length, jobId]
        );
        const result = await runGenreImport({
          jobId,
          genreId,
          genreName: normalizedGenre,
          source,
          limit,
          importMode,
          quality,
          autoDownload,
          artistNames
        });
        const errorSamplesJson = result.errorSamples ? JSON.stringify(result.errorSamples) : null;
        await pool.query(
          "UPDATE genre_import_jobs SET status = $1, finished_at = NOW(), processed = $2, imported = $3, skipped = $4, errors = $5, error_samples = $6, updated_at = NOW() WHERE id = $7",
          [
            "completed",
            result.processed,
            result.imported,
            result.skipped,
            result.errors,
            errorSamplesJson,
            jobId
          ]
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const errorSamplesJson = JSON.stringify([{ name: normalizedGenre, message }]);
        await pool.query(
          "UPDATE genre_import_jobs SET status = $1, finished_at = NOW(), errors = errors + 1, error_samples = $2, updated_at = NOW() WHERE id = $3",
          ["failed", errorSamplesJson, jobId]
        );
        console.error("Genre import job failed", { jobId, genre: normalizedGenre, error });
      }
    })();
    return;
  }

  const result = await runGenreImport({
    genreId,
    genreName: normalizedGenre,
    source,
    limit,
    importMode,
    quality,
    autoDownload,
    artistNames
  });

  res.json({
    status: "ok",
    genre: normalizedGenre,
    genreId: genreId ?? null,
    requested: limit,
    processed: result.processed,
    imported: result.imported,
    skipped: result.skipped,
    errors: result.errors,
    errorSamples: result.errorSamples ?? []
  });
});

router.get("/import/jobs/:id", async (req, res) => {
  const id = req.params.id;
  const result = await pool.query(
    "SELECT id, genre_id, genre_name, source, import_limit AS limit, import_mode, import_quality, auto_download, enabled, status, processed, total, imported, skipped, errors, error_samples, started_at, finished_at, created_at, updated_at FROM genre_import_jobs WHERE id = $1",
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Import job not found" });
  }
  res.json(result.rows[0]);
});

router.put("/:id/import", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid genre id" });
  }
  const parsed = importSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { source, limit, importMode, quality, autoDownload, enabled } = parsed.data;

  const result = await pool.query(
    "UPDATE genres SET import_source = $1, import_limit = $2, import_mode = $3, import_quality = $4, import_auto_download = $5, import_enabled = $6, updated_at = NOW() WHERE id = $7 RETURNING id, name, import_source, import_limit, import_mode, import_quality, import_auto_download, import_enabled, imported_at, created_at, updated_at",
    [source, limit, importMode, quality, autoDownload, enabled, id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Genre not found" });
  }
  res.json(result.rows[0]);
});

router.delete("/:id/import", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid genre id" });
  }
  const result = await pool.query(
    "UPDATE genres SET import_source = NULL, import_limit = NULL, import_mode = NULL, import_quality = NULL, import_auto_download = NULL, import_enabled = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, import_source, import_limit, import_mode, import_quality, import_auto_download, import_enabled, imported_at, created_at, updated_at",
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Genre not found" });
  }
  res.json(result.rows[0]);
});

router.delete(":id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid genre id" });
  }
  await pool.query("DELETE FROM genres WHERE id = $1", [id]);
  res.status(204).send();
});

export default router;
