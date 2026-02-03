import type { Pool, PoolClient } from "pg";
import pool from "../db/pool.js";
import downloadQueue from "../queue/downloadQueue.js";
import { getAlbums, getArtist, getTracks, searchArtistExact } from "./audiodb.js";
import {
  getAlbumInfo as getLastfmAlbumInfo,
  getArtistInfo as getLastfmArtistInfo,
  getTopAlbums as getLastfmTopAlbums,
  hasLastfmKey
} from "./lastfm.js";

export type ArtistImportOptions = {
  audiodbId: string;
  artistName?: string | null;
  importMode: "discography" | "new" | "custom";
  quality: "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "4320p";
  autoDownload: boolean;
};

type AudioDbGenreSource = {
  genre: string | null;
  style: string | null;
};

type AudioDbAlbum = {
  id: string;
  title: string;
  year: number | null;
  source: string;
  canFetchTracks: boolean;
};

type AudioDbTrack = {
  id: string;
  title: string | null;
  trackNo: number | null;
};

type ImportArtistData = AudioDbGenreSource & {
  id: string;
  name: string;
  thumb: string | null;
  source: "theaudiodb" | "lastfm";
  tags?: string[];
};

type ImportData = {
  artistData: ImportArtistData;
  albums: AudioDbAlbum[];
  tracksByAlbumId: Map<string, AudioDbTrack[]>;
};

type DbQuery = Pool["query"] | PoolClient["query"];
type DbClient = { query: DbQuery };

type ArtistImportJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

const isImportCancelled = async (db: DbClient, jobId: number) => {
  const result = await db.query("SELECT status FROM artist_import_jobs WHERE id = $1", [jobId]);
  return result.rows[0]?.status === "cancelled";
};

const resolveArtistImportConcurrency = () => {
  const raw = Number(process.env.ARTIST_IMPORT_CONCURRENCY ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.floor(raw));
};

const createConcurrencyLimiter = (limit: number) => {
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = async () => {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
  };

  const release = () => {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    next?.();
  };

  return async <T>(fn: () => Promise<T>) => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
};

const importLimiter = createConcurrencyLimiter(resolveArtistImportConcurrency());
const activeImportJobs = new Set<number>();

const resolveLatestAlbumIds = (albums: Array<{ id: string; year: number | null }>) => {
  const years = albums.map((album) => album.year).filter((year): year is number => year !== null);
  if (years.length === 0) {
    return new Set(albums[0] ? [albums[0].id] : []);
  }
  const latestYear = Math.max(...years);
  return new Set(albums.filter((album) => album.year === latestYear).map((album) => album.id));
};

const normalizeGenreNames = (names: string[]) => {
  const seen = new Map<string, string>();
  for (const name of names) {
    const normalized = name.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return [...seen.values()];
};

const dedupeTracksByExternalId = <T extends { externalId: string }>(tracks: T[]) => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const track of tracks) {
    if (!track.externalId) {
      continue;
    }
    if (seen.has(track.externalId)) {
      continue;
    }
    seen.add(track.externalId);
    deduped.push(track);
  }
  return deduped;
};

