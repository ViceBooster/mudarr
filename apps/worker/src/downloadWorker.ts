import { Queue, Worker } from "bullmq";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import pool from "./db.js";
import { resolveYtDlpMetadata, runYtDlp } from "./ytDlp.js";

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT ?? 6379)
};
const downloadQueue = new Queue("downloadQueue", { connection });

const mediaRootCacheTtlMs = 30_000;
let mediaRootCache: { value: string; loadedAt: number } | null = null;

const normalizeMediaRoot = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const loadMediaRootFromSettings = async () => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["general"]);
    const stored = result.rows[0]?.value ?? {};
    return normalizeMediaRoot(stored.mediaRoot);
  } catch {
    return null;
  }
};

const ensureMediaRoot = async (preferred: string) => {
  try {
    await fsPromises.mkdir(preferred, { recursive: true });
    return preferred;
  } catch (error) {
    const fallback = path.join(process.cwd(), "data", "music");
    try {
      await fsPromises.mkdir(fallback, { recursive: true });
      console.warn(`Failed to create ${preferred}. Falling back to ${fallback}.`);
      return fallback;
    } catch (fallbackError) {
      console.error(`Failed to create media root at ${preferred} or ${fallback}.`);
      return preferred;
    }
  }
};

const resolveMediaRoot = async () => {
  const now = Date.now();
  if (mediaRootCache && now - mediaRootCache.loadedAt < mediaRootCacheTtlMs) {
    return mediaRootCache.value;
  }
  const stored = await loadMediaRootFromSettings();
  const preferred = stored ?? process.env.MEDIA_ROOT ?? "/data/music";
  const resolved = await ensureMediaRoot(preferred);
  mediaRootCache = { value: resolved, loadedAt: now };
  return resolved;
};

const sanitizeSegment = (value: string) =>
  value.replace(/[<>:"/\\\\|?*]+/g, "").replace(/\s+/g, " ").trim();

const buildOutputDir = async (artistName?: string | null, albumTitle?: string | null) => {
  const mediaRoot = await resolveMediaRoot();
  const artist = sanitizeSegment(artistName ?? "Unknown Artist") || "Unknown Artist";
  const album = sanitizeSegment(albumTitle ?? "Singles") || "Singles";
  return path.join(mediaRoot, artist, album);
};

const hlsSegmentDurationSeconds = 6;
const hlsCacheDirName = ".mudarr-hls";
const buildTrackHlsDir = (filePath: string, trackId: number) =>
  path.join(path.dirname(filePath), hlsCacheDirName, `track-${trackId}`);

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });
  });

const segmentTrackToHls = async (trackId: number, filePath: string) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("HLS segmenting failed: file not found");
  }
  const outputDir = buildTrackHlsDir(filePath, trackId);
  await fsPromises.rm(outputDir, { recursive: true, force: true });
  await fsPromises.mkdir(outputDir, { recursive: true });
  await runFfmpeg([
    "-y",
    "-i",
    filePath,
    "-c",
    "copy",
    "-map",
    "0",
    "-f",
    "hls",
    "-hls_time",
    String(hlsSegmentDurationSeconds),
    "-hls_list_size",
    "0",
    "-hls_segment_type",
    "mpegts",
    "-hls_segment_filename",
    path.join(outputDir, "segment-%06d.ts"),
    "-hls_flags",
    "independent_segments+program_date_time+temp_file",
    "-hls_playlist_type",
    "vod",
    path.join(outputDir, "playlist.m3u8")
  ]);
};

const remuxToMp4 = async (inputPath: string) => {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const tempPath = path.join(dir, `${base}.remux.mp4`);
  const outputPath = path.join(dir, `${base}.mp4`);
  await runFfmpeg(["-y", "-i", inputPath, "-c", "copy", "-movflags", "+faststart", tempPath]);
  if (fs.existsSync(outputPath)) {
    await fsPromises.unlink(outputPath);
  }
  await fsPromises.rename(tempPath, outputPath);
  if (outputPath !== inputPath) {
    await fsPromises.unlink(inputPath).catch(() => undefined);
  }
  return outputPath;
};

