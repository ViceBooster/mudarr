import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import pool from "../db/pool.js";
import { getBaseUrl } from "../services/appSettings.js";
import { getMediaInfo } from "../services/media.js";
import { recordStreamBandwidth } from "../services/streamMetrics.js";
import { getStreamToken } from "../services/streams.js";
import { requireStreamToken } from "../services/streamAuth.js";
import downloadQueue from "../queue/downloadQueue.js";

const router = Router();

const encodingOptions = ["original", "copy", "transcode", "web"] as const;
const statusOptions = ["active", "stopped"] as const;

const createStreamSchema = z.object({
  name: z.string().trim().min(1),
  trackIds: z.array(z.number().int()).optional(),
  artistIds: z.array(z.number().int()).optional(),
  genreIds: z.array(z.number().int()).optional(),
  shuffle: z.boolean().optional(),
  encoding: z.enum(encodingOptions).optional(),
  icon: z.string().trim().max(500).optional()
});

const updateStreamSchema = z.object({
  name: z.string().trim().min(1).optional(),
  shuffle: z.boolean().optional(),
  encoding: z.enum(encodingOptions).optional(),
  status: z.enum(statusOptions).optional(),
  icon: z.string().trim().max(500).optional()
});

const updateStreamItemsSchema = z.object({
  trackIds: z.array(z.number().int()).optional(),
  artistIds: z.array(z.number().int()).optional(),
  genreIds: z.array(z.number().int()).optional()
});

const rescanStreamSchema = z.object({
  artistIds: z.array(z.number().int()).optional()
});

const streamActionSchema = z.object({
  action: z.enum(["start", "stop", "reboot"])
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

type MediaInfo = {
  bytes: number | null;
  duration: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  bitRate: number | null;
};

type StreamClientInfo = {
  id: string;
  ip: string;
  userAgent: string | null;
  connectedSince: number;
  lastSeen: number;
  lastPath: string | null;
  activeConnectionCount: number;
};

const execFileAsync = promisify(execFile);
const streamClients = new Map<number, Map<string, StreamClientInfo>>();
const clientTimeoutMs = 30000;

type HlsSession = {
  sessionId: number;
  streamId: number;
  dir: string;
  currentProcess: ReturnType<typeof spawn> | null;
  processStartedAt: number | null;
  lastAccess: number;
  stopped: boolean;
  segmentIndex: number;
  encoding: typeof encodingOptions[number];
  ordered: Array<{ file_path: string; artist_name: string | null }>;
  startOffsetSeconds: number;
  runner: Promise<void> | null;
};
const hlsSessions = new Map<number, HlsSession>();
const resolveHlsRootDir = () => {
  const configured = (process.env.HLS_TMP_DIR ?? "").trim();
  const baseDir = configured || os.tmpdir();
  return path.join(baseDir, "mudarr-hls");
};
let hlsRootDir = resolveHlsRootDir();
const ensureHlsRootDir = async () => {
  try {
    await fsPromises.mkdir(hlsRootDir, { recursive: true });
    return hlsRootDir;
  } catch (error) {
    const fallbackRoot = path.join(os.tmpdir(), "mudarr-hls");
    if (hlsRootDir === fallbackRoot) {
      throw error;
    }
    console.warn(
      `HLS tmp dir "${hlsRootDir}" is not available; falling back to "${fallbackRoot}".`
    );
    hlsRootDir = fallbackRoot;
    await fsPromises.mkdir(hlsRootDir, { recursive: true });
    return hlsRootDir;
  }
};
const hlsSegmentDurationSeconds = 6;
const hlsPlaylistWindowSeconds = 60;
const hlsListSize = Math.max(3, Math.ceil(hlsPlaylistWindowSeconds / hlsSegmentDurationSeconds));
const hlsDeleteThreshold = 2;
const hlsRestreamWindowSeconds = 1800;
const hlsForceKeyFrameExpr = `expr:gte(t,n_forced*${hlsSegmentDurationSeconds})`;
const hlsFlags =
  "delete_segments+append_list+omit_endlist+independent_segments+program_date_time+temp_file+discont_start";
const hlsCacheDirName = ".mudarr-hls";

type TrackHlsSegment = {
  duration: number;
  uri: string;
};

type TrackHlsPlaylist = {
  targetDuration: number;
  mapLine: string | null;
  segments: TrackHlsSegment[];
};

const getTrackHlsDir = (filePath: string, trackId: number) =>
  path.join(path.dirname(filePath), hlsCacheDirName, `track-${trackId}`);

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return promise;
  }
  return await new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
};

const hlsQueueAddTimeoutMsRaw = Number(process.env.HLS_QUEUE_ADD_TIMEOUT_MS ?? 2000);
const hlsQueueAddTimeoutMs =
  Number.isFinite(hlsQueueAddTimeoutMsRaw) && hlsQueueAddTimeoutMsRaw > 0
    ? Math.floor(hlsQueueAddTimeoutMsRaw)
    : 2000;

const clearTrackHlsCache = async (filePath: string, trackId: number) => {
  const dir = getTrackHlsDir(filePath, trackId);
  try {
    await fsPromises.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const queueHlsSegmentJob = async (trackId: number, filePath: string) => {
  try {
    await withTimeout(
      downloadQueue.add(
        "hls-segment",
        { trackId, filePath },
        { jobId: `hls-segment-${trackId}`, removeOnComplete: true, removeOnFail: 25 }
      ),
      hlsQueueAddTimeoutMs,
      `queue hls-segment for track ${trackId}`
    );
  } catch (error) {
    console.warn(`Failed to queue HLS segment job for track ${trackId}`, error);
  }
};

const parseTrackHlsPlaylist = (body: string): TrackHlsPlaylist | null => {
  const lines = body.split(/\r?\n/);
  let targetDuration = 0;
  let mapLine: string | null = null;
  const segments: TrackHlsSegment[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      const value = Number.parseFloat(line.slice("#EXT-X-TARGETDURATION:".length));
      if (Number.isFinite(value)) {
        targetDuration = value;
      }
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      mapLine = line;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      const durationText = line.slice("#EXTINF:".length).split(",")[0] ?? "";
      const duration = Number.parseFloat(durationText);
      let uri = "";
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j]?.trim();
        if (!next) continue;
        if (next.startsWith("#")) continue;
        uri = next;
        i = j;
        break;
      }
      if (uri) {
        segments.push({
          duration: Number.isFinite(duration) ? duration : hlsSegmentDurationSeconds,
          uri: path.basename(uri)
        });
      }
    }
  }
  if (segments.length === 0) {
    return null;
  }
  return {
    targetDuration: targetDuration > 0 ? targetDuration : hlsSegmentDurationSeconds,
    mapLine,
    segments
  };
};

