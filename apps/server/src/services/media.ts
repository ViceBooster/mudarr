import fsPromises from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MediaInfo = {
  bytes: number | null;
  duration: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  bitRate: number | null;
};

type CachedMediaInfo = {
  info: MediaInfo;
  loadedAt: number;
};

const mediaCacheTtlMs = 10 * 60 * 1000;
const mediaInfoCache = new Map<string, CachedMediaInfo>();

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const getMediaInfo = async (filePath: string): Promise<MediaInfo> => {
  const cached = mediaInfoCache.get(filePath);
  const now = Date.now();
  if (cached && now - cached.loadedAt < mediaCacheTtlMs) {
    return cached.info;
  }

  let bytes: number | null = null;
  try {
    const stat = await fsPromises.stat(filePath);
    if (stat.isFile()) {
      bytes = stat.size;
    }
  } catch {
    bytes = null;
  }

  let audioCodec: string | null = null;
  let videoCodec: string | null = null;
  let duration: number | null = null;
  let videoWidth: number | null = null;
  let videoHeight: number | null = null;
  let bitRate: number | null = null;

  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath
      ],
      { maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout || "{}") as {
      format?: { duration?: string; bit_rate?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        bit_rate?: string;
      }>;
    };
    const streams = parsed.streams ?? [];
    const audioStream = streams.find((stream) => stream.codec_type === "audio");
    const videoStream = streams.find((stream) => stream.codec_type === "video");
    audioCodec = audioStream?.codec_name ?? null;
    videoCodec = videoStream?.codec_name ?? null;
    videoWidth = toNumber(videoStream?.width);
    videoHeight = toNumber(videoStream?.height);
    if (parsed.format?.duration) {
      duration = toNumber(parsed.format.duration);
    }
    bitRate =
      toNumber(parsed.format?.bit_rate) ??
      toNumber(videoStream?.bit_rate) ??
      toNumber(audioStream?.bit_rate);
  } catch {
    audioCodec = null;
    videoCodec = null;
    duration = null;
    videoWidth = null;
    videoHeight = null;
    bitRate = null;
  }

  const info = { bytes, duration, audioCodec, videoCodec, videoWidth, videoHeight, bitRate };
  mediaInfoCache.set(filePath, { info, loadedAt: now });
  return info;
};