const findNewestFile = (dir: string, sinceMs?: number) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const stats = fs.statSync(fullPath);
      return { path: fullPath, mtimeMs: stats.mtimeMs };
    });
    const filtered = sinceMs ? files.filter((file) => file.mtimeMs >= sinceMs) : files;
    const sorted = filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return sorted[0]?.path ?? null;
  } catch (error) {
    return null;
  }
};

const normalizeConcurrency = (value: unknown) => {
  const parsed = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  if (rounded < 1) return null;
  return Math.min(rounded, 10);
};

type SearchSettings = {
  skipNonOfficialMusicVideos: boolean;
};

const searchSettingsCacheTtlMs = 30_000;
let searchSettingsCache: { value: SearchSettings; loadedAt: number } | null = null;

const loadSearchSettings = async (): Promise<SearchSettings> => {
  const now = Date.now();
  if (searchSettingsCache && now - searchSettingsCache.loadedAt < searchSettingsCacheTtlMs) {
    return searchSettingsCache.value;
  }
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["search"]);
    const stored = result.rows[0]?.value ?? {};
    const value = {
      skipNonOfficialMusicVideos: stored.skipNonOfficialMusicVideos === true
    };
    searchSettingsCache = { value, loadedAt: now };
    return value;
  } catch (error) {
    const fallback = { skipNonOfficialMusicVideos: false };
    searchSettingsCache = { value: fallback, loadedAt: now };
    return fallback;
  }
};

const normalizeSource = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "manual";

const shouldFilterByOfficialTitle = (source: string, settings: SearchSettings) =>
  settings.skipNonOfficialMusicVideos && (source === "monitor" || source === "import");

const looksLikeVevoChannel = (value: string | null | undefined) => {
  if (!value) return false;
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.some((token) => token === "vevo" || token.endsWith("vevo"));
};

const isOfficialMusicVideoMatch = (params: {
  title: string | null;
  uploader: string | null;
  channel: string | null;
  uploaderId: string | null;
}) => {
  const title = params.title ?? "";
  const normalizedTitle = title.toLowerCase();
  const isUnofficial =
    /\bunofficial\b/.test(normalizedTitle) || /\bnon[-\s]?official\b/.test(normalizedTitle);
  const hasOfficialToken = /\bofficial\b/.test(normalizedTitle);
  const hasVideoToken = /\bvideo\b/.test(normalizedTitle);
  if (!isUnofficial && hasOfficialToken && hasVideoToken) {
    return true;
  }
  const uploaderText = `${params.uploader ?? ""} ${params.channel ?? ""} ${params.uploaderId ?? ""}`;
  return looksLikeVevoChannel(uploaderText);
};

const resolveOfficialCheck = async (
  query: string,
  youtubeSettings:
    | {
        cookiesPath?: string | null;
        cookiesFromBrowser?: string | null;
        cookiesHeader?: string | null;
        outputFormat?: "original" | "mp4-remux" | "mp4-recode" | null;
      }
    | undefined
) => {
  const metadataResult = await resolveYtDlpMetadata(query, youtubeSettings);
  const metadata = metadataResult.metadata;
  const resolvedTitle = metadata?.title?.trim() || null;
  const hasOfficialMatch = metadata
    ? isOfficialMusicVideoMatch({
        title: metadata.title,
        uploader: metadata.uploader,
        channel: metadata.channel,
        uploaderId: metadata.uploaderId
      })
    : false;
  if (hasOfficialMatch) {
    return { ok: true, metadata, resolvedTitle, reason: null };
  }
  const reason = resolvedTitle
    ? `Skipped: "${resolvedTitle}" does not look like an official video.`
    : metadataResult.error
      ? `Skipped: unable to resolve YouTube metadata (${metadataResult.error}).`
      : "Skipped: unable to resolve YouTube metadata.";
  return { ok: false, metadata, resolvedTitle, reason };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveWorkerConcurrency = async () => {
  const maxAttempts = 30;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await pool.query("SELECT value FROM settings WHERE key = $1", ["downloads"]);
      const stored = result.rows[0]?.value ?? {};
      const storedValue = normalizeConcurrency(stored.concurrency);
      if (storedValue) {
        return storedValue;
      }
      break;
    } catch (error) {
      lastError = error;
      await wait(1000);
    }
  }
  const envValue = normalizeConcurrency(process.env.WORKER_CONCURRENCY);
  if (envValue) {
    return envValue;
  }
  if (lastError) {
    console.warn("Failed to load download settings, using default concurrency.");
  }
  return 2;
};