const upsertTracksBulk = async (db: DbClient, params: {
  albumId: number;
  trackSource: string | null;
  shouldMonitor: boolean;
  tracks: Array<{ externalId: string; title: string; trackNo: number | null }>;
}) => {
  const normalizedTracks = dedupeTracksByExternalId(
    params.tracks
      .map((track) => ({
        externalId: track.externalId,
        title: track.title.trim(),
        trackNo: track.trackNo ?? null
      }))
      .filter((track) => track.externalId && track.title.length > 0)
  );
  if (normalizedTracks.length === 0) {
    return [] as Array<{ id: number; external_id: string }>;
  }

  const albumIds = normalizedTracks.map(() => params.albumId);
  const titles = normalizedTracks.map((t) => t.title);
  const trackNos = normalizedTracks.map((t) => t.trackNo);
  const sources = normalizedTracks.map(() => params.trackSource);
  const externalIds = normalizedTracks.map((t) => t.externalId);
  const monitored = normalizedTracks.map(() => params.shouldMonitor);

  const result = await db.query(
    `INSERT INTO tracks (album_id, title, track_no, external_source, external_id, monitored)
     SELECT * FROM UNNEST(
       $1::int[],
       $2::text[],
       $3::int[],
       $4::text[],
       $5::text[],
       $6::boolean[]
     )
     ON CONFLICT (external_source, external_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       track_no = EXCLUDED.track_no,
       album_id = EXCLUDED.album_id,
       monitored = EXCLUDED.monitored
     RETURNING id, external_id`,
    [albumIds, titles, trackNos, sources, externalIds, monitored]
  );
  return result.rows as Array<{ id: number; external_id: string }>;
};

const splitGenreTokens = (value?: string | null) => {
  if (!value) return [];
  return value
    .split(/[\/,;|]/)
    .map((token) => token.trim())
    .filter(Boolean);
};

const isLastfmId = (value: string) => value.startsWith("lastfm:");

const looksLikeMbid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const buildLastfmAlbumId = (artistName: string, albumTitle: string, mbid?: string | null) =>
  mbid?.trim() || `${slugify(artistName)}:${slugify(albumTitle)}`;

const buildLastfmTrackId = (albumId: string, title: string, mbid?: string | null) =>
  mbid?.trim() || `${albumId}:${slugify(title)}`;

const normalizeArtistName = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const resolveAudiodbThumb = async (artistName: string, audiodbId?: string | null) => {
  if (audiodbId && !isLastfmId(audiodbId)) {
    try {
      const audiodbArtist = await getArtist(audiodbId);
      if (audiodbArtist?.thumb) {
        return audiodbArtist.thumb;
      }
    } catch {
      // ignore and fall back to name search
    }
  }
  try {
    const matches = await searchArtistExact(artistName);
    return matches[0]?.thumb ?? null;
  } catch {
    return null;
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) => {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runNext = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  const concurrency = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: concurrency }, () => runNext()));
  return results;
};

export const extractGenreNames = (artistData: AudioDbGenreSource) => {
  const names = [
    ...splitGenreTokens(artistData.genre),
    ...splitGenreTokens(artistData.style)
  ];
  return normalizeGenreNames(names);
};

const resolveLastfmTarget = (audiodbId: string, artistNameHint?: string | null) => {
  const hint = normalizeArtistName(artistNameHint);
  if (isLastfmId(audiodbId)) {
    const value = audiodbId.slice("lastfm:".length).trim();
    if (!value) {
      return hint ? { name: hint } : null;
    }
    if (looksLikeMbid(value)) {
      return { mbid: value, name: hint ?? null };
    }
    return { name: hint ?? value, mbid: null };
  }
  if (hint) {
    return { name: hint, mbid: null };
  }
  return null;
};

const resolveGenreNamesForArtist = (artistData: ImportArtistData) => {
  if (artistData.source === "lastfm") {
    return normalizeGenreNames(artistData.tags ?? []);
  }
  return extractGenreNames(artistData);
};

const loadAudiodbImportData = async (
  audiodbId: string,
  importMode: "discography" | "new" | "custom"
): Promise<ImportData | null> => {
  const artistData = await getArtist(audiodbId);
  if (!artistData) {
    return null;
  }
  const albums = (await getAlbums(audiodbId, artistData.name, { mode: importMode })) as AudioDbAlbum[];
  const trackFetchConcurrency = Math.max(
    1,
    Math.min(6, Number(process.env.AUDIODB_TRACK_CONCURRENCY ?? 4))
  );
  const trackLists = await mapWithConcurrency(albums, trackFetchConcurrency, async (album) => {
    if (!album.canFetchTracks) {
      return [] as AudioDbTrack[];
    }
    try {
      return (await getTracks(album.id)) as AudioDbTrack[];
    } catch (error) {
      console.warn("Failed to fetch tracks", {
        artist: artistData.name,
        albumId: album.id,
        error: error instanceof Error ? error.message : error
      });
      return [] as AudioDbTrack[];
    }
  });
  const tracksByAlbumId = new Map<string, AudioDbTrack[]>();
  albums.forEach((album, index) => {
    tracksByAlbumId.set(album.id, trackLists[index] ?? []);
  });
  return {
    artistData: {
      ...artistData,
      source: "theaudiodb"
    },
    albums,
    tracksByAlbumId
  };
};

