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

const sanitizeFilename = (value: string) => {
  // Cross-platform filename sanitization (Linux + Windows-friendly).
  // Keep it conservative: remove reserved characters, control chars, and normalize whitespace.
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(/[<>:"/\\\\|?*\u0000]+/g, " ")
    .replace(/['"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const truncated = cleaned.length > 180 ? cleaned.slice(0, 180).trim() : cleaned;
  const base = truncated || "Track";

  // Windows reserved device names (also problematic on Samba mounts).
  const lower = base.toLowerCase();
  const reserved = new Set([
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9"
  ]);
  return reserved.has(lower) ? `${base}_` : base;
};

const chooseOutputBaseName = (params: { trackId?: number | null; title?: string | null; fallback?: string }) => {
  const base = sanitizeFilename(params.title ?? params.fallback ?? "Track");
  // Prefer a clean name, but ensure uniqueness within an album folder.
  if (!params.trackId) return base;
  return base;
};

const ensureUniqueMp4Base = (outputDir: string, base: string, trackId?: number | null) => {
  const candidate = path.join(outputDir, `${base}.mp4`);
  if (!fs.existsSync(candidate)) return base;
  if (trackId) {
    const withId = `${base}-${trackId}`;
    if (!fs.existsSync(path.join(outputDir, `${withId}.mp4`))) return withId;
  }
  // Last resort: add timestamp.
  return `${base}-${Date.now()}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanupYtDlpArtifacts = async (outputDir: string, outputBase: string) => {
  // yt-dlp sometimes leaves intermediate artifacts like:
  //   <base>.f137.mp4, <base>.f140.m4a, <base>.temp.mp4
  // These are safe to delete once the merged final mp4 exists.
  const finalPath = path.join(outputDir, `${outputBase}.mp4`);
  try {
    const stat = await fsPromises.stat(finalPath);
    if (!stat.isFile() || stat.size <= 0) {
      return;
    }
  } catch {
    return;
  }

  const prefix = `${outputBase}.`;
  const artifactPattern = new RegExp(`^${escapeRegExp(outputBase)}\\.(?:f\\d+|temp)\\..+$`, "i");
  try {
    const entries = await fsPromises.readdir(outputDir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile()) return;
        const name = entry.name;
        if (!name.startsWith(prefix)) return;
        if (!artifactPattern.test(name)) return;
        await fsPromises.unlink(path.join(outputDir, name)).catch(() => undefined);
      })
    );
  } catch {
    // ignore cleanup failures
  }
};

const buildOutputDir = async (artistName?: string | null, albumTitle?: string | null) => {
  const mediaRoot = await resolveMediaRoot();
  const artist = sanitizeSegment(artistName ?? "Unknown Artist") || "Unknown Artist";
  const album = sanitizeSegment(albumTitle ?? "Singles") || "Singles";
  return path.join(mediaRoot, artist, album);
};

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
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const suffix = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
        reject(new Error(stderr || `ffmpeg exited (${suffix})`));
      }
    });
  });

type FfprobeSummary = {
  formatName: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  pixelFormat: string | null;
};

const runFfprobeJson = async (filePath: string) => {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=format_name:stream=codec_type,codec_name,sample_rate,channels,pix_fmt",
    "-of",
    "json",
    filePath
  ];
  return await new Promise<any>((resolve, reject) => {
    const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("ffprobe JSON parse failed"));
        }
      } else {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
      }
    });
  });
};

const summarizeProbe = (probe: any): FfprobeSummary => {
  const formatNameRaw = probe?.format?.format_name;
  const formatName = typeof formatNameRaw === "string" ? formatNameRaw : null;
  const streams: any[] = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((s) => s?.codec_type === "video") ?? null;
  const audio = streams.find((s) => s?.codec_type === "audio") ?? null;
  const videoCodec = typeof video?.codec_name === "string" ? video.codec_name : null;
  const pixelFormat = typeof video?.pix_fmt === "string" ? video.pix_fmt : null;
  const audioCodec = typeof audio?.codec_name === "string" ? audio.codec_name : null;
  const audioSampleRateRaw =
    typeof audio?.sample_rate === "string" ? Number(audio.sample_rate) : Number(audio?.sample_rate);
  const audioSampleRate =
    Number.isFinite(audioSampleRateRaw) && audioSampleRateRaw > 0 ? Math.floor(audioSampleRateRaw) : null;
  const audioChannelsRaw = Number(audio?.channels);
  const audioChannels =
    Number.isFinite(audioChannelsRaw) && audioChannelsRaw > 0 ? Math.floor(audioChannelsRaw) : null;
  return { formatName, videoCodec, audioCodec, audioSampleRate, audioChannels, pixelFormat };
};

const normalizeBoolEnv = (value: string | undefined, defaultValue: boolean) => {
  if (!value) return defaultValue;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "1" || trimmed === "true" || trimmed === "yes" || trimmed === "on") return true;
  if (trimmed === "0" || trimmed === "false" || trimmed === "no" || trimmed === "off") return false;
  return defaultValue;
};

const normalizePositiveIntEnv = (value: string | undefined, defaultValue: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : defaultValue;
};

const ensureConcatCopyCompatibleMp4 = async (inputPath: string) => {
  const ensureCompat = normalizeBoolEnv(process.env.YT_DLP_ENSURE_STREAM_COMPAT, true);
  if (!ensureCompat) return inputPath;

  const desiredAudioSampleRate = normalizePositiveIntEnv(
    process.env.YT_DLP_STREAM_AUDIO_SAMPLE_RATE,
    44100
  );
  const desiredAudioChannels = normalizePositiveIntEnv(process.env.YT_DLP_STREAM_AUDIO_CHANNELS, 2);
  const requireYuv420p = normalizeBoolEnv(process.env.YT_DLP_STREAM_REQUIRE_YUV420P, false);

  let probe: any;
  try {
    probe = await runFfprobeJson(inputPath);
  } catch (error) {
    console.warn(`ffprobe failed for ${inputPath}; leaving file as-is`, error);
    return inputPath;
  }
  const summary = summarizeProbe(probe);
  const ext = path.extname(inputPath).toLowerCase();
  const isMp4Like =
    ext === ".mp4" ||
    (typeof summary.formatName === "string" && summary.formatName.toLowerCase().includes("mp4"));

  const videoOk = summary.videoCodec ? summary.videoCodec === "h264" : true;
  const audioOk = summary.audioCodec ? summary.audioCodec === "aac" : true;
  const audioParamsOk = summary.audioCodec
    ? summary.audioSampleRate === desiredAudioSampleRate && summary.audioChannels === desiredAudioChannels
    : true;
  const pixFmtOk = requireYuv420p ? (summary.videoCodec ? summary.pixelFormat === "yuv420p" : true) : true;

  if (isMp4Like && videoOk && audioOk && audioParamsOk && pixFmtOk) {
    return inputPath;
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const tempPath = path.join(dir, `${base}.compat.mp4`);
  const outputPath = path.join(dir, `${base}.mp4`);
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    String(desiredAudioSampleRate),
    "-ac",
    String(desiredAudioChannels),
    "-movflags",
    "+faststart",
    tempPath
  ]);

  if (fs.existsSync(outputPath) && outputPath !== inputPath) {
    await fsPromises.unlink(outputPath).catch(() => undefined);
  }
  if (fs.existsSync(outputPath) && outputPath === inputPath) {
    await fsPromises.unlink(outputPath).catch(() => undefined);
  }
  await fsPromises.rename(tempPath, outputPath);
  if (outputPath !== inputPath) {
    await fsPromises.unlink(inputPath).catch(() => undefined);
  }
  return outputPath;
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
      await pool.query(
        "INSERT INTO activity_events (type, message, metadata) VALUES ($1, $2, $3)",
        ["remux_completed", `Remuxed track ${trackId}`, { trackId, videoId }]
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
      trackId?: number | null;
      trackTitle?: string | null;
      artistId?: number | null;
      outputBase?: string | null;
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
        const outputDir = await buildOutputDir(artistName, albumTitle);
        const outputBase =
          typeof job.data.outputBase === "string" && job.data.outputBase.trim()
            ? job.data.outputBase.trim()
            : ensureUniqueMp4Base(
                outputDir,
                chooseOutputBaseName({
                  trackId: typeof job.data.trackId === "number" ? job.data.trackId : null,
                  title: typeof job.data.trackTitle === "string" ? job.data.trackTitle : null,
                  fallback: query
                }),
                typeof job.data.trackId === "number" ? job.data.trackId : null
              );
        await downloadQueue.add("download", {
          downloadJobId,
          query,
          source: resolvedSource,
          quality,
          artistName: artistName ?? null,
          albumTitle: albumTitle ?? null,
          prechecked: true,
          trackId: typeof job.data.trackId === "number" ? job.data.trackId : null,
          trackTitle: typeof job.data.trackTitle === "string" ? job.data.trackTitle : null,
          artistId: typeof job.data.artistId === "number" ? job.data.artistId : null,
          outputBase
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

      const outputDir = await buildOutputDir(artistName, albumTitle);
      const outputBase =
        typeof job.data.outputBase === "string" && job.data.outputBase.trim()
          ? job.data.outputBase.trim()
          : ensureUniqueMp4Base(
              outputDir,
              chooseOutputBaseName({
                trackId: typeof job.data.trackId === "number" ? job.data.trackId : null,
                title: typeof job.data.trackTitle === "string" ? job.data.trackTitle : null,
                fallback: query
              }),
              typeof job.data.trackId === "number" ? job.data.trackId : null
            );
      await downloadQueue.add("download", {
        downloadJobId,
        query,
        source: resolvedSource,
        quality,
        artistName: artistName ?? null,
        albumTitle: albumTitle ?? null,
        prechecked: true,
        trackId: typeof job.data.trackId === "number" ? job.data.trackId : null,
        trackTitle: typeof job.data.trackTitle === "string" ? job.data.trackTitle : null,
        artistId: typeof job.data.artistId === "number" ? job.data.artistId : null,
        outputBase
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

    let trackId = typeof job.data.trackId === "number" ? job.data.trackId : null;
    let trackTitle =
      typeof job.data.trackTitle === "string" && job.data.trackTitle.trim()
        ? job.data.trackTitle.trim()
        : null;
    let artistId = typeof job.data.artistId === "number" ? job.data.artistId : null;

    // If missing metadata, resolve once and persist to the job payload so retries remain deterministic.
    if (!trackId || !trackTitle || artistId === null) {
      const jobMeta = await pool.query(
        "SELECT dj.track_id, t.title, a.artist_id FROM download_jobs dj LEFT JOIN tracks t ON t.id = dj.track_id LEFT JOIN albums a ON a.id = t.album_id WHERE dj.id = $1",
        [downloadJobId]
      );
      trackId = (jobMeta.rows[0]?.track_id as number | undefined) ?? trackId;
      trackTitle = (jobMeta.rows[0]?.title as string | undefined) ?? trackTitle;
      artistId = (jobMeta.rows[0]?.artist_id as number | undefined) ?? artistId;
    }

    const outputDir = await buildOutputDir(artistName, albumTitle);
    let outputBase =
      typeof job.data.outputBase === "string" && job.data.outputBase.trim()
        ? job.data.outputBase.trim()
        : ensureUniqueMp4Base(
            outputDir,
            chooseOutputBaseName({ trackId, title: trackTitle, fallback: query }),
            trackId
          );

    // Persist for retries (BullMQ supports updating job data).
    try {
      await job.updateData({ ...job.data, trackId, trackTitle, artistId, outputBase });
    } catch {
      // ignore if job data cannot be updated
    }
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
      { ...youtubeSettings, outputTemplate: `${outputBase}.%(ext)s` },
      (stage, detail) => {
        void updateStage(stage, detail).catch(() => undefined);
      }
    );

    let resolvedFilePath =
      filePaths.find((filePath) => filePath) ?? findNewestFile(outputDir, downloadStartedAt);
    const statusCheck = await pool.query("SELECT status FROM download_jobs WHERE id = $1", [
      downloadJobId
    ]);
    if (statusCheck.rows[0]?.status === "cancelled") {
      return;
    }
    if (resolvedFilePath) {
      if (trackTitle) {
        const desiredBase = ensureUniqueMp4Base(
          outputDir,
          chooseOutputBaseName({ trackId, title: trackTitle }),
          trackId
        );
        const resolvedExt = path.extname(resolvedFilePath) || ".mp4";
        const desiredPath = path.join(outputDir, `${desiredBase}${resolvedExt}`);
        if (resolvedFilePath !== desiredPath) {
          try {
            await fsPromises.rename(resolvedFilePath, desiredPath);
            resolvedFilePath = desiredPath;
            outputBase = desiredBase;
          } catch (error) {
            console.warn(`Failed to rename file to ${desiredPath}`, error);
          }
        }
      }

      // Ensure the stored media is compatible with concat+copy streaming (H.264/AAC MP4),
      // especially important for TS HLS where we rely on remuxing + bitstream filters.
      try {
        resolvedFilePath = await ensureConcatCopyCompatibleMp4(resolvedFilePath);
      } catch (error) {
        console.warn(`Failed to normalize ${resolvedFilePath} for stream compatibility`, error);
      }

      if (trackId) {
        const title = trackTitle ?? path.basename(resolvedFilePath);
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
      }

      // Best-effort cleanup of yt-dlp intermediate artifacts in the album folder.
      await cleanupYtDlpArtifacts(outputDir, outputBase);
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
