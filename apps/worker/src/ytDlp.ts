import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const qualityFormat = (quality?: string | null) => {
  // Prefer MP4 (H.264/avc1) + M4A (AAC/mp4a) to keep files compatible with concat+copy streaming.
  // We still include broader fallbacks for edge cases; the worker will normalize incompatible outputs.
  const h264 = "[vcodec^=avc1]";
  const aac = "[acodec^=mp4a]";
  const mp4H264Video = `[ext=mp4]${h264}`;
  const m4aAacAudio = `[ext=m4a]${aac}`;
  const mp4H264Aac = `[ext=mp4]${h264}${aac}`;
  
  if (!quality) {
    return `bestvideo${mp4H264Video}+bestaudio${m4aAacAudio}/best${mp4H264Aac}/bestvideo${h264}+bestaudio${aac}/best[ext=mp4]/best`;
  }
  if (quality === "144p") {
    return `bestvideo[height<=144]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=144]${mp4H264Aac}/bestvideo[height<=144]${h264}+bestaudio${aac}/best[height<=144][ext=mp4]/best[height<=144]`;
  }
  if (quality === "240p") {
    return `bestvideo[height<=240]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=240]${mp4H264Aac}/bestvideo[height<=240]${h264}+bestaudio${aac}/best[height<=240][ext=mp4]/best[height<=240]`;
  }
  if (quality === "360p") {
    return `bestvideo[height<=360]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=360]${mp4H264Aac}/bestvideo[height<=360]${h264}+bestaudio${aac}/best[height<=360][ext=mp4]/best[height<=360]`;
  }
  if (quality === "480p") {
    return `bestvideo[height<=480]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=480]${mp4H264Aac}/bestvideo[height<=480]${h264}+bestaudio${aac}/best[height<=480][ext=mp4]/best[height<=480]`;
  }
  if (quality === "720p") {
    return `bestvideo[height<=720]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=720]${mp4H264Aac}/bestvideo[height<=720]${h264}+bestaudio${aac}/best[height<=720][ext=mp4]/best[height<=720]`;
  }
  if (quality === "1080p") {
    return `bestvideo[height<=1080]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=1080]${mp4H264Aac}/bestvideo[height<=1080]${h264}+bestaudio${aac}/best[height<=1080][ext=mp4]/best[height<=1080]`;
  }
  if (quality === "1440p") {
    return `bestvideo[height<=1440]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=1440]${mp4H264Aac}/bestvideo[height<=1440]${h264}+bestaudio${aac}/best[height<=1440][ext=mp4]/best[height<=1440]`;
  }
  if (quality === "2160p") {
    return `bestvideo[height<=2160]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=2160]${mp4H264Aac}/bestvideo[height<=2160]${h264}+bestaudio${aac}/best[height<=2160][ext=mp4]/best[height<=2160]`;
  }
  if (quality === "4320p") {
    return `bestvideo[height<=4320]${mp4H264Video}+bestaudio${m4aAacAudio}/best[height<=4320]${mp4H264Aac}/bestvideo[height<=4320]${h264}+bestaudio${aac}/best[height<=4320][ext=mp4]/best[height<=4320]`;
  }
  return `bestvideo${mp4H264Video}+bestaudio${m4aAacAudio}/best${mp4H264Aac}/bestvideo${h264}+bestaudio${aac}/best[ext=mp4]/best`;
};

const preferOfficialVideoQuery = (query: string) => {
  const normalized = query.trim();
  if (!normalized) return normalized;
  if (/official\s+video/i.test(normalized)) {
    return normalized;
  }
  return `${normalized} official video`;
};

const isYoutubeId = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value.trim());

const buildSearchTarget = (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^ytsearch/i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (isYoutubeId(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }
  return `ytsearch1:${preferOfficialVideoQuery(trimmed)}`;
};

const buildMetadataArgs = (query: string, options?: YtDlpOptions) => {
  const args = ["--dump-json", "--no-playlist", "--no-warnings", "--skip-download"];
  if (options?.cookiesPath) {
    args.push("--cookies", options.cookiesPath);
  } else if (options?.cookiesFromBrowser) {
    args.push("--cookies-from-browser", options.cookiesFromBrowser);
  } else if (options?.cookiesHeader) {
    const trimmed = options.cookiesHeader.trim();
    const headerValue = trimmed.toLowerCase().startsWith("cookie:")
      ? trimmed.slice(trimmed.indexOf(":") + 1).trim()
      : trimmed;
    const singleLineValue = headerValue.split(/\r?\n/)[0]?.trim();
    if (singleLineValue) {
      args.push("--add-header", `Cookie: ${singleLineValue}`);
    }
  }
  const searchTarget = buildSearchTarget(query);
  if (searchTarget) {
    args.push(searchTarget);
  }
  return args;
};

type YtDlpMetadata = {
  title: string | null;
  uploader: string | null;
  channel: string | null;
  uploaderId: string | null;
};

const parseMetadataFromDump = (output: string): YtDlpMetadata => {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const title = entry?.title ? String(entry.title) : null;
      const uploader = entry?.uploader ? String(entry.uploader) : null;
      const channel = entry?.channel ? String(entry.channel) : null;
      const uploaderId = entry?.uploader_id ? String(entry.uploader_id) : null;
      if (title || uploader || channel || uploaderId) {
        return { title, uploader, channel, uploaderId };
      }
    } catch {
      // ignore malformed lines
    }
  }
  return { title: null, uploader: null, channel: null, uploaderId: null };
};