const readTrackHlsPlaylist = async (filePath: string, trackId: number) => {
  const dir = getTrackHlsDir(filePath, trackId);
  const playlistPath = path.join(dir, "playlist.m3u8");
  try {
    await fsPromises.stat(playlistPath);
  } catch {
    return null;
  }
  try {
    const body = await fsPromises.readFile(playlistPath, "utf8");
    const parsed = parseTrackHlsPlaylist(body);
    if (!parsed) {
      return null;
    }
    if (parsed.mapLine) {
      try {
        await fsPromises.stat(path.join(dir, "init.mp4"));
      } catch {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

type CachedPlaylistResult = {
  playlist: string | null;
  missing: Array<{ track_id: number; file_path: string }>;
  isComplete: boolean;
};

const buildCachedHlsPlaylist = async (
  items: Array<{ track_id: number; file_path: string; artist_name: string | null; title: string }>,
  baseUrl: string,
  token: string,
  elapsedSeconds: number | null
) : Promise<CachedPlaylistResult> => {
  if (items.length === 0) {
    return { playlist: null, missing: [], isComplete: false };
  }
  const tokenParam = encodeURIComponent(token);
  const segmentUrl = (trackId: number, segment: string, cacheBuster?: string) => {
    const url = `${baseUrl}/api/tracks/${trackId}/hls/${encodeURIComponent(segment)}?token=${tokenParam}`;
    return cacheBuster ? `${url}&v=${encodeURIComponent(cacheBuster)}` : url;
  };
  type SegmentEntry = {
    duration: number;
    uri: string;
    trackId: number;
    mapLine: string | null;
  };
  let maxTargetDuration = hlsSegmentDurationSeconds;
  let totalDurationSeconds = 0;
  const segments: SegmentEntry[] = [];
  const missing: Array<{ track_id: number; file_path: string }> = [];
  for (const item of items) {
    const parsed = await readTrackHlsPlaylist(item.file_path, item.track_id);
    if (!parsed) {
      missing.push({ track_id: item.track_id, file_path: item.file_path });
      continue;
    }
    maxTargetDuration = Math.max(maxTargetDuration, parsed.targetDuration);
    // Keep the original map line as a template; we rewrite the URI when rendering
    // so we can include stable cache-busting params for strict HLS clients.
    const mapLine = parsed.mapLine ?? null;
    for (const segment of parsed.segments) {
      totalDurationSeconds += segment.duration;
      segments.push({
        duration: segment.duration,
        uri: segment.uri,
        trackId: item.track_id,
        mapLine
      });
    }
  }
  if (segments.length === 0) {
    return { playlist: null, missing, isComplete: false };
  }
  const isLive = typeof elapsedSeconds === "number";
  let windowStartIndex = 0;
  let windowEndIndex = segments.length;
  let loopIndex = 0;
  let endOffsetSeconds = 0;
  if (totalDurationSeconds > 0 && isLive) {
    loopIndex = Math.floor(elapsedSeconds / totalDurationSeconds);
    endOffsetSeconds = Math.max(0, elapsedSeconds % totalDurationSeconds);
    const windowStartOffset = Math.max(0, endOffsetSeconds - hlsRestreamWindowSeconds);
    let cursor = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const next = cursor + segments[i].duration;
      if (windowStartOffset < next) {
        windowStartIndex = i;
        break;
      }
      cursor = next;
    }
    cursor = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const next = cursor + segments[i].duration;
      if (endOffsetSeconds <= next) {
        windowEndIndex = i + 1;
        break;
      }
      cursor = next;
    }
    if (windowEndIndex <= windowStartIndex) {
      windowEndIndex = Math.min(windowStartIndex + 1, segments.length);
    }
  }
  const bodyLines: string[] = [];
  let lastTrackId: number | null = null;
  let discontinuitySequence = 0;
  let preStartLastTrackId: number | null = null;

  // For "live looping" we must keep MEDIA-SEQUENCE monotonic; otherwise many
  // third-party HLS ingest clients will drop when the sequence jumps backward.
  // We compute a virtual global sequence based on completed loops.
  const mediaSequence = isLive ? loopIndex * segments.length + windowStartIndex : windowStartIndex;

  // Discontinuity sequence should also be monotonic when looping.
  // Count discontinuities in a full loop (track changes between consecutive segments).
  let fullLoopDiscontinuities = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].trackId !== segments[i - 1].trackId) {
      fullLoopDiscontinuities += 1;
    }
  }
  // Add one discontinuity per loop for the wrap-around from end -> start.
  const baseLoopDiscontinuities = isLive && loopIndex > 0 ? loopIndex * (fullLoopDiscontinuities + 1) : 0;

  for (let i = 0; i < windowStartIndex; i += 1) {
    const trackId = segments[i]?.trackId ?? null;
    if (trackId === null) continue;
    if (preStartLastTrackId !== null && trackId !== preStartLastTrackId) {
      discontinuitySequence += 1;
    }
    preStartLastTrackId = trackId;
  }
  discontinuitySequence += baseLoopDiscontinuities;

  // If we are right after a wrap-around, explicitly mark a discontinuity once
  // so strict HLS clients don't assume continuity across loops.
  if (isLive && loopIndex > 0 && windowStartIndex === 0 && endOffsetSeconds < hlsPlaylistWindowSeconds) {
    bodyLines.push("#EXT-X-DISCONTINUITY");
  }

  for (let i = windowStartIndex; i < windowEndIndex; i += 1) {
    const segment = segments[i];
    if (lastTrackId !== segment.trackId) {
      if (lastTrackId !== null) {
        bodyLines.push("#EXT-X-DISCONTINUITY");
      }
      if (segment.mapLine) {
        const mapCacheBuster = isLive ? `init-${segment.trackId}-${loopIndex}` : undefined;
        const rewrittenMap = segment.mapLine.replace(
          /URI="[^"]*"/,
          `URI="${segmentUrl(segment.trackId, "init.mp4", mapCacheBuster)}"`
        );
        bodyLines.push(rewrittenMap);
      }
      lastTrackId = segment.trackId;
    }
    bodyLines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
    const globalSeq = mediaSequence + (i - windowStartIndex);
    const segCacheBuster = isLive ? `seg-${globalSeq}` : undefined;
    bodyLines.push(segmentUrl(segment.trackId, segment.uri, segCacheBuster));
  }
  const header = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${Math.ceil(maxTargetDuration)}`,
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`
  ];
  if (discontinuitySequence > 0) {
    header.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${discontinuitySequence}`);
  }
  if (!isLive && missing.length === 0) {
    header.push("#EXT-X-PLAYLIST-TYPE:VOD");
    return {
      playlist: [...header, ...bodyLines, "#EXT-X-ENDLIST"].join("\n"),
      missing,
      isComplete: true
    };
  }
  return {
    playlist: [...header, ...bodyLines].join("\n"),
    missing,
    isComplete: false
  };
};
const getStreamPidPath = (streamId: number) => path.join(hlsRootDir, `stream-${streamId}.pid`);

type StreamPidInfo = {
  pid: number;
  dir: string;
  updatedAt: string;
};

const readStreamPidInfo = async (streamId: number): Promise<StreamPidInfo | null> => {
  try {
    const raw = await fsPromises.readFile(getStreamPidPath(streamId), "utf8");
    const parsed = JSON.parse(raw) as StreamPidInfo;
    if (!parsed || typeof parsed.pid !== "number" || !parsed.dir) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeStreamPidInfo = async (streamId: number, pid: number, dir: string) => {
  await ensureHlsRootDir();
  const payload: StreamPidInfo = { pid, dir, updatedAt: new Date().toISOString() };
  await fsPromises.writeFile(getStreamPidPath(streamId), JSON.stringify(payload));
};

const clearStreamPidInfo = async (streamId: number, pid?: number) => {
  const info = await readStreamPidInfo(streamId);
  if (!info) return;
  if (typeof pid === "number" && info.pid !== pid) {
    return;
  }
  try {
    await fsPromises.unlink(getStreamPidPath(streamId));
  } catch {
    // ignore
  }
};

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code !== "ESRCH";
  }
};

const isFfmpegForStream = async (pid: number, dir: string) => {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "command=", "-p", String(pid)]);
    const command = stdout.trim();
    if (!command) return false;
    return command.includes("ffmpeg") && command.includes(dir);
  } catch {
    return false;
  }
};

const killOrphanedStreamPid = async (streamId: number) => {
  const info = await readStreamPidInfo(streamId);
  if (!info) return;
  if (!isProcessAlive(info.pid)) {
    await clearStreamPidInfo(streamId);
    return;
  }
  const matches = await isFfmpegForStream(info.pid, info.dir);
  if (!matches) {
    return;
  }
  try {
    process.kill(info.pid, "SIGTERM");
  } catch {
    // ignore
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (isProcessAlive(info.pid)) {
    try {
      process.kill(info.pid, "SIGKILL");
    } catch {
      // ignore
    }
  }
  await clearStreamPidInfo(streamId, info.pid);
};


const getClientIp = (req: Request) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
};

const getClientUserAgent = (req: Request) => {
  const userAgent = req.headers["user-agent"];
  return typeof userAgent === "string" && userAgent.trim() ? userAgent : null;
};

const getStreamClientMap = (streamId: number) => {
  const existing = streamClients.get(streamId);
  if (existing) return existing;
  const created = new Map<string, StreamClientInfo>();
  streamClients.set(streamId, created);
  return created;
};

const registerStreamClient = (
  streamId: number,
  req: Request,
  options: { res?: Response; path?: string; persistent?: boolean } = {}
) => {
  const now = Date.now();
  const ip = getClientIp(req);
  const userAgent = getClientUserAgent(req);
  const id = `${ip}::${userAgent ?? "unknown"}`;
  const clientMap = getStreamClientMap(streamId);
  const existing = clientMap.get(id);
  const expired = existing ? now - existing.lastSeen > clientTimeoutMs : false;
  const info: StreamClientInfo =
    existing ?? {
      id,
      ip,
      userAgent,
      connectedSince: now,
      lastSeen: now,
      lastPath: null,
      activeConnectionCount: 0
    };
  if (!existing || expired) {
    info.connectedSince = now;
  }
  info.lastSeen = now;
  info.lastPath = options.path ?? req.originalUrl ?? req.path;
  if (options.persistent) {
    if (info.activeConnectionCount === 0) {
      info.connectedSince = now;
    }
    info.activeConnectionCount += 1;
    if (options.res) {
      options.res.on("close", () => {
        const current = clientMap.get(id);
        if (!current) return;
        current.activeConnectionCount = Math.max(0, current.activeConnectionCount - 1);
        current.lastSeen = Date.now();
      });
    }
  }
  clientMap.set(id, info);
};

export const getActiveConnectionsCount = () => {
  let total = 0;
  for (const streamId of streamClients.keys()) {
    total += getActiveStreamClients(streamId).length;
  }
  return total;
};

const getActiveStreamClients = (streamId: number) => {
  const clientMap = streamClients.get(streamId);
  if (!clientMap) return [];
  const now = Date.now();
  for (const [id, client] of clientMap.entries()) {
    if (client.activeConnectionCount > 0) {
      continue;
    }
    if (now - client.lastSeen > clientTimeoutMs) {
      clientMap.delete(id);
    }
  }
  if (clientMap.size === 0) {
    streamClients.delete(streamId);
    return [];
  }
  return Array.from(clientMap.values()).sort((a, b) => b.lastSeen - a.lastSeen);
};


const streamDirectFile = (filePath: string, req: Request, res: Response) => {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  if (fileSize <= 0) {
    res.status(404).json({ error: "Track media not ready" });
    return;
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
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => recordStreamBandwidth(chunk.length));
    stream.pipe(res as unknown as NodeJS.WritableStream);
  };

  if (range && typeof range === "string") {
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
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("data", (chunk) => recordStreamBandwidth(chunk.length));
    stream.pipe(res as unknown as NodeJS.WritableStream);
    return;
  }

  sendFull();
};

const streamTranscodedFile = (filePath: string, res: Response, encoding: typeof encodingOptions[number]) => {
  const stat = fs.statSync(filePath);
  if (stat.size <= 0) {
    res.status(404).json({ error: "Track media not ready" });
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", "video/mp4");

  const args = ["-hide_banner", "-loglevel", "error", "-i", filePath];
  if (encoding === "copy") {
    args.push("-c", "copy");
  } else if (encoding === "web") {
    args.push(
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "160k"
    );
  } else {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "192k"
    );
  }
  args.push("-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1");

  const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  ffmpeg.stdout.on("data", (chunk) => recordStreamBandwidth(chunk.length));
  ffmpeg.stdout.pipe(res as unknown as NodeJS.WritableStream);

  const cleanup = () => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
  };
  res.on("close", cleanup);
  ffmpeg.on("error", cleanup);
  ffmpeg.on("close", (code) => {
    if (code && code !== 0 && !res.headersSent) {
      res.status(500).json({ error: stderr.trim() || "Transcoding failed" });
    }
  });
};

const streamFile = (
  filePath: string,
  req: Request,
  res: Response,
  encoding: typeof encodingOptions[number]
) => {
  if (encoding === "original") {
    return streamDirectFile(filePath, req, res);
  }
  return streamTranscodedFile(filePath, res, encoding);
};

const shuffleArray = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// ffconcat is parsed by FFmpeg (not a shell), so keep quoting simple.
// We avoid `file:` URLs here because some FFmpeg builds behave differently with nested protocols
// and can fail to detect streams, causing "Output file does not contain any stream".
const escapeFfconcatPath = (value: string) => value.replace(/'/g, "\\'");
const toConcatEntry = (filePath: string) => `file '${escapeFfconcatPath(filePath)}'`;
const buildConcatBody = (items: Array<{ file_path: string }>) =>
  ["ffconcat version 1.0", ...items.map((item) => toConcatEntry(item.file_path))].join("\n");
const isUsableMediaFile = (filePath: string | null | undefined) => {
  if (!filePath) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
};

const getStreamOnlineSince = (stream: {
  restarted_at: string | null;
  updated_at: string;
  created_at: string;
}) => stream.restarted_at ?? stream.updated_at ?? stream.created_at;

const getStreamElapsedSeconds = (stream: {
  restarted_at: string | null;
  updated_at: string;
  created_at: string;
}) => {
  const onlineSince = getStreamOnlineSince(stream);
  const baseTime = new Date(onlineSince).getTime();
  if (!Number.isFinite(baseTime)) {
    return 0;
  }
  return Math.max(0, (Date.now() - baseTime) / 1000);
};

const getFfmpegUptimeSeconds = (streamId: number) => {
  const session = hlsSessions.get(streamId);
  if (!session || session.stopped) return null;
  if (!session.currentProcess || session.processStartedAt === null) return null;
  return Math.max(0, Math.floor((Date.now() - session.processStartedAt) / 1000));
};

const normalizeDurationSeconds = (duration: number | null) =>
  typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : 0;

const buildStreamPlaybackPlan = <T extends { file_path: string; artist_name: string | null }>(
  stream: { shuffle: boolean; restarted_at: string | null; updated_at: string; created_at: string },
  items: T[]
) => {
  const seedBase = new Date(getStreamOnlineSince(stream)).getTime();
  const seededRandom = createSeededRandom(Math.floor(seedBase / 1000));
  const ordered = orderStreamItems(items, stream.shuffle, seededRandom);
  // Skip offset calculation - always start from track 0 for simplicity
  return {
    ordered,
    startOffsetSeconds: 0
  };
};

const orderStreamItems = <T extends { artist_name: string | null }>(
  items: T[],
  shuffle: boolean,
  random: () => number = Math.random
) => {
  if (!shuffle) {
    return items;
  }
  const byArtist = new Map<string, T[]>();
  for (const item of items) {
    const key = (item.artist_name ?? "unknown").toLowerCase();
    const bucket = byArtist.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      byArtist.set(key, [item]);
    }
  }
  const shuffleWith = (list: T[]) => {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
  for (const [artist, bucket] of byArtist) {
    byArtist.set(artist, shuffleWith(bucket));
  }

  const result: T[] = [];
  let lastArtist: string | null = null;
  const pickArtist = () => {
    const available = Array.from(byArtist.entries()).filter(([, bucket]) => bucket.length > 0);
    if (available.length === 0) return null;
    const maxCount = Math.max(...available.map(([, bucket]) => bucket.length));
    const maxCandidates = available.filter(([, bucket]) => bucket.length === maxCount);
    let candidates = maxCandidates.filter(([artist]) => artist !== lastArtist);
    if (candidates.length === 0) {
      candidates = available.filter(([artist]) => artist !== lastArtist);
    }
    if (candidates.length === 0) {
      candidates = maxCandidates;
    }
    return candidates[Math.floor(random() * candidates.length)] ?? null;
  };

  while (result.length < items.length) {
    const choice = pickArtist();
    if (!choice) break;
    const [artist, bucket] = choice;
    const next = bucket.shift();
    if (!next) {
      byArtist.delete(artist);
      continue;
    }
    result.push(next);
    lastArtist = artist;
  }

  return result.length > 0 ? result : items;
};

const createSeededRandom = (seed: number) => {
  let t = seed + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const streamConcatenated = (
  items: Array<{ file_path: string }>,
  res: Response,
  encoding: typeof encodingOptions[number],
  options: { loop?: boolean; realtime?: boolean; startOffsetSeconds?: number } = {}
) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", "video/mp4");

  const body = buildConcatBody(items);

  // Force transcoding for continuous streams to ensure codec consistency across tracks
  const actualEncoding =
    encoding === "original" || encoding === "copy"
      ? options.loop || options.realtime
        ? "web"
        : "copy"
      : encoding;
  const tempDir = options.loop ? fs.mkdtempSync(path.join(os.tmpdir(), "mudarr-concat-")) : null;
  const listPath = tempDir ? path.join(tempDir, "stream.ffconcat") : null;
  if (listPath) {
    fs.writeFileSync(listPath, body);
  }
  const args = [
    "-hide_banner",
    "-loglevel",
    "error"
  ];
  if (options.realtime) {
    args.push("-re");
  }
  if (options.loop) {
    args.push("-stream_loop", "-1");
  }
  args.push(
    "-f",
    "concat",
    "-safe",
    "0",
    "-fflags",
    "+genpts+discardcorrupt",
    "-err_detect",
    "ignore_err",
    "-protocol_whitelist",
    "file,pipe,crypto,data",
    "-i",
    listPath ?? "pipe:0"
  );
  if (listPath && options.startOffsetSeconds && options.startOffsetSeconds > 0) {
    args.push("-ss", options.startOffsetSeconds.toFixed(3));
  }
  if (actualEncoding === "copy") {
    args.push("-c", "copy");
  } else if (actualEncoding === "web") {
    // CPU encoding optimized for lower CPU usage
    args.push(
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-tune",
      "zerolatency",
      "-c:a",
      "aac",
      "-b:a",
      "128k"
    );
  } else {
    // CPU encoding optimized for lower CPU usage
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-tune",
      "zerolatency",
      "-c:a",
      "aac",
      "-b:a",
      "160k"
    );
  }
  args.push(
    "-max_muxing_queue_size", "1024",
    "-max_interleave_delta", "0",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1"
  );

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: [listPath ? "ignore" : "pipe", "pipe", "pipe"]
  });
  let stderr = "";
  if (ffmpeg.stderr) {
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  }
  if (ffmpeg.stdout) {
  ffmpeg.stdout.pipe(res as unknown as NodeJS.WritableStream);
  }
  if (!listPath && ffmpeg.stdin) {
  ffmpeg.stdin.write(body);
  ffmpeg.stdin.end();
  }

  const cleanupTemp = () => {
    if (!tempDir) return;
    fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  };

  const cleanup = () => {
    cleanupTemp();
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
  };

  res.on("close", cleanup);
  ffmpeg.on("error", cleanup);
  ffmpeg.on("close", (code) => {
    if (code && code !== 0 && !res.headersSent) {
      res.status(500).json({ error: stderr.trim() || "Transcoding failed" });
    }
    cleanup();
  });
};

const stopHlsSession = async (
  streamId: number,
  targetSession?: HlsSession,
  reason = "unknown"
) => {
  const session = hlsSessions.get(streamId);
  if (!session) return;
  if (targetSession && session !== targetSession) {
    return;
  }
  console.log(`Stream ${streamId}: stopping HLS session (${reason})`);
  session.stopped = true;
  if (session.currentProcess && !session.currentProcess.killed) {
    session.currentProcess.kill("SIGKILL");
  }
  if (session.currentProcess?.pid) {
    await clearStreamPidInfo(streamId, session.currentProcess.pid);
  }
  session.processStartedAt = null;
  hlsSessions.delete(streamId);
  try {
    await fsPromises.rm(session.dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const hlsIdleTimeoutMsRaw = Number(process.env.HLS_IDLE_TIMEOUT_MS ?? 15 * 60_000);
const hlsIdleTimeoutMs =
  Number.isFinite(hlsIdleTimeoutMsRaw) ? Math.floor(hlsIdleTimeoutMsRaw) : 15 * 60_000;
const hlsIdleSweepEnabled = hlsIdleTimeoutMs > 0;
const hlsSweepIntervalMsRaw = Number(process.env.HLS_SWEEP_INTERVAL_MS ?? 15_000);
const hlsSweepIntervalMs =
  Number.isFinite(hlsSweepIntervalMsRaw) && hlsSweepIntervalMsRaw > 0
    ? hlsSweepIntervalMsRaw
    : 15_000;
const hlsLiveReadyTimeoutMsRaw = Number(process.env.HLS_LIVE_READY_TIMEOUT_MS ?? 20_000);
const hlsLiveReadyTimeoutMs =
  Number.isFinite(hlsLiveReadyTimeoutMsRaw) && hlsLiveReadyTimeoutMsRaw > 0
    ? Math.floor(hlsLiveReadyTimeoutMsRaw)
    : 20_000;

// Prevent orphaned/idle stream generators from running forever.
// Any request to the HLS session playlist/segments refreshes `lastAccess`.
if (hlsIdleSweepEnabled) {
  setInterval(() => {
    const now = Date.now();
    for (const [streamId, session] of hlsSessions.entries()) {
      if (session.stopped) continue;
      if (now - session.lastAccess > hlsIdleTimeoutMs) {
        void stopHlsSession(streamId, session, "idle-timeout");
      }
    }
  }, hlsSweepIntervalMs).unref?.();
}

const findNextSegmentIndex = async (dir: string, fallback: number) => {
  try {
    const entries = await fsPromises.readdir(dir);
    let maxIndex = fallback - 1;
    for (const entry of entries) {
      // Support both fMP4 (`.m4s`) and MPEG-TS (`.ts`) segment types.
      // If this doesn't match the current segment type, we may incorrectly restart at 0
      // on generator restarts, causing playlists to stop advancing for clients.
      const match = entry.match(/^segment-(\d+)\.(?:m4s|ts)$/);
      if (match) {
        const value = Number(match[1]);
        if (!Number.isNaN(value)) {
          maxIndex = Math.max(maxIndex, value);
        }
      }
    }
    return maxIndex + 1;
  } catch {
    return fallback;
  }
};

/**
 * Check if all tracks have compatible H.264/AAC codecs for copy mode
 */
const checkTracksCodecCompatibility = async (
  items: Array<{ file_path: string }>
): Promise<boolean> => {
  if (items.length === 0) return false;
  
  try {
    // Check first few files to see if they're all H.264/AAC
    const samplesToCheck = Math.min(3, items.length);
    const checks = await Promise.all(
      items.slice(0, samplesToCheck).map(async (item) => {
        return new Promise<boolean>((resolve) => {
          let resolved = false;
          const finish = (value: boolean) => {
            if (resolved) return;
            resolved = true;
            resolve(value);
          };
          const timeout = setTimeout(() => {
            console.warn(
              `Stream codec check: ffprobe timed out for ${item.file_path}; falling back to transcode`
            );
            finish(false);
          }, 3000);
          const ffprobe = spawn("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name",
            "-of",
            "json",
            item.file_path
          ]);
          
          let output = "";
          if (ffprobe.stdout) {
            ffprobe.stdout.on("data", (chunk) => {
              output += chunk.toString();
            });
          }
          
          ffprobe.on("error", (error) => {
            clearTimeout(timeout);
            console.warn(
              `Stream codec check: ffprobe failed for ${item.file_path}; falling back to transcode`,
              error
            );
            finish(false);
          });
          
          ffprobe.on("close", () => {
            clearTimeout(timeout);
            try {
              const result = JSON.parse(output);
              const streams = result.streams || [];
              const videoCodec = streams.find((s: any) => s.codec_type === "video")?.codec_name;
              const audioCodec = streams.find((s: any) => s.codec_type === "audio")?.codec_name;

              // Check if video is H.264 and audio is AAC
              const compatible =
                (videoCodec ? videoCodec === "h264" : true) &&
                (audioCodec ? audioCodec === "aac" : true);
              finish(compatible);
            } catch {
              finish(false);
            }
          });
        });
      })
    );
    
    return checks.every((compatible) => compatible);
  } catch {
    return false;
  }
};

const resolveHlsEncoding = async (
  streamId: number,
  encoding: typeof encodingOptions[number],
  items: Array<{ file_path: string }>
) => {
  if (encoding === "original" || encoding === "copy") {
    const compatible = await checkTracksCodecCompatibility(items);
    if (!compatible) {
      console.warn(
        `Stream ${streamId}: HLS copy mode disabled (incompatible codecs detected), falling back to web`
      );
      return "web" as const;
    }
  }
  return encoding;
};

const runHlsConcatenated = async (
  session: HlsSession,
  items: Array<{ file_path: string }>,
  encoding: typeof encodingOptions[number],
  startOffsetSeconds = 0
) : Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
  const listPath = path.join(session.dir, "stream.ffconcat");
  const concatBody = buildConcatBody(items);
  await fsPromises.writeFile(listPath, concatBody);
  
  // Debug: log the concat file to see what we're feeding ffmpeg
  console.log(`Stream ${session.dir}: Concat file has ${items.length} items`);
  console.log(`Stream ${session.dir}: First 500 chars of concat:\n${concatBody.substring(0, 500)}`);
  
  // All downloads are H.264/AAC MP4, so copy mode is safe for original/copy
  let actualEncoding = encoding;
  if (encoding === "original" || encoding === "copy") {
    actualEncoding = "copy";
  }

  const hlsFfmpegLogLevel = (process.env.HLS_FFMPEG_LOGLEVEL ?? "error").trim() || "error";
  const hlsX264Profile = (process.env.HLS_X264_PROFILE ?? "baseline").trim();
  const hlsX264Level = (process.env.HLS_X264_LEVEL ?? "4.1").trim();
  
  const protocolWhitelist = (process.env.HLS_FFMPEG_PROTOCOL_WHITELIST ?? "").trim();

  const args = [
    "-hide_banner",
    "-loglevel",
    hlsFfmpegLogLevel,
    "-f",
    "concat",
    "-safe",
    "0",
    "-fflags",
    "+genpts+discardcorrupt",
    "-err_detect",
    "ignore_err",
  ];
  if (protocolWhitelist) {
    args.push("-protocol_whitelist", protocolWhitelist);
  }
  
  // For copy mode with seeking, put -ss BEFORE -i for better compatibility
  if (actualEncoding === "copy" && startOffsetSeconds > 0) {
    args.push("-ss", startOffsetSeconds.toFixed(3));
  }
  
  // Real-time output for live streaming (input option)
  args.push("-re");

  args.push("-i", listPath);

  // For transcode mode, put -ss AFTER -i for accuracy
  if (actualEncoding !== "copy" && startOffsetSeconds > 0) {
    args.push("-ss", startOffsetSeconds.toFixed(3));
  }
  
  // Encoding modes: copy = no transcode, web/transcode = re-encode
  if (actualEncoding === "copy") {
    // Just copy streams - no transcoding, minimal CPU!
    args.push("-c", "copy");
  } else if (actualEncoding === "web") {
    // CPU encoding optimized for lower CPU usage
    args.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-tune",
      "zerolatency",
      "-c:a",
      "aac",
      "-b:a",
      "128k"
    );
    if (hlsX264Profile) {
      args.push("-profile:v", hlsX264Profile);
    }
    if (hlsX264Level) {
      args.push("-level", hlsX264Level);
    }
  } else {
    // CPU encoding optimized for lower CPU usage
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-tune",
      "zerolatency",
      "-c:a",
      "aac",
      "-b:a",
      "160k"
    );
    if (hlsX264Profile) {
      args.push("-profile:v", hlsX264Profile);
    }
    if (hlsX264Level) {
      args.push("-level", hlsX264Level);
    }
  }

  // Be explicit about mapping. This avoids edge cases where FFmpeg selects no streams.
  args.push("-map", "0:v?", "-map", "0:a?");

  if (actualEncoding !== "copy") {
    // Align segment boundaries to forced keyframes for stable HLS playback.
    args.push("-force_key_frames", hlsForceKeyFrameExpr, "-sc_threshold", "0");
  }
  args.push("-max_muxing_queue_size", "2048", "-muxpreload", "0", "-muxdelay", "0");

  // fMP4 HLS is the default: stable and broadly supported by modern players/ffmpeg.
  // TS segments can be enabled if needed via HLS_SEGMENT_TYPE=ts|mpegts.
  const segmentTypeRaw = (process.env.HLS_SEGMENT_TYPE ?? "fmp4").trim().toLowerCase();
  const useTs = segmentTypeRaw === "ts" || segmentTypeRaw === "mpegts" || segmentTypeRaw === "mpeg-ts";
  if (useTs) {
    if (actualEncoding === "copy") {
      // Remuxing H.264 from MP4 into MPEG-TS needs AnnexB format.
      args.push("-bsf:v", "h264_mp4toannexb");
    }
    args.push(
      "-f",
      "hls",
      "-hls_segment_type",
      "mpegts",
      "-hls_time",
      String(hlsSegmentDurationSeconds),
      "-hls_list_size",
      String(hlsListSize),
      "-hls_delete_threshold",
      String(hlsDeleteThreshold),
      "-hls_flags",
      hlsFlags,
      "-hls_segment_filename",
      path.join(session.dir, "segment-%06d.ts"),
      "-start_number",
      String(session.segmentIndex),
      path.join(session.dir, "playlist.m3u8")
    );
  } else {
    args.push(
      "-f",
      "hls",
      "-hls_segment_type",
      "fmp4",
      "-hls_time",
      String(hlsSegmentDurationSeconds),
      "-hls_list_size",
      String(hlsListSize),
      "-hls_delete_threshold",
      String(hlsDeleteThreshold),
      "-hls_flags",
      hlsFlags,
      "-hls_fmp4_init_filename",
      "init.mp4",
      "-hls_segment_filename",
      path.join(session.dir, "segment-%06d.m4s"),
      "-start_number",
      String(session.segmentIndex),
      path.join(session.dir, "playlist.m3u8")
    );
  }

  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    console.log(
      `Stream ${session.dir}: Starting HLS ffmpeg (${actualEncoding}) with offset ${startOffsetSeconds.toFixed(
        3
      )}s`
    );
    console.log(`Stream ${session.dir}: FFmpeg args: ${JSON.stringify(args)}`);
    const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    session.currentProcess = ffmpeg;
    session.processStartedAt = Date.now();
    if (typeof ffmpeg.pid === "number") {
      void writeStreamPidInfo(session.streamId, ffmpeg.pid, session.dir);
    }
    let resolved = false;
    const finalize = () => {
      if (resolved) return;
      resolved = true;
      session.currentProcess = null;
      session.processStartedAt = null;
      if (typeof ffmpeg.pid === "number") {
        void clearStreamPidInfo(session.streamId, ffmpeg.pid);
      }
      resolve({ code: null, signal: null });
    };
    if (ffmpeg.stderr) {
    ffmpeg.stderr.on("data", (chunk) => {
      console.error("HLS ffmpeg error", chunk.toString());
    });
    }
    ffmpeg.on("error", (error) => {
      console.error("HLS ffmpeg spawn failed", error);
      finalize();
    });
    ffmpeg.on("close", (code, signal) => {
      if (code !== 0) {
        console.warn(`HLS ffmpeg exited with code ${code ?? "unknown"} (${signal ?? "no signal"})`);
      } else {
        console.log(`Stream ${session.dir}: FFmpeg completed successfully`);
      }
      if (resolved) return;
      resolved = true;
      session.currentProcess = null;
      session.processStartedAt = null;
      if (typeof ffmpeg.pid === "number") {
        void clearStreamPidInfo(session.streamId, ffmpeg.pid);
      }
      resolve({ code: code ?? null, signal: (signal as NodeJS.Signals | null) ?? null });
    });
  });
};

const runHlsGenerator = async (
  streamId: number,
  session: HlsSession,
  encoding: typeof encodingOptions[number]
) => {
  console.log(`Stream ${streamId}: HLS generator starting (loop will run until stopped)`);
  let loopCount = 0;
  let failureStreak = 0;
  while (!session.stopped) {
    loopCount++;
    console.log(`Stream ${streamId}: HLS generator loop #${loopCount}`);
    
    session.segmentIndex = await findNextSegmentIndex(session.dir, session.segmentIndex);
    const startedAt = Date.now();
    const result = await runHlsConcatenated(
      session,
      session.ordered.map((item) => ({ file_path: item.file_path })),
      encoding,
      0
    );
    const ranForMs = Date.now() - startedAt;
    
    // If the session was stopped during ffmpeg run, exit immediately
    if (session.stopped) {
      break;
    }

    // If FFmpeg exits immediately without producing output, it's usually due to a bad first file
    // (unreadable/corrupt/unrecognized). Rotate the playlist to try a different first item and
    // avoid log/CPU thrashing.
    const quickFailure = (result.code && result.code !== 0 && ranForMs < 2000) || (result.code === null && ranForMs < 2000);
    if (quickFailure) {
      failureStreak += 1;
      const first = session.ordered.shift();
      if (first) {
        session.ordered.push(first);
      }
      const backoffMs = Math.min(10_000, 500 * failureStreak);
      console.warn(
        `Stream ${streamId}: FFmpeg failed quickly (code=${result.code ?? "unknown"}, ran=${ranForMs}ms). ` +
          `Rotating first item and retrying in ${backoffMs}ms (streak=${failureStreak}).`
      );
      if (failureStreak >= 10) {
        console.error(`Stream ${streamId}: too many consecutive FFmpeg failures; stopping session.`);
        await stopHlsSession(streamId, session, "ffmpeg-failed");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    failureStreak = 0;
    
    // Brief pause before restarting the playlist
    await new Promise((resolve) => setTimeout(resolve, 500));
    }
  console.log(`Stream ${streamId}: HLS generator stopped after ${loopCount} loops`);
  await stopHlsSession(streamId, session, "generator-exit");
};

const ensureHlsSession = async (
  stream: {
    id: number;
    status: typeof statusOptions[number];
    shuffle: boolean;
    encoding: typeof encodingOptions[number];
    restarted_at: string | null;
    updated_at: string;
    created_at: string;
  },
  items: Array<{ file_path: string; artist_name: string | null }>
) => {
  const existing = hlsSessions.get(stream.id);
  if (existing && !existing.stopped) {
    existing.lastAccess = Date.now();
    return existing;
  }

  await killOrphanedStreamPid(stream.id);
  const rootDir = await ensureHlsRootDir();
  const sessionDir = path.join(rootDir, `stream-${stream.id}`);
  await fsPromises.rm(sessionDir, { recursive: true, force: true });
  await fsPromises.mkdir(sessionDir, { recursive: true });

  const playback = buildStreamPlaybackPlan(stream, items);
  const resolvedEncoding = await resolveHlsEncoding(
    stream.id,
    stream.encoding,
    playback.ordered
  );
  const session: HlsSession = {
    sessionId: Date.now(),
    streamId: stream.id,
    dir: sessionDir,
    currentProcess: null,
    processStartedAt: null,
    lastAccess: Date.now(),
    stopped: false,
    segmentIndex: 0,
    encoding: resolvedEncoding,
    ordered: [...playback.ordered],
    startOffsetSeconds: 0,
    runner: null
  };
  hlsSessions.set(stream.id, session);
  
  // Start the generator immediately in the background
  session.runner = runHlsGenerator(stream.id, session, resolvedEncoding);
  console.log(`Stream ${stream.id}: HLS session created and generator started`);
  
  return session;
};

const waitForFile = async (filePath: string, timeoutMs = 8000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fsPromises.stat(filePath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
};

const waitForHlsPlaylistReady = async (
  sessionDir: string,
  timeoutMs = 8000,
  minSegments = 1
) => {
  const started = Date.now();
  const playlistPath = path.join(sessionDir, "playlist.m3u8");
  while (Date.now() - started < timeoutMs) {
    try {
      await fsPromises.stat(playlistPath);
      const body = await fsPromises.readFile(playlistPath, "utf8");
      if (body.includes("#EXT-X-MAP:")) {
        await fsPromises.stat(path.join(sessionDir, "init.mp4"));
      }
      const segmentCount = body
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#")).length;
      if (segmentCount >= minSegments) {
        return true;
      }
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
};

const waitForTrackHlsReady = async (
  filePath: string,
  trackId: number,
  timeoutMs = 8000
) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const parsed = await readTrackHlsPlaylist(filePath, trackId);
    if (parsed) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
};

const resolveTrackIds = async (options: {
  trackIds?: number[];
  artistIds?: number[];
  genreIds?: number[];
}) => {
  if (options.trackIds) {
    const trackIds = options.trackIds;
    if (trackIds.length === 0) {
      return [];
    }
    const validResult = await pool.query("SELECT id FROM tracks WHERE id = ANY($1::int[])", [
      trackIds
    ]);
    const validIds = new Set<number>(validResult.rows.map((row: { id: number }) => row.id));
    return trackIds.filter((id) => validIds.has(id));
  }

  const artistIds = options.artistIds ?? [];
  const genreIds = options.genreIds ?? [];
  if (artistIds.length === 0 && genreIds.length === 0) {
    return [];
  }

  const filters: string[] = [];
  const params: Array<number[]> = [];
  if (artistIds.length > 0) {
    params.push(artistIds);
    filters.push(`a.id = ANY($${params.length})`);
  }
  if (genreIds.length > 0) {
    params.push(genreIds);
    filters.push(`ag.genre_id = ANY($${params.length})`);
  }

  const result = await pool.query(
    `SELECT id
     FROM (
       SELECT t.id,
              a.name AS artist_name,
              al.year AS album_year,
              al.title AS album_title,
              t.track_no AS track_no,
              t.title AS track_title
       FROM tracks t
       JOIN albums al ON al.id = t.album_id
       JOIN artists a ON a.id = al.artist_id
       LEFT JOIN artist_genres ag ON ag.artist_id = a.id
       JOIN videos v ON v.track_id = t.id AND v.status = 'completed'
       WHERE v.file_path IS NOT NULL
         AND (${filters.join(" OR ")})
       GROUP BY t.id, a.name, al.year, al.title, t.track_no, t.title
     ) ranked
     ORDER BY artist_name ASC NULLS LAST,
              album_year ASC NULLS LAST,
              album_title ASC NULLS LAST,
              track_no ASC NULLS LAST,
              track_title ASC`,
    params
  );
  return result.rows.map((row: { id: number }) => row.id);
};

const insertStreamItems = async (
  streamId: number,
  trackIds: number[],
  queryRunner: { query: (text: string, params?: unknown[]) => Promise<unknown> } = pool
) => {
  if (trackIds.length === 0) {
    return;
  }
  const values: string[] = [];
  const params: Array<number> = [streamId];
  trackIds.forEach((trackId, index) => {
    const baseIndex = index * 2;
    values.push(`($1, $${baseIndex + 2}, $${baseIndex + 3})`);
    params.push(trackId, index);
  });
  await queryRunner.query(
    `INSERT INTO stream_items (stream_id, track_id, position) VALUES ${values.join(", ")}`,
    params
  );
};

const loadStream = async (streamId: number) => {
  const result = await pool.query(
    "SELECT id, name, icon, created_at, updated_at, status, shuffle, encoding, restarted_at FROM streams WHERE id = $1",
    [streamId]
  );
  return result.rows[0] as
    | {
        id: number;
        name: string;
        icon: string | null;
        created_at: string;
        updated_at: string;
        status: typeof statusOptions[number];
        shuffle: boolean;
        encoding: typeof encodingOptions[number];
        restarted_at: string | null;
      }
    | undefined;
};

const loadStreamArtistIds = async (streamId: number) => {
  const result = await pool.query(
    `SELECT DISTINCT al.artist_id AS id
     FROM stream_items si
     JOIN tracks t ON t.id = si.track_id
     JOIN albums al ON al.id = t.album_id
     WHERE si.stream_id = $1
       AND al.artist_id IS NOT NULL`,
    [streamId]
  );
  return result.rows.map((row: { id: number }) => row.id);
};

const loadStreamItems = async (streamId: number) => {
  const result = await pool.query(
    `SELECT si.id AS item_id,
            si.position,
            t.id AS track_id,
            t.title,
            al.title AS album_title,
            a.name AS artist_name,
            v.file_path AS file_path
     FROM stream_items si
     JOIN tracks t ON t.id = si.track_id
     LEFT JOIN albums al ON al.id = t.album_id
     LEFT JOIN artists a ON a.id = al.artist_id
     LEFT JOIN LATERAL (
       SELECT file_path
       FROM videos v
       WHERE v.track_id = t.id AND v.status = 'completed'
       ORDER BY v.id DESC
       LIMIT 1
     ) v ON true
     WHERE si.stream_id = $1
     ORDER BY si.position ASC, si.id ASC`,
    [streamId]
  );
  return result.rows as Array<{
    item_id: number;
    position: number;
    track_id: number;
    title: string;
    album_title: string | null;
    artist_name: string | null;
    file_path: string | null;
  }>;
};

const buildStreamResponse = async (stream: {
  id: number;
  name: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
  status: typeof statusOptions[number];
  shuffle: boolean;
  encoding: typeof encodingOptions[number];
  restarted_at: string | null;
}) => {
  const onlineSince = stream.restarted_at ?? stream.updated_at ?? stream.created_at;
  const onlineSeconds =
    stream.status === "active"
      ? getFfmpegUptimeSeconds(stream.id) ?? getStreamElapsedSeconds(stream)
      : null;
  const seedBase = onlineSince ? new Date(onlineSince).getTime() : Date.now();
  const seededRandom = createSeededRandom(Math.floor(seedBase / 1000));

  const items = await loadStreamItems(stream.id);
  const itemDetails = await Promise.all(
    items.map(async (item) => {
      if (!item.file_path) {
      return {
        id: item.item_id,
        position: item.position,
        track_id: item.track_id,
        title: item.title,
        album_title: item.album_title,
        artist_name: item.artist_name,
        available: false,
        bytes: null,
        duration: null,
        audio_codec: null,
        video_codec: null,
        video_width: null,
        video_height: null,
        bit_rate: null
      };
      }
      const info = await getMediaInfo(item.file_path);
      return {
        id: item.item_id,
        position: item.position,
        track_id: item.track_id,
        title: item.title,
        album_title: item.album_title,
        artist_name: item.artist_name,
        available: info.bytes !== null,
        bytes: info.bytes,
        duration: info.duration,
        audio_codec: info.audioCodec,
        video_codec: info.videoCodec,
        video_width: info.videoWidth,
        video_height: info.videoHeight,
        bit_rate: info.bitRate
      };
    })
  );

  let totalBytes = 0;
  let missingCount = 0;
  let durationSum = 0;
  let durationCount = 0;
  const audioCodecs = new Set<string>();
  const videoCodecs = new Set<string>();

  for (const item of itemDetails) {
    if (!item.available) {
      missingCount += 1;
      continue;
    }
    if (item.bytes !== null) {
      totalBytes += item.bytes;
    }
    if (item.duration !== null) {
      durationSum += item.duration;
      durationCount += 1;
    }
    if (item.audio_codec) {
      audioCodecs.add(item.audio_codec);
    }
    if (item.video_codec) {
      videoCodecs.add(item.video_codec);
    }
  }

  let currentTrack: {
    trackId: number;
    title: string;
    artistName: string | null;
    albumTitle: string | null;
  } | null = null;

  if (stream.status === "active" && onlineSeconds !== null) {
    const ordered = orderStreamItems(itemDetails, stream.shuffle, seededRandom);
    const totalDuration = ordered.reduce(
      (sum, item) => sum + (item.duration ?? 0),
      0
    );
    if (totalDuration > 0) {
      let offset = onlineSeconds % Math.floor(totalDuration);
      for (const item of ordered) {
        const duration = item.duration ?? 0;
        if (duration === 0) {
          continue;
        }
        if (offset < duration) {
          currentTrack = {
            trackId: item.track_id,
            title: item.title,
            artistName: item.artist_name,
            albumTitle: item.album_title
          };
          break;
        }
        offset -= duration;
      }
    }
  }

  const clients = getActiveStreamClients(stream.id);

  return {
    id: stream.id,
    name: stream.name,
    icon: stream.icon,
    created_at: stream.created_at,
    updated_at: stream.updated_at,
    status: stream.status,
    shuffle: stream.shuffle,
    encoding: stream.encoding,
    restarted_at: stream.restarted_at,
    onlineSeconds,
    currentTrack,
    itemCount: itemDetails.length,
    totalBytes,
    totalDuration: durationCount > 0 ? durationSum : null,
    missingCount,
    audioCodecs: Array.from(audioCodecs),
    videoCodecs: Array.from(videoCodecs),
    connections: clients.length,
    clients: clients.map((client) => ({
      ip: client.ip,
      userAgent: client.userAgent,
      connectedSince: new Date(client.connectedSince).toISOString(),
      lastSeen: new Date(client.lastSeen).toISOString(),
      lastPath: client.lastPath,
      activeConnections: client.activeConnectionCount
    })),
    items: itemDetails
  };
};

router.get("/tracks", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 30;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
  if (!query) {
    return res.json([]);
  }
  const like = `%${query}%`;
  const result = await pool.query(
    `SELECT t.id,
            t.title,
            al.title AS album_title,
            a.name AS artist_name
     FROM tracks t
     LEFT JOIN albums al ON al.id = t.album_id
     LEFT JOIN artists a ON a.id = al.artist_id
     LEFT JOIN LATERAL (
       SELECT file_path
       FROM videos v
       WHERE v.track_id = t.id AND v.status = 'completed'
       ORDER BY v.id DESC
       LIMIT 1
     ) v ON true
     WHERE v.file_path IS NOT NULL
       AND (t.title ILIKE $1 OR a.name ILIKE $1 OR al.title ILIKE $1)
     ORDER BY a.name ASC NULLS LAST, al.title ASC NULLS LAST, t.track_no ASC NULLS LAST, t.title ASC
     LIMIT $2`,
    [like, limit]
  );
  res.json(result.rows);
});

router.get("/", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, name, icon, created_at, updated_at, status, shuffle, encoding, restarted_at FROM streams ORDER BY created_at DESC"
  );
  const streams = await Promise.all(result.rows.map(buildStreamResponse));
  res.json(streams);
});