const loadLastfmImportData = async (
  audiodbId: string,
  artistNameHint: string | null | undefined,
  importMode: "discography" | "new" | "custom"
): Promise<ImportData | null> => {
  const target = resolveLastfmTarget(audiodbId, artistNameHint);
  if (!target) {
    return null;
  }
  const artistInfo = await getLastfmArtistInfo({
    name: target.name ?? undefined,
    mbid: target.mbid ?? undefined
  });
  if (!artistInfo || !artistInfo.name) {
    return null;
  }
  let resolvedThumb = artistInfo.thumb ?? null;
  if (!resolvedThumb) {
    resolvedThumb = await resolveAudiodbThumb(artistInfo.name, audiodbId);
  }
  const albumLimit = importMode === "new" ? 6 : 50;
  const rawAlbums = await getLastfmTopAlbums(
    { name: artistInfo.name, mbid: artistInfo.mbid ?? null },
    albumLimit
  );
  if (rawAlbums.length === 0) {
    return null;
  }
  const albumFetchConcurrency = Math.max(
    1,
    Math.min(4, Number(process.env.LASTFM_ALBUM_CONCURRENCY ?? 3))
  );
  const albumInfos = await mapWithConcurrency(rawAlbums, albumFetchConcurrency, async (album) => {
    if (!album.name) {
      return null;
    }
    return getLastfmAlbumInfo({
      artistName: artistInfo.name,
      albumName: album.name,
      mbid: album.mbid ?? null
    });
  });

  const albums: AudioDbAlbum[] = [];
  const tracksByAlbumId = new Map<string, AudioDbTrack[]>();

  rawAlbums.forEach((album, index) => {
    const title = album.name?.trim();
    if (!title) {
      return;
    }
    const albumId = buildLastfmAlbumId(artistInfo.name, title, album.mbid ?? null);
    const albumInfo = albumInfos[index];
    const year = albumInfo?.year ?? null;
    albums.push({
      id: albumId,
      title,
      year,
      source: "lastfm",
      canFetchTracks: true
    });
    const tracks = (albumInfo?.tracks ?? []).map((track) => {
      const trackTitle = track.title?.trim() ?? "";
      return {
        id: buildLastfmTrackId(albumId, trackTitle, track.id ?? null),
        title: trackTitle,
        trackNo: track.trackNo ?? null
      };
    });
    tracksByAlbumId.set(albumId, tracks);
  });

  return {
    artistData: {
      id: artistInfo.mbid || artistInfo.id,
      name: artistInfo.name,
      genre: null,
      style: null,
      thumb: resolvedThumb,
      source: "lastfm",
      tags: artistInfo.tags ?? []
    },
    albums,
    tracksByAlbumId
  };
};

const resolveImportData = async (
  audiodbId: string,
  artistNameHint: string | null | undefined,
  importMode: "discography" | "new" | "custom"
) => {
  const preferLastfm = await hasLastfmKey();
  const lastfmData = preferLastfm
    ? await loadLastfmImportData(audiodbId, artistNameHint, importMode)
    : null;
  const audiodbData = await loadAudiodbImportData(audiodbId, importMode);
  if (audiodbData && lastfmData) {
    return {
      artistData: lastfmData.artistData,
      albums: audiodbData.albums,
      tracksByAlbumId: audiodbData.tracksByAlbumId
    };
  }
  if (audiodbData) {
    return audiodbData;
  }
  if (lastfmData) {
    return lastfmData;
  }
  return null;
};