const runYtDlpMetadata = async (args: string[]) => {
  const runOnce = (command: string, commandArgs: string[]) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        reject(error as NodeJS.ErrnoException);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        }
      });
    });

  try {
    return await runOnce(resolveYtDlpPath(), args);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }
    const python = process.env.YT_DLP_PYTHON?.trim() || "python3";
    return runOnce(python, ["-m", "yt_dlp", ...args]);
  }
};

export const resolveYtDlpMetadata = async (
  query: string,
  options?: YtDlpOptions
): Promise<{ metadata: YtDlpMetadata | null; error: string | null }> => {
  const envCookiesPath = process.env.YT_DLP_COOKIES?.trim() || null;
  const envCookiesFromBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim() || null;
  const cookiesPath =
    typeof options?.cookiesPath !== "undefined" ? options.cookiesPath : envCookiesPath;
  const cookiesFromBrowser =
    typeof options?.cookiesFromBrowser !== "undefined"
      ? options.cookiesFromBrowser
      : envCookiesFromBrowser;
  const cookiesHeader =
    typeof options?.cookiesHeader !== "undefined" ? options.cookiesHeader : null;
  const effectiveOptions: YtDlpOptions = { cookiesPath, cookiesFromBrowser, cookiesHeader };

  let lastError: string | null = null;
  const preferredQuery = preferOfficialVideoQuery(query);
  try {
    const output = await runYtDlpMetadata(buildMetadataArgs(preferredQuery, effectiveOptions));
    const metadata = parseMetadataFromDump(output);
    if (metadata.title || metadata.uploader || metadata.channel || metadata.uploaderId) {
      return { metadata, error: null };
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  if (preferredQuery !== query) {
    try {
      const output = await runYtDlpMetadata(buildMetadataArgs(query, effectiveOptions));
      const metadata = parseMetadataFromDump(output);
      if (metadata.title || metadata.uploader || metadata.channel || metadata.uploaderId) {
        return { metadata, error: null };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { metadata: null, error: lastError };
};

export const buildYtDlpArgs = (query: string, outputDir: string, quality?: string | null) => [
  "-f",
  qualityFormat(quality),
  "-o",
    path.join(outputDir, "%(title)s.%(ext)s"),
  buildSearchTarget(query)
];

type YtDlpOutputFormat = "original" | "mp4-remux" | "mp4-recode";

type YtDlpOptions = {
  cookiesPath?: string | null;
  cookiesFromBrowser?: string | null;
  cookiesHeader?: string | null;
  outputFormat?: YtDlpOutputFormat | null;
  outputTemplate?: string | null;
};

const normalizeOutputFormat = (raw?: string | null) => {
  if (!raw) {
    return null;
  }
  if (raw === "original" || raw === "mp4-remux" || raw === "mp4-recode") {
    return raw;
  }
  return null;
};

const resolveYtDlpPath = () => {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const binName = process.platform === "win32" ? "yt-dlp.cmd" : "yt-dlp";
  const localBin = path.resolve(process.cwd(), "node_modules", ".bin", binName);
  if (fsSync.existsSync(localBin)) {
    return localBin;
  }
  return "yt-dlp";
};

const spawnYtDlp = (
  command: string,
  args: string[],
  onFallback: (error: NodeJS.ErrnoException) => void,
  resolve: () => void,
  reject: (error: Error) => void,
  onStdoutLine?: (line: string) => void
) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
  let stdoutBuffer = "";
  let stderrBuffer = "";
  const splitOutputLines = (buffer: string, chunk: string) => {
    const combined = buffer + chunk;
    const parts = combined.split(/\r\n|\n|\r/);
    return { lines: parts.slice(0, -1), remainder: parts.at(-1) ?? "" };
  };
    child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    if (!onStdoutLine) {
      return;
    }
    const result = splitOutputLines(stderrBuffer, text);
    stderrBuffer = result.remainder;
    for (const line of result.lines) {
      onStdoutLine(line);
    }
  });
  if (onStdoutLine) {
    child.stdout.on("data", (chunk) => {
      const result = splitOutputLines(stdoutBuffer, chunk.toString());
      stdoutBuffer = result.remainder;
      for (const line of result.lines) {
        onStdoutLine(line);
      }
    });
  }

  child.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      onFallback(error as NodeJS.ErrnoException);
      return;
    }
    reject(error as Error);
  });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });
};