router.post("/", async (req, res) => {
  const parsed = createStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const name = parsed.data.name.trim();
  const encoding = parsed.data.encoding ?? "original";
  const shuffle = parsed.data.shuffle ?? false;
  const icon = parsed.data.icon?.trim() || null;
  const trackIds = await resolveTrackIds({
    trackIds: parsed.data.trackIds,
    artistIds: parsed.data.artistIds,
    genreIds: parsed.data.genreIds
  });
  if (trackIds.length === 0) {
    return res.status(400).json({ error: "No tracks found for stream" });
  }

  const insertResult = await pool.query(
    "INSERT INTO streams (name, icon, status, shuffle, encoding, created_at, updated_at, restarted_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW()) RETURNING id, name, icon, created_at, updated_at, status, shuffle, encoding, restarted_at",
    [name, icon, "active", shuffle, encoding]
  );
  const stream = insertResult.rows[0] as {
    id: number;
    name: string;
    icon: string | null;
    created_at: string;
    updated_at: string;
    status: typeof statusOptions[number];
    shuffle: boolean;
    encoding: typeof encodingOptions[number];
    restarted_at: string | null;
  };

  await insertStreamItems(stream.id, trackIds);

  const payload = await buildStreamResponse(stream);
  res.status(201).json(payload);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const parsed = updateStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const updates: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.name) {
    params.push(parsed.data.name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(parsed.data, "icon")) {
    const trimmedIcon = parsed.data.icon?.trim();
    params.push(trimmedIcon ? trimmedIcon : null);
    updates.push(`icon = $${params.length}`);
  }
  if (parsed.data.shuffle !== undefined) {
    params.push(parsed.data.shuffle);
    updates.push(`shuffle = $${params.length}`);
  }
  if (parsed.data.encoding) {
    params.push(parsed.data.encoding);
    updates.push(`encoding = $${params.length}`);
  }
  if (parsed.data.status) {
    params.push(parsed.data.status);
    updates.push(`status = $${params.length}`);
    if (parsed.data.status === "active") {
      updates.push("restarted_at = NOW()");
    }
    if (parsed.data.status === "stopped") {
      console.log(`Stream ${id}: status set to stopped via update`);
      await stopHlsSession(id, undefined, "update:status-stopped");
    }
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: "No updates provided" });
  }
  params.push(id);
  const result = await pool.query(
    `UPDATE streams
     SET ${updates.join(", ")}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING id, name, icon, created_at, updated_at, status, shuffle, encoding, restarted_at`,
    params
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Stream not found" });
  }
  const stream = result.rows[0] as {
    id: number;
    name: string;
    icon: string | null;
    created_at: string;
    updated_at: string;
    status: typeof statusOptions[number];
    shuffle: boolean;
    encoding: typeof encodingOptions[number];
    restarted_at: string | null;
  };
  if (stream.status === "active" && parsed.data.status === "active") {
    const items = await loadStreamItems(id);
    const availableItems = items.filter((item) => isUsableMediaFile(item.file_path)) as Array<{
      file_path: string;
      artist_name: string | null;
      track_id: number;
    }>;
    if (availableItems.length > 0) {
      // Start live HLS immediately; cache/queue work should not block the stream from starting.
      await ensureHlsSession(stream, availableItems);
      void Promise.all(
        availableItems.map((item) => clearTrackHlsCache(item.file_path, item.track_id))
      );
      void Promise.all(availableItems.map((item) => queueHlsSegmentJob(item.track_id, item.file_path)));
    }
  }
  const payload = await buildStreamResponse(stream);
  res.json(payload);
});