const downloadWorker = new Worker(
  "downloadQueue",
  async (job) => {
    if (job.name === "remux") {
      const { trackId, videoId, filePath } = job.data as {
        trackId: number;
        videoId: number;
        filePath: string;
      };
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("Remux failed: file not found");
      }
      await pool.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        ["remux_started", `Remuxing track ${trackId}`, { trackId, videoId }]
      );
      const remuxedPath = await remuxToMp4(filePath);
      await pool.query("UPDATE videos SET file_path = $1 WHERE id = $2", [
        remuxedPath,
        videoId
      ]);
      try {
        await segmentTrackToHls(trackId, remuxedPath);
        await pool.query(
          "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
          ["hls_segment_completed", `Segmented HLS for track ${trackId}`, { trackId }]
        );
      } catch (error) {
        console.warn(`Failed to segment HLS for track ${trackId}`, error);
        await pool.query(
          "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
          ["hls_segment_failed", `Failed to segment HLS for track ${trackId}`, { trackId }]
        );
      }
      await pool.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        ["remux_completed", `Remuxed track ${trackId}`, { trackId, videoId }]
      );
      return;
    }

    if (job.name === "hls-segment") {
      const { trackId, filePath } = job.data as { trackId: number; filePath: string };
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("HLS segmenting failed: file not found");
      }
      await pool.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        ["hls_segment_started", `Segmenting HLS for track ${trackId}`, { trackId }]
      );
      await segmentTrackToHls(trackId, filePath);
      await pool.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        ["hls_segment_completed", `Segmented HLS for track ${trackId}`, { trackId }]
      );
      return;
    }

    const { downloadJobId, query, quality, artistName, albumTitle, source, prechecked } = job.data as {
      downloadJobId: number;
      query: string;
      quality?: string | null;
      artistName?: string | null;
      albumTitle?: string | null;
      source?: string | null;
      prechecked?: boolean;
    };

    const metaResult = await pool.query("SELECT status, source FROM download_jobs WHERE id = $1", [
      downloadJobId
    ]);
    if (metaResult.rows.length === 0) {
      return;
    }
    const currentStatus = metaResult.rows[0]?.status as string | null | undefined;
    if (!currentStatus || currentStatus === "cancelled") {
      return;
    }
    const resolvedSource = normalizeSource(metaResult.rows[0]?.source ?? source);

    const settingsResult = await pool.query("SELECT value FROM settings WHERE key = $1", ["youtube"]);
    const youtubeSettings = settingsResult.rows[0]?.value as
      | {
          cookiesPath?: string | null;
          cookiesFromBrowser?: string | null;
          cookiesHeader?: string | null;
          outputFormat?: "original" | "mp4-remux" | "mp4-recode" | null;
        }
      | undefined;

    const searchSettings = await loadSearchSettings();
    if (job.name === "download-check") {
      if (currentStatus !== "queued" && currentStatus !== "checking") {
        return;
      }
      if (!shouldFilterByOfficialTitle(resolvedSource, searchSettings)) {
        await downloadQueue.add("download", {
          downloadJobId,
          query,
          source: resolvedSource,
          quality,
          artistName: artistName ?? null,
          albumTitle: albumTitle ?? null,
          prechecked: true
        });
        return;
      }
      await pool.query(
        "UPDATE download_jobs SET progress_stage = $1, progress_detail = $2, progress_percent = NULL WHERE id = $3 AND status = 'queued'",
        ["checking", "Checking metadata", downloadJobId]
      );
      const check = await resolveOfficialCheck(query, youtubeSettings);
      if (!check.ok) {
        await pool.query(
          "UPDATE download_jobs SET status = $1, finished_at = NOW(), error = $2, progress_stage = $3, progress_detail = NULL WHERE id = $4 AND status <> 'cancelled'",
          ["failed", check.reason, "failed", downloadJobId]
        );
        await pool.query(
          "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
          [
            "download_skipped",
            `Skipped download: ${query}`,
            {
              downloadJobId,
              reason: check.reason,
              source: resolvedSource,
              title: check.resolvedTitle,
              uploader: check.metadata?.uploader ?? null,
              channel: check.metadata?.channel ?? null,
              uploaderId: check.metadata?.uploaderId ?? null
            }
          ]
        );
        return;
      }
      await pool.query(
        "UPDATE download_jobs SET progress_stage = $1, progress_detail = $2 WHERE id = $3 AND status = 'queued'",
        ["queued", "Queued for download", downloadJobId]
      );
      await downloadQueue.add("download", {
        downloadJobId,
        query,
        source: resolvedSource,
        quality,
        artistName: artistName ?? null,
        albumTitle: albumTitle ?? null,
        prechecked: true
      });
      return;
    }

    if (!prechecked && shouldFilterByOfficialTitle(resolvedSource, searchSettings)) {
      const check = await resolveOfficialCheck(query, youtubeSettings);
      if (!check.ok) {
        await pool.query(
          "UPDATE download_jobs SET status = $1, finished_at = NOW(), error = $2, progress_stage = $3, progress_detail = NULL WHERE id = $4 AND status <> 'cancelled'",
          ["failed", check.reason, "failed", downloadJobId]
        );
        await pool.query(
          "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
          [
            "download_skipped",
            `Skipped download: ${query}`,
            {
              downloadJobId,
              reason: check.reason,
              source: resolvedSource,
              title: check.resolvedTitle,
              uploader: check.metadata?.uploader ?? null,
              channel: check.metadata?.channel ?? null,
              uploaderId: check.metadata?.uploaderId ?? null
            }
          ]
        );
        return;
      }
    }

    const startResult = await pool.query(
      "UPDATE download_jobs SET status = $1, started_at = NOW(), progress_percent = $2, progress_stage = $3, progress_detail = $4 WHERE id = $5 AND status <> 'cancelled' RETURNING id",
      ["downloading", 0, "download", "Downloading", downloadJobId]
    );
    if (startResult.rows.length === 0) {
      return;
    }

    await pool.query(
      "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
      ["download_started", `Downloading: ${query}`, { downloadJobId }]
    );

    const outputDir = await buildOutputDir(artistName, albumTitle);
    const downloadStartedAt = Date.now();
    let lastDownloadProgress = -1;
    let lastProcessingProgress = -1;
    let currentStage: "download" | "processing" | "finalizing" = "download";
    let currentDetail: string | null = "Downloading";
    const updateStage = async (
      stage: "download" | "processing" | "finalizing",
      detail?: string
    ) => {
      if (stage === currentStage && (detail ?? null) === currentDetail) {
        return;
      }
      currentStage = stage;
      currentDetail = detail ?? null;
      if (stage === "download") {
        await pool.query(
          "UPDATE download_jobs SET progress_stage = $1, progress_detail = $2 WHERE id = $3 AND status = 'downloading'",
          [stage, currentDetail, downloadJobId]
        );
      } else {
        await pool.query(
          "UPDATE download_jobs SET progress_stage = $1, progress_detail = $2, progress_percent = NULL WHERE id = $3 AND status = 'downloading'",
          [stage, currentDetail, downloadJobId]
        );
      }
    };

    const filePaths = await runYtDlp(
      query,
      outputDir,
      quality,
      (percent, stage = "download") => {
        const normalized = Math.min(100, Math.max(0, percent));
        const rounded =
          normalized > 0 && normalized < 1 ? 1 : Math.min(100, Math.floor(normalized));
        if (stage === "processing") {
          if (rounded <= lastProcessingProgress) {
            return;
          }
          lastProcessingProgress = rounded;
          if (currentStage !== "processing") {
            void updateStage("processing", "Encoding").catch(() => undefined);
          }
          void pool
            .query(
              "UPDATE download_jobs SET progress_percent = $1 WHERE id = $2 AND status = 'downloading'",
              [rounded, downloadJobId]
            )
            .catch(() => undefined);
          return;
        }
        if (rounded <= lastDownloadProgress) {
          return;
        }
        lastDownloadProgress = rounded;
        if (currentStage !== "download") {
          void updateStage("download", "Downloading").catch(() => undefined);
        }
        void pool
          .query(
            "UPDATE download_jobs SET progress_percent = $1 WHERE id = $2 AND status = 'downloading'",
            [rounded, downloadJobId]
          )
          .catch(() => undefined);
      },
      youtubeSettings,
      (stage, detail) => {
        void updateStage(stage, detail).catch(() => undefined);
      }
    );

    const resolvedFilePath =
      filePaths.find((filePath) => filePath) ?? findNewestFile(outputDir, downloadStartedAt);
    const statusCheck = await pool.query("SELECT status FROM download_jobs WHERE id = $1", [
      downloadJobId
    ]);
    if (statusCheck.rows[0]?.status === "cancelled") {
      return;
    }
    if (resolvedFilePath) {
      const jobMeta = await pool.query(
        "SELECT track_id FROM download_jobs WHERE id = $1",
        [downloadJobId]
      );
      const trackId = jobMeta.rows[0]?.track_id as number | null | undefined;
      if (trackId) {
        const trackMeta = await pool.query(
          "SELECT t.title, a.artist_id FROM tracks t LEFT JOIN albums a ON a.id = t.album_id WHERE t.id = $1",
          [trackId]
        );
        const title = trackMeta.rows[0]?.title ?? path.basename(resolvedFilePath);
        const artistId = trackMeta.rows[0]?.artist_id ?? null;
        const existingVideo = await pool.query("SELECT id FROM videos WHERE track_id = $1", [
          trackId
        ]);
        if (existingVideo.rows.length > 0) {
          const videoId = existingVideo.rows[0].id as number;
          await pool.query(
            "UPDATE videos SET status = $1, file_path = $2, title = $3, artist_id = $4 WHERE id = $5",
            ["completed", resolvedFilePath, title, artistId, videoId]
          );
          await pool.query("UPDATE download_jobs SET video_id = $1 WHERE id = $2", [
            videoId,
            downloadJobId
          ]);
        } else {
          const videoResult = await pool.query(
            "INSERT INTO videos (artist_id, track_id, title, status, file_path) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [artistId, trackId, title, "completed", resolvedFilePath]
          );
          await pool.query("UPDATE download_jobs SET video_id = $1 WHERE id = $2", [
            videoResult.rows[0].id,
            downloadJobId
          ]);
        }
        try {
          await segmentTrackToHls(trackId, resolvedFilePath);
          await pool.query(
            "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
            ["hls_segment_completed", `Segmented HLS for track ${trackId}`, { trackId }]
          );
        } catch (error) {
          console.warn(`Failed to segment HLS for track ${trackId}`, error);
          await pool.query(
            "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
            ["hls_segment_failed", `Failed to segment HLS for track ${trackId}`, { trackId }]
          );
        }
      }
    }

    await pool.query(
      "UPDATE download_jobs SET status = $1, finished_at = NOW(), progress_percent = $2, progress_stage = NULL, progress_detail = NULL WHERE id = $3 AND status = 'downloading'",
      ["completed", 100, downloadJobId]
    );

    await pool.query(
      "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
      ["download_completed", `Completed: ${query}`, { downloadJobId }]
    );
  },
  {
    connection,
    concurrency: await resolveWorkerConcurrency()
  }
);

downloadWorker.on("failed", async (job, error) => {
  if (!job) {
    return;
  }
  const { downloadJobId, query } = job.data as { downloadJobId: number; query: string };
  await pool.query(
    "UPDATE download_jobs SET status = $1, finished_at = NOW(), error = $2, progress_stage = $4, progress_detail = NULL WHERE id = $3",
    ["failed", error.message, downloadJobId, "failed"]
  );
  await pool.query(
    "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
    ["download_failed", `Failed: ${query}`, { downloadJobId, error: error.message }]
  );
});

export default downloadWorker;