const buildArgsWithOptions = (
  query: string,
  outputDir: string,
  quality?: string | null,
  options?: YtDlpOptions
) => {
  const rawTemplate = options?.outputTemplate;
  const outputTemplate =
    typeof rawTemplate === "string" && rawTemplate.trim().length > 0
      ? rawTemplate.trim()
      : "%(title)s.%(ext)s";
  // Prevent path traversal / nested directories via template.
  const safeTemplate = outputTemplate.replace(/[\\/]+/g, "_");

  const args = [
    "--progress",
    "--newline",
    "--progress-template",
    "download:download:%(progress._percent_str)s",
    "--progress-template",
    "postprocess:postprocess:%(progress._percent_str)s",
    "--print",
    "after_move:filepath",
    "-f",
    qualityFormat(quality),
    "-o",
    path.join(outputDir, safeTemplate),
    // Download optimizations
    "--concurrent-fragments", "5",  // Download multiple fragments in parallel
    "--buffer-size", "16K",          // Increase buffer size for faster downloads
    "--http-chunk-size", "10M"       // Download in larger chunks
  ];
  
  // Always merge to MP4 container
  args.push("--merge-output-format", "mp4");
  
  // ALWAYS convert to H.264/AAC for optimal streaming compatibility
  // This ensures all downloads work with HLS copy mode
  if (options?.outputFormat === "mp4-remux") {
    // Remux: Try to avoid re-encoding if already H.264/AAC
    args.push("--remux-video", "mp4");
  } else if (options?.outputFormat === "mp4-recode") {
    // Force re-encode: Always re-encode to H.264/AAC
    args.push("--recode-video", "mp4");
  }
  // else: Default behavior - yt-dlp will download and merge intelligently
  
  // Apply post-processing to ensure H.264 video + AAC audio in all cases
  // Use faster encoding preset for speed, with reasonable quality
  // - preset veryfast: Much faster than default medium preset
  // - crf 23: Default quality (lower = better quality but slower)
  // - movflags +faststart: Optimize for web streaming
  // - c:v libx264 / c:a aac: Ensure H.264/AAC even if source is different
  args.push(
    "--postprocessor-args",
    "ffmpeg:-c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 192k -movflags +faststart"
  );
  
  if (options?.cookiesPath) {
    args.push("--cookies", options.cookiesPath);
  } else if (options?.cookiesFromBrowser) {
    args.push("--cookies-from-browser", options.cookiesFromBrowser);
  } else if (options?.cookiesHeader) {
    const trimmed = options.cookiesHeader.trim();
    const headerValue = trimmed.toLowerCase().startsWith("cookie:")
      ? trimmed.slice(trimmed.indexOf(":") + 1).trim()
      : trimmed;
    const singleLineValue = headerValue.split(/\\r?\\n/)[0]?.trim();
    if (singleLineValue) {
      args.push("--add-header", `Cookie: ${singleLineValue}`);
    }
  }
  const searchTarget = buildSearchTarget(query);
  if (searchTarget) {
    args.push(searchTarget);
  }
  return args;
};