router.put("/:id/items", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const parsed = updateStreamItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const hasTrackIds = Object.prototype.hasOwnProperty.call(parsed.data, "trackIds");
  const hasArtistIds = (parsed.data.artistIds?.length ?? 0) > 0;
  const hasGenreIds = (parsed.data.genreIds?.length ?? 0) > 0;
  if (!hasTrackIds && !hasArtistIds && !hasGenreIds) {
    return res.status(400).json({ error: "No track selection provided" });
  }
  const trackIds = await resolveTrackIds({
    trackIds: parsed.data.trackIds,
    artistIds: parsed.data.artistIds,
    genreIds: parsed.data.genreIds
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT id FROM streams WHERE id = $1", [id]);
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Stream not found" });
    }
    await client.query("DELETE FROM stream_items WHERE stream_id = $1", [id]);
    await insertStreamItems(id, trackIds, client);
    await client.query("UPDATE streams SET updated_at = NOW() WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const stream = await loadStream(id);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  const payload = await buildStreamResponse(stream);
  res.json(payload);
});

router.post("/:id/actions", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const parsed = streamActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const action = parsed.data.action;
  const ip = getClientIp(req);
  const userAgent = getClientUserAgent(req);
  console.log(`Stream ${id}: action ${action} (ip=${ip}, ua=${userAgent ?? "unknown"})`);
  const updates: string[] = [];
  const params: unknown[] = [];
  if (action === "start") {
    params.push("active");
    updates.push(`status = $${params.length}`);
    updates.push("restarted_at = NOW()");
    await stopHlsSession(id, undefined, "action:start");
  } else if (action === "stop") {
    params.push("stopped");
    updates.push(`status = $${params.length}`);
    await stopHlsSession(id, undefined, "action:stop");
  } else if (action === "reboot") {
    params.push("active");
    updates.push(`status = $${params.length}`);
    updates.push("restarted_at = NOW()");
    await stopHlsSession(id, undefined, "action:reboot");
  }
  params.push(id);
  const result = await pool.query(
    `UPDATE streams
     SET ${updates.join(", ")}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING id, name, icon, created_at, updated_at, status, shuffle, encoding, restarted_at`,
    params
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Stream not found" });
  }
  const stream = result.rows[0] as {
    id: number;
    name: string;
    icon: string | null;
    created_at: string;
    updated_at: string;
    status: typeof statusOptions[number];
    shuffle: boolean;
    encoding: typeof encodingOptions[number];
    restarted_at: string | null;
  };
  if (stream.status === "active" && (action === "start" || action === "reboot")) {
    const items = await loadStreamItems(id);
    const availableItems = items.filter((item) => isUsableMediaFile(item.file_path)) as Array<{
      file_path: string;
      artist_name: string | null;
      track_id: number;
    }>;
    if (items.length === 0) {
      console.warn(`Stream ${id}: started but has 0 stream_items (no media to play)`);
    } else if (availableItems.length === 0) {
      const sample = items
        .map((item) => item.file_path)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .slice(0, 3);
      console.warn(
        `Stream ${id}: started but has no usable media files. ` +
          `This usually means missing volume mounts or stale file paths. ` +
          `Example file_path values: ${JSON.stringify(sample)}`
      );
    } else {
      console.log(`Stream ${id}: starting HLS with ${availableItems.length} playable items`);
    }
    if (availableItems.length > 0) {
      await ensureHlsSession(stream, availableItems);
      // Cache/queue in the background so Redis slowness doesn't block stream start.
      void Promise.all(
        availableItems.map((item) => clearTrackHlsCache(item.file_path, item.track_id))
      );
      void Promise.all(availableItems.map((item) => queueHlsSegmentJob(item.track_id, item.file_path)));
    }
  }
  const payload = await buildStreamResponse(stream);
  res.json(payload);
});