const resolveArtistPreview = async (
  audiodbId: string,
  artistNameHint: string | null | undefined
): Promise<ImportArtistData | null> => {
  const preferLastfm = await hasLastfmKey();
  if (preferLastfm) {
    const target = resolveLastfmTarget(audiodbId, artistNameHint);
    if (target) {
      const artistInfo = await getLastfmArtistInfo({
        name: target.name ?? undefined,
        mbid: target.mbid ?? undefined
      });
      if (artistInfo && artistInfo.name) {
        let resolvedThumb = artistInfo.thumb ?? null;
        if (!resolvedThumb) {
          resolvedThumb = await resolveAudiodbThumb(artistInfo.name, audiodbId);
        }
        return {
          id: artistInfo.mbid || artistInfo.id,
          name: artistInfo.name,
          genre: null,
          style: null,
          thumb: resolvedThumb,
          source: "lastfm",
          tags: artistInfo.tags ?? []
        };
      }
    }
  }
  const audiodbArtist = await getArtist(audiodbId);
  if (audiodbArtist) {
    return { ...audiodbArtist, source: "theaudiodb" };
  }
  const fallbackTarget = resolveLastfmTarget(audiodbId, artistNameHint);
  if (fallbackTarget) {
    const artistInfo = await getLastfmArtistInfo({
      name: fallbackTarget.name ?? undefined,
      mbid: fallbackTarget.mbid ?? undefined
    });
    if (artistInfo && artistInfo.name) {
      return {
        id: artistInfo.mbid || artistInfo.id,
        name: artistInfo.name,
        genre: null,
        style: null,
        thumb: artistInfo.thumb ?? null,
        source: "lastfm",
        tags: artistInfo.tags ?? []
      };
    }
  }
  return null;
};

const upsertGenreId = async (db: DbClient, name: string) => {
  const result = await db.query(
    "INSERT INTO genres (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [name]
  );
  return result.rows[0]?.id as number | undefined;
};