export async function runYtDlp(
  query: string,
  outputDir: string,
  quality?: string | null,
  onProgress?: (percent: number, stage?: "download" | "processing") => void,
  options?: YtDlpOptions,
  onStage?: (stage: "download" | "processing" | "finalizing", detail?: string) => void
) {
  await fs.mkdir(outputDir, { recursive: true });

  const envCookiesPath = process.env.YT_DLP_COOKIES?.trim() || null;
  const envCookiesFromBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim() || null;
  const envOutputFormat = normalizeOutputFormat(process.env.YT_DLP_OUTPUT_FORMAT?.trim() || null);
  const cookiesPath =
    typeof options?.cookiesPath !== "undefined" ? options.cookiesPath : envCookiesPath;
  const cookiesFromBrowser =
    typeof options?.cookiesFromBrowser !== "undefined"
      ? options.cookiesFromBrowser
      : envCookiesFromBrowser;
  const cookiesHeader =
    typeof options?.cookiesHeader !== "undefined" ? options.cookiesHeader : null;
  const outputFormat =
    typeof options?.outputFormat !== "undefined" ? options.outputFormat : envOutputFormat;
  const ytDlpPath = resolveYtDlpPath();
  const debugOutput = process.env.YT_DLP_DEBUG_OUTPUT?.trim() === "1";

  const runWithQuery = (searchQuery: string) =>
    new Promise<string[]>((resolve, reject) => {
      const args = buildArgsWithOptions(searchQuery, outputDir, quality, {
        cookiesPath,
        cookiesFromBrowser,
        cookiesHeader,
        outputFormat
      });
      const printedPaths: string[] = [];
      let lastStage: string | null = null;
      let lastDetail: string | null = null;
      const emitStage = (stage: "download" | "processing" | "finalizing", detail?: string) => {
        if (!onStage) return;
        if (lastStage === stage && lastDetail === (detail ?? null)) return;
        lastStage = stage;
        lastDetail = detail ?? null;
        onStage(stage, detail);
      };
      const parsePercent = (text: string) => {
        const percentMatch = text.match(/([0-9]+(?:\\.[0-9]+)?)%/);
        if (!percentMatch) {
          return null;
        }
        const percent = Number(percentMatch[1]);
        return Number.isNaN(percent) ? null : percent;
      };
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (debugOutput && trimmed) {
          console.log(`[yt-dlp] ${trimmed}`);
        }
        if (!trimmed) {
          return;
        }
        if (trimmed.startsWith("download:")) {
          const percent = parsePercent(trimmed);
          if (percent !== null) {
            emitStage("download", "Downloading");
            onProgress?.(percent, "download");
            return;
          }
          emitStage("download", "Downloading");
        }
        if (trimmed.startsWith("postprocess:")) {
          const percent = parsePercent(trimmed);
          if (percent !== null) {
            emitStage("processing", "Encoding");
            onProgress?.(percent, "processing");
            return;
          }
          emitStage("processing", "Processing");
        }
        if (/^(?:\d+(?:\.\d+)?%|NA|N\/A)$/i.test(trimmed)) {
          const percent = parsePercent(trimmed);
          if (percent !== null) {
            const stage = lastStage === "processing" ? "processing" : "download";
            emitStage(stage, stage === "processing" ? "Encoding" : "Downloading");
            onProgress?.(percent, stage);
            return;
          }
          if (lastStage === "processing") {
            emitStage("processing", "Processing");
            return;
          }
        }
        const isDownloadLine = /download/i.test(trimmed);
        if (isDownloadLine) {
          const percent = parsePercent(trimmed);
          if (percent !== null) {
            emitStage("download", "Downloading");
            onProgress?.(percent, "download");
            return;
          }
          emitStage("download", "Downloading");
        }
        if (/post-processing|merging formats|remux|re-encode|ffmpeg|merger|extractaudio/i.test(trimmed)) {
          const detail = trimmed.includes("remux")
            ? "Remuxing"
            : trimmed.includes("re-encode") || trimmed.includes("ffmpeg")
            ? "Encoding"
            : trimmed.includes("merger")
            ? "Merging"
            : "Processing";
          emitStage("processing", detail);
        } else if (/deleting original file|fixup|finalizing/i.test(trimmed)) {
          emitStage("finalizing", "Finalizing");
        }
        if (trimmed.startsWith(outputDir) && fsSync.existsSync(trimmed)) {
          printedPaths.push(trimmed);
        }
      };
      spawnYtDlp(
        ytDlpPath,
        args,
        () => {
          const python = process.env.YT_DLP_PYTHON?.trim() || "python3";
          const pythonArgs = ["-m", "yt_dlp", ...args];
          spawnYtDlp(
            python,
            pythonArgs,
            () => {
              reject(
                new Error(
                  "yt-dlp not found. Install it (brew install yt-dlp) or set YT_DLP_PATH. You can also install via python3 -m pip install yt-dlp and set YT_DLP_PYTHON=python3."
                )
              );
            },
            () => resolve(printedPaths),
            reject,
            handleLine
          );
        },
        () => resolve(printedPaths),
        reject,
        handleLine
      );
    });

  const preferredQuery = preferOfficialVideoQuery(query);
  if (preferredQuery !== query) {
    try {
      const preferredPaths = await runWithQuery(preferredQuery);
      if (preferredPaths.length > 0) {
        return preferredPaths;
      }
    } catch {
      // fall back to original query
    }
  }

  return runWithQuery(query);
}