router.post("/:id/rescan", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const parsed = rescanStreamSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await loadStream(id);
  if (!existing) {
    return res.status(404).json({ error: "Stream not found" });
  }
  const requestedArtistIds = parsed.data.artistIds ?? [];
  const artistIds =
    requestedArtistIds.length > 0
      ? Array.from(new Set(requestedArtistIds))
      : await loadStreamArtistIds(id);
  if (artistIds.length === 0) {
    return res.status(400).json({ error: "No artists available for rescan" });
  }
  const trackIds = await resolveTrackIds({ artistIds });
  if (trackIds.length === 0) {
    return res.status(400).json({ error: "No tracks found for rescan" });
  }

  await stopHlsSession(id, undefined, "rescan");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT id FROM streams WHERE id = $1", [id]);
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Stream not found" });
    }
    await client.query("DELETE FROM stream_items WHERE stream_id = $1", [id]);
    await insertStreamItems(id, trackIds, client);
    await client.query(
      "UPDATE streams SET status = $1, updated_at = NOW(), restarted_at = NOW() WHERE id = $2",
      ["active", id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const stream = await loadStream(id);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  const items = await loadStreamItems(id);
  const availableItems = items.filter((item) => isUsableMediaFile(item.file_path)) as Array<{
    file_path: string;
    artist_name: string | null;
    track_id: number;
  }>;
  if (availableItems.length > 0) {
    await ensureHlsSession(stream, availableItems);
    void Promise.all(availableItems.map((item) => clearTrackHlsCache(item.file_path, item.track_id)));
    void Promise.all(availableItems.map((item) => queueHlsSegmentJob(item.track_id, item.file_path)));
  }
  const payload = await buildStreamResponse(stream);
  res.json(payload);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  await stopHlsSession(id, undefined, "delete");
  await pool.query("DELETE FROM streams WHERE id = $1", [id]);
  res.status(204).send();
});