export const addArtistGenres = async (db: DbClient, artistId: number, genreNames: string[]) => {
  const normalized = normalizeGenreNames(genreNames);
  if (normalized.length === 0) return;
  // Bulk insert missing genres, then bulk link to artist.
  await db.query(
    `INSERT INTO genres (name)
     SELECT DISTINCT UNNEST($1::text[])
     ON CONFLICT (name) DO NOTHING`,
    [normalized]
  );
  await db.query(
    `INSERT INTO artist_genres (artist_id, genre_id)
     SELECT $1, g.id
     FROM genres g
     WHERE g.name = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [artistId, normalized]
  );
};

export const replaceArtistGenres = async (
  db: DbClient,
  artistId: number,
  genreNames: string[]
) => {
  const normalized = normalizeGenreNames(genreNames);
  if (normalized.length === 0) return;
  await db.query("DELETE FROM artist_genres WHERE artist_id = $1", [artistId]);
  await addArtistGenres(db, artistId, normalized);
};

export async function getArtistImportJobStatus(jobId: number): Promise<{
  id: number;
  status: ArtistImportJobStatus;
  artistId: number | null;
  errorMessage: string | null;
}> {
  const result = await pool.query(
    "SELECT id, status, artist_id, error_message FROM artist_import_jobs WHERE id = $1",
    [jobId]
  );
  const row = result.rows[0] as
    | { id: number; status: ArtistImportJobStatus; artist_id: number | null; error_message: string | null }
    | undefined;
  if (!row) {
    return { id: jobId, status: "failed", artistId: null, errorMessage: "Import job not found" };
  }
  return { id: row.id, status: row.status, artistId: row.artist_id ?? null, errorMessage: row.error_message ?? null };
}

export async function waitForArtistImportJob(jobId: number, options?: { pollMs?: number }) {
  const pollMs = Math.max(250, Math.floor(options?.pollMs ?? 2000));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await getArtistImportJobStatus(jobId);
    if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

const enqueueArtistImportProcessing = (jobId: number) => {
  if (activeImportJobs.has(jobId)) {
    return;
  }
  activeImportJobs.add(jobId);
  void importLimiter(async () => {
    try {
      await processArtistImportJob(jobId);
    } finally {
      activeImportJobs.delete(jobId);
    }
  }).catch((error) => {
    activeImportJobs.delete(jobId);
    console.error("Failed to run artist import job", {
      jobId,
      error: error instanceof Error ? error.message : error
    });
  });
};

/**
 * Creates an artist import job that will be processed in the background
 * Returns immediately with the job ID
 */
export async function queueArtistImport(options: ArtistImportOptions) {
  const { audiodbId, artistName, importMode, quality, autoDownload } = options;
  const artistNameHint = normalizeArtistName(artistName);

  // Quick check if artist exists to get the name (Last.fm preferred if key present)
  const artistData = await resolveArtistPreview(audiodbId, artistNameHint);
  if (!artistData) {
    return null;
  }

  const result = await pool.query(
    `INSERT INTO artist_import_jobs (audiodb_id, artist_name, status, import_mode, quality, auto_download)
     VALUES ($1, $2, 'pending', $3, $4, $5)
     RETURNING id`,
    [audiodbId, artistData.name, importMode, quality, autoDownload]
  );

  const jobId = result.rows[0]?.id as number;

  // Fire and forget the background processing, with a global concurrency cap.
  enqueueArtistImportProcessing(jobId);

  return { jobId, artistName: artistData.name };
}

/**
 * Background worker function that processes an artist import job
 */
async function processArtistImportJob(jobId: number) {
  const client = await pool.connect();
  
  try {
    // Get job details
    const jobResult = await client.query(
      "SELECT * FROM artist_import_jobs WHERE id = $1",
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) {
      console.error("Artist import job not found", { jobId });
      return;
    }
    if (job.status === "cancelled") {
      return;
    }

    // Mark as started
    await client.query(
      "UPDATE artist_import_jobs SET status = 'processing', started_at = NOW(), progress_stage = 'Fetching artist data' WHERE id = $1",
      [jobId]
    );
    if (await isImportCancelled(client, jobId)) {
      return;
    }

    const { audiodb_id, import_mode, quality, auto_download, artist_name } = job;

    await client.query(
      "UPDATE artist_import_jobs SET progress_stage = 'Fetching albums' WHERE id = $1",
      [jobId]
    );
    if (await isImportCancelled(client, jobId)) {
      return;
    }

    const importResult = await resolveImportData(audiodb_id, artist_name, import_mode);
    if (!importResult) {
      await client.query(
        "UPDATE artist_import_jobs SET status = 'failed', error_message = 'Artist not found', completed_at = NOW() WHERE id = $1",
        [jobId]
      );
      return;
    }
    if (await isImportCancelled(client, jobId)) {
      return;
    }

    const { artistData, albums, tracksByAlbumId } = importResult;
    const latestAlbumIds = resolveLatestAlbumIds(albums);

    // Save to database
    await client.query(
      "UPDATE artist_import_jobs SET progress_stage = 'Saving to database' WHERE id = $1",
      [jobId]
    );
    if (await isImportCancelled(client, jobId)) {
      return;
    }

    const queuedDownloads: Array<{
      query: string;
      quality: string | null;
      artistName: string;
      albumTitle: string;
      trackId: number;
      albumId: number;
    }> = [];
    let artist: { id: number; name: string; image_url: string | null; created_at: string };
    const artistSource = artistData.source;

    try {
      await client.query("BEGIN");

      const existingArtist = await client.query(
        "SELECT id, image_url FROM artists WHERE lower(name) = lower($1) OR (external_source = $2 AND external_id = $3) LIMIT 1",
        [artistData.name, artistSource, artistData.id]
      );

      if (existingArtist.rows.length > 0) {
        const updateResult = await client.query(
          "UPDATE artists SET name = $1, external_source = $2, external_id = $3, image_url = COALESCE(image_url, $4) WHERE id = $5 RETURNING id, name, image_url, created_at",
          [
            artistData.name,
            artistSource,
            artistData.id,
            artistData.thumb ?? null,
            existingArtist.rows[0].id
          ]
        );
        artist = updateResult.rows[0];
      } else {
        const insertResult = await client.query(
          "INSERT INTO artists (name, external_source, external_id, image_url) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET external_source = EXCLUDED.external_source, external_id = EXCLUDED.external_id, image_url = COALESCE(artists.image_url, EXCLUDED.image_url) RETURNING id, name, image_url, created_at",
          [artistData.name, artistSource, artistData.id, artistData.thumb ?? null]
        );
        artist = insertResult.rows[0];
      }

      // Update job with artist_id
      await client.query(
        "UPDATE artist_import_jobs SET artist_id = $1 WHERE id = $2",
        [artist.id, jobId]
      );

      const genreNames = resolveGenreNamesForArtist(artistData);
      await replaceArtistGenres(client, artist.id, genreNames);

      await client.query(
        "INSERT INTO artist_preferences (artist_id, import_mode, quality, auto_download, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (artist_id) DO UPDATE SET import_mode = $2, quality = $3, auto_download = $4, updated_at = NOW()",
        [artist.id, import_mode, quality, auto_download]
      );

      for (const album of albums) {
        const shouldMonitor =
          import_mode === "discography" || (import_mode === "new" && latestAlbumIds.has(album.id));
        const albumResult = await client.query(
          "INSERT INTO albums (artist_id, title, year, external_source, external_id, monitored) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (external_source, external_id) DO UPDATE SET title = EXCLUDED.title, year = EXCLUDED.year, artist_id = EXCLUDED.artist_id, monitored = EXCLUDED.monitored RETURNING id",
          [artist.id, album.title, album.year, album.source, album.id, shouldMonitor]
        );
        const albumId = albumResult.rows[0].id as number;

        const tracks = tracksByAlbumId.get(album.id) ?? [];
        const trackSource = album.source || artistSource;
        const trackResultRows = await upsertTracksBulk(client, {
          albumId,
          trackSource,
          shouldMonitor,
          tracks: tracks.map((track) => ({
            externalId: track.id,
            title: track.title?.trim() ?? "",
            trackNo: track.trackNo ?? null
          }))
        });
        if (auto_download && shouldMonitor) {
          const trackIdByExternal = new Map<string, number>();
          for (const row of trackResultRows) {
            trackIdByExternal.set(row.external_id, row.id);
          }
          for (const track of tracks) {
            const title = track.title?.trim() ?? "";
            if (!title) continue;
            const trackId = trackIdByExternal.get(track.id);
            if (!trackId) continue;
            const query = `${artistData.name} - ${title}`;
            queuedDownloads.push({
              query,
              quality,
              artistName: artistData.name,
              albumTitle: album.title,
              trackId,
              albumId
            });
          }
        }
      }

      const importLabel = artistSource === "lastfm" ? "Last.fm" : "AudioDB";
      await client.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        [`${artistSource}_import`, `Imported ${artistData.name} from ${importLabel}`, { sourceId: audiodb_id }]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    // Queue downloads
    if (queuedDownloads.length > 0) {
      await client.query(
        "UPDATE artist_import_jobs SET progress_stage = $1 WHERE id = $2",
        [`Queueing ${queuedDownloads.length} downloads`, jobId]
      );
      if (await isImportCancelled(client, jobId)) {
        return;
      }
      await queueImportDownloads(queuedDownloads);
    }

    // Mark as completed
    await client.query(
      "UPDATE artist_import_jobs SET status = 'completed', progress_stage = 'Complete', completed_at = NOW() WHERE id = $1",
      [jobId]
    );

  } catch (error) {
    console.error("Artist import job failed", {
      jobId,
      error: error instanceof Error ? error.message : error
    });
    
    await client.query(
      "UPDATE artist_import_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
      [error instanceof Error ? error.message : String(error), jobId]
    );
  } finally {
    client.release();
  }
}

/**
 * Synchronous artist import (for genre imports that need the artist_id immediately)
 * Use queueArtistImport for better performance and UX
 */
export async function importArtistFromAudioDb(options: ArtistImportOptions) {
  const { audiodbId, artistName, importMode, quality, autoDownload } = options;
  const importResult = await resolveImportData(audiodbId, artistName, importMode);
  if (!importResult) {
    return null;
  }

  const { artistData, albums, tracksByAlbumId } = importResult;
  const latestAlbumIds = resolveLatestAlbumIds(albums);

  const client = await pool.connect();
  const queuedDownloads: Array<{
    query: string;
    quality: string | null;
    artistName: string;
    albumTitle: string;
    trackId: number;
    albumId: number;
  }> = [];
  let artist: { id: number; name: string; image_url: string | null; created_at: string };
  const artistSource = artistData.source;

  try {
    await client.query("BEGIN");

    const existingArtist = await client.query(
      "SELECT id, image_url FROM artists WHERE lower(name) = lower($1) OR (external_source = $2 AND external_id = $3) LIMIT 1",
      [artistData.name, artistSource, artistData.id]
    );

    if (existingArtist.rows.length > 0) {
      const updateResult = await client.query(
        "UPDATE artists SET name = $1, external_source = $2, external_id = $3, image_url = COALESCE(image_url, $4) WHERE id = $5 RETURNING id, name, image_url, created_at",
        [
          artistData.name,
          artistSource,
          artistData.id,
          artistData.thumb ?? null,
          existingArtist.rows[0].id
        ]
      );
      artist = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        "INSERT INTO artists (name, external_source, external_id, image_url) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET external_source = EXCLUDED.external_source, external_id = EXCLUDED.external_id, image_url = COALESCE(artists.image_url, EXCLUDED.image_url) RETURNING id, name, image_url, created_at",
        [artistData.name, artistSource, artistData.id, artistData.thumb ?? null]
      );
      artist = insertResult.rows[0];
    }

    const genreNames = resolveGenreNamesForArtist(artistData);
    await replaceArtistGenres(client, artist.id, genreNames);

    await client.query(
      "INSERT INTO artist_preferences (artist_id, import_mode, quality, auto_download, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (artist_id) DO UPDATE SET import_mode = $2, quality = $3, auto_download = $4, updated_at = NOW()",
      [artist.id, importMode, quality, autoDownload]
    );

    for (const album of albums) {
      const shouldMonitor =
        importMode === "discography" || (importMode === "new" && latestAlbumIds.has(album.id));
      const albumResult = await client.query(
        "INSERT INTO albums (artist_id, title, year, external_source, external_id, monitored) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (external_source, external_id) DO UPDATE SET title = EXCLUDED.title, year = EXCLUDED.year, artist_id = EXCLUDED.artist_id, monitored = EXCLUDED.monitored RETURNING id",
        [artist.id, album.title, album.year, album.source, album.id, shouldMonitor]
      );
      const albumId = albumResult.rows[0].id as number;

      const tracks = tracksByAlbumId.get(album.id) ?? [];
      const trackSource = album.source || artistSource;
      const trackResultRows = await upsertTracksBulk(client, {
        albumId,
        trackSource,
        shouldMonitor,
        tracks: tracks.map((track) => ({
          externalId: track.id,
          title: track.title?.trim() ?? "",
          trackNo: track.trackNo ?? null
        }))
      });
      if (autoDownload && shouldMonitor) {
        const trackIdByExternal = new Map<string, number>();
        for (const row of trackResultRows) {
          trackIdByExternal.set(row.external_id, row.id);
        }
        for (const track of tracks) {
          const title = track.title?.trim() ?? "";
          if (!title) continue;
          const trackId = trackIdByExternal.get(track.id);
          if (!trackId) continue;
          const query = `${artistData.name} - ${title}`;
          queuedDownloads.push({
            query,
            quality,
            artistName: artistData.name,
            albumTitle: album.title,
            trackId,
            albumId
          });
        }
      }
    }

      const importLabel = artistSource === "lastfm" ? "Last.fm" : "AudioDB";
      await client.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        [`${artistSource}_import`, `Imported ${artistData.name} from ${importLabel}`, { sourceId: audiodbId }]
      );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (queuedDownloads.length > 0) {
    void queueImportDownloads(queuedDownloads).catch((error) => {
      console.error("Failed to queue import downloads", {
        artist: artistData.name,
        error: error instanceof Error ? error.message : error
      });
    });
  }

  return { artist, queuedDownloads };
}

type ImportDownload = {
  query: string;
  quality: string | null;
  artistName: string;
  albumTitle: string;
  trackId: number;
  albumId: number;
};

const queueImportDownloads = async (downloads: ImportDownload[]) => {
  if (downloads.length === 0) return;
  const client = await pool.connect();
  const batchSize = 500;
  try {
    for (let start = 0; start < downloads.length; start += batchSize) {
      const chunk = downloads.slice(start, start + batchSize);
      await client.query("BEGIN");
      const statuses = chunk.map(() => "queued");
      const sources = chunk.map(() => "import");
      const queries = chunk.map((download) => download.query);
      const qualities = chunk.map((download) => download.quality);
      const percents = chunk.map(() => 0);
      const trackIds = chunk.map((download) => download.trackId);
      const albumIds = chunk.map((download) => download.albumId);

      const insertResult = await client.query(
        `INSERT INTO download_jobs (status, source, query, quality, progress_percent, track_id, album_id)
         SELECT * FROM UNNEST(
           $1::text[],
           $2::text[],
           $3::text[],
           $4::text[],
           $5::int[],
           $6::int[],
           $7::int[]
         )
         RETURNING id`,
        [statuses, sources, queries, qualities, percents, trackIds, albumIds]
      );
      const inserted = insertResult.rows as Array<{ id: number }>;

      const count = Math.min(inserted.length, chunk.length);
      if (count > 0) {
        const activityValues: Array<string | number | object> = [];
        const activityPlaceholders = Array.from({ length: count }, (_, index) => {
          const jobId = inserted[index]?.id;
          const download = chunk[index];
          activityValues.push(
            "download_queued",
            `Queued download: ${download.query}`,
            { downloadJobId: jobId }
          );
          const offset = index * 3;
          return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
        });
        await client.query(
          `INSERT INTO activity_events (type, message, metadata)
           VALUES ${activityPlaceholders.join(", ")}`,
          activityValues
        );
      }
      await client.query("COMMIT");

      if (inserted.length !== chunk.length) {
        console.warn("Import downloads inserted count mismatch", {
          expected: chunk.length,
          received: inserted.length
        });
      }

      if (inserted.length > 0) {
        const queueItems = chunk.slice(0, inserted.length).map((download, index) => ({
          name: "download-check",
          data: {
            downloadJobId: inserted[index]?.id,
            query: download.query,
            source: "import",
            quality: download.quality,
            artistName: download.artistName ?? null,
            albumTitle: download.albumTitle ?? null
          }
        }));
        try {
          await downloadQueue.addBulk(queueItems);
        } catch (error) {
          console.error("Failed to enqueue import downloads", {
            error: error instanceof Error ? error.message : error
          });
        }
      }
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