router.get("/:id/playlist.m3u", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const stream = await loadStream(id);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  if (stream.status !== "active") {
    return res.status(409).json({ error: "Stream is stopped" });
  }
  registerStreamClient(id, req, { path: req.originalUrl ?? req.path });
  const items = await loadStreamItems(id);
  let availableItems = items.filter(
    (item) => item.file_path && fs.existsSync(item.file_path)
  );
  if (stream.shuffle) {
    const seedBase = new Date(stream.restarted_at ?? stream.updated_at ?? stream.created_at).getTime();
    const seededRandom = createSeededRandom(Math.floor(seedBase / 1000));
    availableItems = orderStreamItems(availableItems, true, seededRandom);
  }
  if (availableItems.length === 0) {
    return res.status(404).json({ error: "No downloadable tracks in this stream" });
  }
  const baseUrl = await getBaseUrl(req);
  const streamToken = (await getStreamToken()) ?? token;
  const lines = availableItems.map((item) => {
    const title = `${item.artist_name ?? "Unknown Artist"} - ${item.title}`.trim();
    return `#EXTINF:-1,${title}\n${baseUrl}/api/streams/${id}/items/${item.item_id}/stream?token=${streamToken}`;
  });
  res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="stream_${id}.m3u"`);
  res.send(["#EXTM3U", ...lines].join("\n"));
});

router.get("/:id/hls/playlist.m3u8", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const stream = await loadStream(id);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  if (stream.status !== "active") {
    return res.status(409).json({ error: "Stream is stopped" });
  }
  registerStreamClient(id, req, { path: req.originalUrl ?? req.path });
  const items = await loadStreamItems(id);
  const availableItems = items.filter((item) => isUsableMediaFile(item.file_path)) as Array<{
    file_path: string;
    artist_name: string | null;
    track_id: number;
    title: string;
  }>;
  if (availableItems.length === 0) {
    return res.status(404).json({ error: "No downloadable tracks in this stream" });
  }
  const playback = buildStreamPlaybackPlan(stream, availableItems);
  const baseUrl = await getBaseUrl(req);
  const elapsedSeconds = getStreamElapsedSeconds(stream);
  const cachedResult = await buildCachedHlsPlaylist(
    playback.ordered as Array<{
      track_id: number;
      file_path: string;
      artist_name: string | null;
      title: string;
    }>,
    baseUrl,
    token,
    elapsedSeconds
  );
  if (cachedResult.playlist) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    recordStreamBandwidth(Buffer.byteLength(cachedResult.playlist));
    return res.send(cachedResult.playlist);
  }
  if (cachedResult.missing.length > 0) {
    await Promise.all(
      cachedResult.missing.map((item) => queueHlsSegmentJob(item.track_id, item.file_path))
    );
  }
  if (playback.ordered.length > 0) {
    const first = playback.ordered[0] as { track_id: number; file_path: string };
    await waitForTrackHlsReady(first.file_path, first.track_id, 8000);
    const retryResult = await buildCachedHlsPlaylist(
      playback.ordered as Array<{
        track_id: number;
        file_path: string;
        artist_name: string | null;
        title: string;
      }>,
      baseUrl,
      token,
      elapsedSeconds
    );
    if (retryResult.playlist) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      recordStreamBandwidth(Buffer.byteLength(retryResult.playlist));
      return res.send(retryResult.playlist);
    }
  }
  return res.status(503).json({ error: "HLS cache not ready" });
});

router.get("/:id/hls/live.m3u8", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const ip = getClientIp(req);
  const userAgent = getClientUserAgent(req);
  console.log(`Stream ${id}: live.m3u8 requested (ip=${ip}, ua=${userAgent ?? "unknown"})`);
  const stream = await loadStream(id);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  if (stream.status !== "active") {
    return res.status(409).json({ error: "Stream is stopped" });
  }
  registerStreamClient(id, req, { path: req.originalUrl ?? req.path });
  const items = await loadStreamItems(id);
  const availableItems = items.filter((item) => isUsableMediaFile(item.file_path)) as Array<{
    file_path: string;
    artist_name: string | null;
  }>;
  if (availableItems.length === 0) {
    return res.status(404).json({ error: "No downloadable tracks in this stream" });
  }

  const ensureStart = Date.now();
  console.log(`Stream ${id}: ensuring HLS session (${availableItems.length} items)`);
  const session = await ensureHlsSession(stream, availableItems);
  console.log(
    `Stream ${id}: ensureHlsSession completed in ${Date.now() - ensureStart}ms ` +
      `(dir=${session.dir}, pid=${session.currentProcess?.pid ?? "none"})`
  );
  session.lastAccess = Date.now();
  const ready = await waitForHlsPlaylistReady(session.dir, hlsLiveReadyTimeoutMs, 1);
  if (!ready) {
    const pid = session.currentProcess?.pid;
    const uptime = getFfmpegUptimeSeconds(id);
    console.warn(
      `Stream ${id}: HLS session not ready after ${hlsLiveReadyTimeoutMs}ms ` +
        `(pid=${typeof pid === "number" ? pid : "none"}, uptime=${uptime ?? "n/a"}s, dir=${session.dir})`
    );
    return res.status(503).json({ error: "HLS session not ready" });
  }

  const playlistPath = path.join(session.dir, "playlist.m3u8");
  let body = "";
  try {
    body = await fsPromises.readFile(playlistPath, "utf8");
  } catch {
    return res.status(503).json({ error: "HLS session not ready" });
  }

  const baseUrl = await getBaseUrl(req);
  const tokenParam = encodeURIComponent(token);
  const segmentUrl = (segment: string) =>
    `${baseUrl}/api/streams/${id}/hls/${encodeURIComponent(segment)}?token=${tokenParam}`;

  const rewritten = body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#EXT-X-MAP:")) {
        return trimmed.replace(/URI="([^"]+)"/, (_match, uri) => `URI="${segmentUrl(uri)}"`);
      }
      if (trimmed.startsWith("#")) {
        return trimmed;
      }
      return segmentUrl(trimmed);
    })
    .join("\n");

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-store");
  recordStreamBandwidth(Buffer.byteLength(rewritten));
  return res.send(rewritten);
});

router.get("/:id/hls/:segment", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid stream id" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const stream = await loadStream(id);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  if (stream.status !== "active") {
    return res.status(409).json({ error: "Stream is stopped" });
  }
  const segment = req.params.segment;
  if (!/^[a-zA-Z0-9._-]+$/.test(segment)) {
    return res.status(400).json({ error: "Invalid segment" });
  }
  registerStreamClient(id, req, { path: req.originalUrl ?? req.path });
  let session = hlsSessions.get(id);
  if (!session) {
    const items = await loadStreamItems(id);
    const availableItems = items.filter((item) => isUsableMediaFile(item.file_path)) as Array<{
      file_path: string;
      artist_name: string | null;
    }>;
    if (availableItems.length === 0) {
      return res.status(404).json({ error: "No downloadable tracks in this stream" });
    }
    session = await ensureHlsSession(stream, availableItems);
  }
  session.lastAccess = Date.now();
  const segmentPath = path.join(session.dir, segment);
  if (!segmentPath.startsWith(session.dir)) {
    return res.status(400).json({ error: "Invalid segment" });
  }
  const ready = await waitForFile(segmentPath, 8000);
  if (!ready) {
    return res.status(404).json({ error: "Segment not found" });
  }
  try {
    const stats = await fsPromises.stat(segmentPath);
    if (!stats.isFile()) {
      return res.status(404).json({ error: "Segment not found" });
    }
    res.setHeader("Content-Length", stats.size);
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
  const segmentStream = fs.createReadStream(segmentPath);
  segmentStream.on("data", (chunk: Buffer) => recordStreamBandwidth(chunk.length));
  segmentStream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream segment" });
    }
  });
  res.on("close", () => {
    segmentStream.destroy();
  });
  segmentStream.pipe(res as unknown as NodeJS.WritableStream);
});

router.get("/:streamId/items/:itemId/stream", async (req, res) => {
  const streamId = Number(req.params.streamId);
  const itemId = Number(req.params.itemId);
  if (Number.isNaN(streamId) || Number.isNaN(itemId)) {
    return res.status(400).json({ error: "Invalid stream item" });
  }
  const token = await requireStreamToken(req, res);
  if (!token) {
    return;
  }
  const stream = await loadStream(streamId);
  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }
  if (stream.status !== "active") {
    return res.status(409).json({ error: "Stream is stopped" });
  }
  const result = await pool.query(
    `SELECT v.file_path AS file_path
     FROM stream_items si
     JOIN tracks t ON t.id = si.track_id
     LEFT JOIN LATERAL (
       SELECT file_path
       FROM videos v
       WHERE v.track_id = t.id AND v.status = 'completed'
       ORDER BY v.id DESC
       LIMIT 1
     ) v ON true
     WHERE si.id = $1 AND si.stream_id = $2`,
    [itemId, streamId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Stream item not found" });
  }
  const filePath = result.rows[0].file_path as string | null;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Track media not found" });
  }

  registerStreamClient(streamId, req, { res, persistent: true });
  streamFile(filePath, req, res, stream.encoding);
});

export default router;
