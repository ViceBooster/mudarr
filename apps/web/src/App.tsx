import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { useLocation, useNavigate } from "react-router-dom";
import {
  apiBaseUrl,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  getAuthToken,
  setAuthToken
} from "./api";

const tabs = [
  "Dashboard",
  "Artists",
  "Downloads",
  "Lists",
  "Streams",
  "Logs",
  "Settings"
] as const;

const settingsTabs = [
  { id: "general", label: "General" },
  { id: "api-keys", label: "API keys" },
  { id: "streaming-options", label: "Streaming" },
  { id: "downloads", label: "Downloads" },
  { id: "search", label: "Search" },
  { id: "youtube", label: "YouTube" },
  { id: "plex", label: "Plex" }
] as const;

type SettingsTabId = (typeof settingsTabs)[number]["id"];
const defaultSettingsTab: SettingsTabId = settingsTabs[0].id;

const searchStopwords = new Set(["the", "a", "an", "and", "of", "&"]);

const loadingJokes = [
  "Warming up the hamsters. Try not to blink.",
  "Loading... because magic takes a second.",
  "Polishing pixels for your royal viewing.",
  "Fetching data from the cloud. It was napping.",
  "Still faster than you setting this up manually.",
  "If you can read this, you can wait 2 seconds.",
  "Buffering your brilliance.",
  "Starting up... please avoid touching anything.",
  "Loading... pretend this is a progress bar.",
  "Calibrating awesomeness to your standards.",
  "Spinning up servers with sheer willpower.",
  "Composing the perfect loading experience.",
  "Hang tight. The internet is being the internet.",
  "Just a moment while we summon the vibes.",
  "Hold on. We're herding electrons.",
  "Loading... try not to refresh out of boredom.",
  "Reticulating splines. Obviously.",
  "Negotiating with the database. It's stubborn.",
  "Teaching the bits to dance.",
  "Still loading. You're still watching.",
  "Optimizing the optimum. You're welcome.",
  "Waking the API from its nap.",
  "Preparing your dashboard, like it's a fine meal.",
  "Making sure the music videos behave.",
  "Ensuring everything is perfectly adequate.",
  "Crunching numbers... and your patience.",
  "One moment. We're buffering your expectations.",
  "Applying lipstick to the UI.",
  "Waiting on the universe to align.",
  "Turning it off and on again, internally.",
  "Loading... because instant is overrated.",
  "Pro tip: waiting builds character.",
  "Shuffling the bits into the right order.",
  "Finalizing everything you didn't know you needed.",
  "Checking if you really meant to open this.",
  "Still loading. Please continue existing.",
  "Linting the cosmos.",
  "Unboxing your data.",
  "Consider this a brief intermission.",
  "You could start a band while you wait.",
  "Putting the 'pro' in progress.",
  "Reheating the cache.",
  "We asked the server nicely. It should respond.",
  "Loading... because your time is our hobby.",
  "Almost there. Probably.",
  "Aligning the stars. And the CSS.",
  "Stirring the digital soup.",
  "Energizing the flux capacitor.",
  "Doing important stuff behind the curtain.",
  "Loading... don't make me tap the sign."
];
const PLAYER_DEFAULT_WIDTH = 520;
const PLAYER_DEFAULT_HEIGHT = 260;
const PLAYER_MIN_WIDTH = 320;
const PLAYER_MIN_HEIGHT = 200;
const PLAYER_COMPACT_WIDTH = 220;
const PLAYER_COMPACT_HEIGHT = 180;
const DOWNLOADS_PAGE_SIZE = 20;
const DASHBOARD_STATS_INTERVAL_MS = 5000;
const DASHBOARD_STATS_RENDER_POINTS = 60;
const LOADING_MIN_MS = 2000;

const normalizeTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const matchesArtistQuery = (name: string, query: string) => {
  const queryTokens = normalizeTokens(query).filter((token) => !searchStopwords.has(token));
  if (queryTokens.length === 0) {
    return true;
  }
  const nameTokens = normalizeTokens(name);
  return queryTokens.every((token) => nameTokens.some((nameToken) => nameToken.startsWith(token)));
};

const toSentenceCase = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  return normalized[0].toUpperCase() + normalized.slice(1);
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatBandwidth = (bytesPerSecond: number | null | undefined) => {
  const value =
    typeof bytesPerSecond === "number" && Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
      ? bytesPerSecond
      : 0;
  const bitsPerSecond = value * 8;
  if (bitsPerSecond <= 0) return "0 bps";
  const units = ["bps", "kbps", "Mbps", "Gbps", "Tbps"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bitsPerSecond) / Math.log(1000)));
  const display = bitsPerSecond / Math.pow(1000, index);
  const rounded = display.toFixed(display >= 10 || index === 0 ? 0 : 1);
  return `${rounded} ${units[index]}`;
};

const buildDownloadProgress = (downloaded: number, monitored: number) => {
  const safeMonitored = Number.isFinite(monitored) ? Math.max(0, Math.floor(monitored)) : 0;
  const safeDownloaded = Number.isFinite(downloaded) ? Math.max(0, Math.floor(downloaded)) : 0;
  const percent =
    safeMonitored > 0 ? Math.round((safeDownloaded / safeMonitored) * 100) : 0;
  return { monitored: safeMonitored, downloaded: safeDownloaded, percent };
};

const downsampleSeries = (values: number[], targetPoints: number) => {
  if (values.length <= targetPoints) return values;
  if (targetPoints <= 1) return [values[0]];
  const sampled: number[] = [];
  for (let i = 0; i < targetPoints; i += 1) {
    const ratio = i / (targetPoints - 1);
    const index = Math.round(ratio * (values.length - 1));
    sampled.push(values[index]);
  }
  return sampled;
};

const buildSparklinePaths = (
  values: number[],
  width: number,
  height: number,
  padding: number
) => {
  if (values.length === 0) {
    return { linePath: "", areaPath: "" };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = padding + index * step;
    const y = padding + innerHeight - ((value - min) / range) * innerHeight;
    return { x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const baseY = padding + innerHeight;
  const areaPath = `${linePath} L ${padding + innerWidth},${baseY} L ${padding},${baseY} Z`;
  return { linePath, areaPath };
};

type SparklineProps = {
  values: number[];
  strokeClassName: string;
  gradientFrom: string;
  gradientTo: string;
};

const Sparkline = ({ values, strokeClassName, gradientFrom, gradientTo }: SparklineProps) => {
  const gradientId = useId().replace(/:/g, "");
  const sampledValues = useMemo(
    () => downsampleSeries(values, DASHBOARD_STATS_RENDER_POINTS),
    [values]
  );
  const { linePath, areaPath } = useMemo(
    () => buildSparklinePaths(sampledValues, 100, 40, 4),
    [sampledValues]
  );
  if (!linePath) return null;
  return (
    <svg className="h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.45" />
          <stop offset="100%" stopColor={gradientTo} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        className={`${strokeClassName} opacity-70`}
        fill="none"
        strokeWidth="1.6"
      />
    </svg>
  );
};

const formatDuration = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return "Unknown";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const formatElapsed = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined || seconds < 0) {
    return "0:00:00";
  }
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatBitrate = (bitRate: number | null | undefined) => {
  if (!Number.isFinite(bitRate) || !bitRate || bitRate <= 0) return "Unknown";
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bitRate) / Math.log(1000)));
  const value = bitRate / Math.pow(1000, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatResolution = (width?: number | null, height?: number | null) => {
  if (width && height) {
    return `${width}×${height}`;
  }
  if (height) {
    return `${height}p`;
  }
  return "Unknown";
};

const shuffleList = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const shuffleTracksForEdit = (tracks: StreamTrackOption[]) =>
  tracks.length <= 1 ? tracks : shuffleList(tracks);

const isSameTrackOrder = (a: StreamTrackOption[], b: StreamTrackOption[]) => {
  if (a.length !== b.length) return false;
  return a.every((track, index) => track.id === b[index]?.id);
};

const getResolutionSummary = (items: StreamItem[]) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.video_width || !item.video_height) continue;
    const label = `${item.video_width}×${item.video_height}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) return "Unknown";
  let best = "";
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best || "Unknown";
};

type ActivityEvent = {
  id: number;
  type: string;
  message: string;
  metadata: unknown;
  created_at: string;
};

type Artist = {
  id: number;
  name: string;
  image_url?: string | null;
  created_at: string;
  genres: { id: number; name: string }[];
  has_downloads?: boolean;
  monitored_count?: number | null;
  downloaded_count?: number | null;
};

type Genre = {
  id: number;
  name: string;
  created_at: string;
  import_source?: "lastfm" | null;
  import_limit?: number | null;
  import_mode?: ArtistPreference["import_mode"] | null;
  import_quality?: ArtistPreference["quality"] | null;
  import_auto_download?: boolean | null;
  import_enabled?: boolean | null;
  imported_at?: string | null;
  updated_at?: string | null;
};

type GenreImportResult = {
  status: string;
  genre: string;
  genreId: number | null;
  requested: number;
  processed: number;
  imported: number;
  skipped: number;
  errors: number;
  errorSamples?: Array<{ name: string; message: string }>;
};

type GenreImportStartResult = {
  status: "queued";
  jobId: string;
  total: number;
};

type GenreImportJob = {
  id: string;
  genre_id: number | null;
  genre_name: string;
  source: string;
  limit: number;
  import_mode: string;
  import_quality: string;
  auto_download: boolean;
  enabled: boolean;
  status: string;
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  error_samples: Array<{ name: string; message: string }> | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at?: string | null;
};

type ArtistImportJob = {
  id: number;
  audiodb_id: string;
  artist_name: string;
  artist_id: number | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress_stage: string | null;
  progress_detail: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type DownloadJob = {
  id: number;
  status: string;
  source: string;
  query: string;
  display_title?: string | null;
  quality?: string | null;
  progress_percent?: number | null;
  progress_stage?: string | null;
  progress_detail?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

type ListSource = {
  id: number;
  type: string;
  external_id: string;
  name: string;
  enabled: boolean;
  last_sync_at: string | null;
  created_at: string;
};

type PlexStatus = {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
};

type YoutubeOutputFormat = "original" | "mp4-remux" | "mp4-recode";

type YoutubeSettings = {
  cookiesPath: string | null;
  cookiesFromBrowser: string | null;
  cookiesHeader: string | null;
  outputFormat: YoutubeOutputFormat | null;
};

type DownloadSettings = {
  concurrency: number | null;
};

type SearchSettings = {
  skipNonOfficialMusicVideos: boolean;
};

type YoutubeSearchResult = {
  id: string;
  title: string;
  channel: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string | null;
  qualities: string[];
};

type YoutubeSearchContext = {
  trackId: number;
  trackTitle: string;
  albumId: number;
  albumTitle: string;
  artistName: string;
};

type IntegrationSettings = {
  audiodbApiKey: string | null;
  lastfmApiKey: string | null;
  audiodbConfigured: boolean;
  lastfmConfigured: boolean;
};

type StreamSettings = {
  token: string;
  enabled: boolean;
};

type GeneralSettings = {
  mediaRoot: string | null;
  domain: string | null;
  publicApiBaseUrl: string | null;
};

type SetupDefaults = {
  mediaRoot: string;
  domain: string | null;
  publicApiBaseUrl: string | null;
  streamEnabled: boolean;
};

type SetupStatusResponse = {
  completed: boolean;
  defaults?: SetupDefaults;
};

type AuthStatusResponse = {
  authenticated: boolean;
  username: string | null;
};

type AuthLoginResponse = {
  token: string;
  username: string;
};

type AdminSettings = {
  username: string | null;
};

type StorageBrowseEntry = {
  name: string;
  path: string;
};

type StorageBrowseResponse = {
  path: string;
  parent: string | null;
  entries: StorageBrowseEntry[];
};

type StreamEncoding = "original" | "copy" | "transcode" | "web";

type StreamStatus = "active" | "stopped";

type StreamTrackOption = {
  id: number;
  title: string;
  album_title: string | null;
  artist_name: string | null;
};

type StreamItem = {
  id: number;
  position: number;
  track_id: number;
  title: string;
  album_title: string | null;
  artist_name: string | null;
  available: boolean;
  bytes: number | null;
  duration: number | null;
  audio_codec: string | null;
  video_codec: string | null;
  video_width: number | null;
  video_height: number | null;
  bit_rate: number | null;
};

type StreamSummary = {
  id: number;
  name: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
  status: StreamStatus;
  shuffle: boolean;
  encoding: StreamEncoding;
  restarted_at: string | null;
  onlineSeconds: number | null;
  currentTrack: {
    trackId: number;
    title: string;
    artistName: string | null;
    albumTitle: string | null;
  } | null;
  itemCount: number;
  totalBytes: number;
  totalDuration: number | null;
  missingCount: number;
  audioCodecs: string[];
  videoCodecs: string[];
  connections: number;
  clients: Array<{
    ip: string;
    userAgent: string | null;
    connectedSince: string;
    lastSeen: string;
    lastPath: string | null;
    activeConnections: number;
  }>;
  items: StreamItem[];
};

type TrackMediaInfo = {
  bytes: number | null;
  duration: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  bitRate: number | null;
};

type DashboardStats = {
  artists: number;
  mediaBytes: number;
  mediaFiles: number;
  missingFiles: number;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  activeConnections: number;
  bandwidthBps: number;
};

type DashboardStatsSample = {
  timestamp: number;
  activeConnections: number;
  bandwidthBps: number;
};

type PlaybackItem = {
  trackId: number;
  title: string;
  albumTitle: string | null;
};

type AudioDbArtist = {
  id: string;
  name: string;
  genre: string | null;
  style: string | null;
  thumb: string | null;
  source?: "local" | "theaudiodb" | "lastfm" | null;
  listeners?: number | null;
};

type TrackDetail = {
  id: number;
  title: string;
  track_no: number | null;
  monitored: boolean;
  downloaded?: boolean;
  download_status?: string | null;
  progress_percent?: number | null;
  download_error?: string | null;
};

type AlbumDetail = {
  id: number;
  title: string;
  year: number | null;
  monitored: boolean;
  tracks: TrackDetail[];
};

type ArtistDetail = {
  artist: {
    id: number;
    name: string;
    image_url?: string | null;
    created_at: string;
    genres: { id: number; name: string }[];
  };
  albums: AlbumDetail[];
};

type ArtistPreference = {
  import_mode: "discography" | "new" | "custom";
  quality: "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "4320p";
  auto_download: boolean;
};

type ArtistSortKey = "name" | "created_at";

type ArtistSortDirection = "asc" | "desc";

const BookmarkIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const RefreshIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

const EditIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const TracksIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M3 12h18" />
    <path d="M3 18h18" />
  </svg>
);

const MenuIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </svg>
);

const ConnectionsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7" cy="8" r="3" />
    <circle cx="17" cy="8" r="3" />
    <path d="M2 20c0-3 2.5-5 5-5" />
    <path d="M22 20c0-3-2.5-5-5-5" />
    <path d="M8 20c0-3 2-5 4-5s4 2 4 5" />
  </svg>
);

const ResolutionIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8 21h8" />
  </svg>
);

const VideoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 9l5 3-5 3z" />
  </svg>
);

const AudioIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 10h4l5-4v12l-5-4H4z" />
    <path d="M17 9c1 1 1 5 0 6" />
    <path d="M19 7c2 2 2 8 0 10" />
  </svg>
);

const FormatIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4" />
  </svg>
);

const ClockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const ShuffleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M16 3h5v5" />
    <path d="M4 20h5l12-12" />
    <path d="M16 16h5v5" />
    <path d="M4 4h5l4 4" />
    <path d="m15 15 4 4" />
  </svg>
);

const TrashIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const HomeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5Z" />
  </svg>
);

const ArtistIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
    <path d="M7 21a5 5 0 0 1 10 0" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 3v12" />
    <path d="m8 11 4 4 4-4" />
    <path d="M4 21h16" />
  </svg>
);

const ListIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M8 6h12" />
    <path d="M8 12h12" />
    <path d="M8 18h12" />
    <path d="M4 6h.01" />
    <path d="M4 12h.01" />
    <path d="M4 18h.01" />
  </svg>
);

const StreamIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M4 18c4-4 12-4 16 0" />
    <path d="M6 14c3-3 9-3 12 0" />
    <path d="M8 10c2-2 6-2 8 0" />
  </svg>
);

const LogsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M4 6h16" />
    <path d="M4 12h10" />
    <path d="M4 18h16" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
    <path d="M20 12a7.9 7.9 0 0 0-.2-1.8l2-1.5-2-3.4-2.4 1a8 8 0 0 0-3-1.7L13 2h-4l-.4 2.6a8 8 0 0 0-3 1.7l-2.4-1-2 3.4 2 1.5A8 8 0 0 0 3 12c0 .6.1 1.2.2 1.8l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 3 1.7L9 22h4l.4-2.6a8 8 0 0 0 3-1.7l2.4 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8Z" />
  </svg>
);

const tabRoutes: Record<(typeof tabs)[number], string> = {
  Dashboard: "/dashboard",
  Artists: "/artists",
  Downloads: "/downloads",
  Lists: "/lists",
  Streams: "/streams",
  Logs: "/logs",
  Settings: "/settings"
};
const streamCreateRoute = "/streams/create";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [lists, setLists] = useState<ListSource[]>([]);
  const [streams, setStreams] = useState<StreamSummary[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [plexStatus, setPlexStatus] = useState<PlexStatus | null>(null);
  const [artistImportJobs, setArtistImportJobs] = useState<ArtistImportJob[]>([]);
  const [setupStatus, setSetupStatus] = useState<
    "loading" | "incomplete" | "complete" | "error"
  >("loading");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMediaRoot, setSetupMediaRoot] = useState("");
  const [setupDomain, setSetupDomain] = useState("");
  const [setupPublicApiBaseUrl, setSetupPublicApiBaseUrl] = useState("");
  const [setupStreamEnabled, setSetupStreamEnabled] = useState(true);
  const [setupAdminUsername, setSetupAdminUsername] = useState("");
  const [setupAdminPassword, setSetupAdminPassword] = useState("");
  const [setupAdminPasswordConfirm, setSetupAdminPasswordConfirm] = useState("");
  const [authStatus, setAuthStatus] = useState<
    "unknown" | "authenticated" | "unauthenticated"
  >("unknown");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [generalMediaRoot, setGeneralMediaRoot] = useState("");
  const [generalDomain, setGeneralDomain] = useState("");
  const [generalPublicApiBaseUrl, setGeneralPublicApiBaseUrl] = useState("");
  const [generalSaveStatus, setGeneralSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [adminUsername, setAdminUsername] = useState("");
  const [currentAdminUsername, setCurrentAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminSaveStatus, setAdminSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [storageBrowserVisible, setStorageBrowserVisible] = useState(false);
  const [storageBrowserTarget, setStorageBrowserTarget] = useState<"setup" | "settings">(
    "setup"
  );
  const [storageBrowserPath, setStorageBrowserPath] = useState<string | null>(null);
  const [storageBrowserParent, setStorageBrowserParent] = useState<string | null>(null);
  const [storageBrowserEntries, setStorageBrowserEntries] = useState<StorageBrowseEntry[]>(
    []
  );
  const [storageBrowserLoading, setStorageBrowserLoading] = useState(false);
  const [storageBrowserError, setStorageBrowserError] = useState<string | null>(null);

  const [newArtist, setNewArtist] = useState("");
  const [artistGenreIds, setArtistGenreIds] = useState<number[]>([]);
  const [newGenre, setNewGenre] = useState("");
  const [genreImportId, setGenreImportId] = useState<number | null>(null);
  const [genreImportName, setGenreImportName] = useState("");
  const [genreImportLimit, setGenreImportLimit] = useState(50);
  const [genreImportSource, setGenreImportSource] = useState<"lastfm">("lastfm");
  const [genreImportMode, setGenreImportMode] =
    useState<ArtistPreference["import_mode"]>("new");
  const [genreImportQuality, setGenreImportQuality] =
    useState<ArtistPreference["quality"]>("1080p");
  const [genreImportAutoDownload, setGenreImportAutoDownload] = useState(false);
  const [genreImportEnabled, setGenreImportEnabled] = useState(true);
  const [genreImportNotice, setGenreImportNotice] = useState<string | null>(null);
  const [isGenreImporting, setIsGenreImporting] = useState(false);
  const [genreImportJob, setGenreImportJob] = useState<GenreImportJob | null>(null);
  const [lastfmTags, setLastfmTags] = useState<string[]>([]);
  const [lastfmTagsStatus, setLastfmTagsStatus] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [lastfmTagsError, setLastfmTagsError] = useState<string | null>(null);
  const [newDownloadQuery, setNewDownloadQuery] = useState("");
  const [downloadsPage, setDownloadsPage] = useState(1);
  const [newListType, setNewListType] = useState("spotify");
  const [newListId, setNewListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [streamName, setStreamName] = useState("");
  const [streamIcon, setStreamIcon] = useState("");
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [streamSearchQuery, setStreamSearchQuery] = useState("");
  const [streamOnlineFilter, setStreamOnlineFilter] =
    useState<"all" | "online" | "offline">("all");
  const [streamSort, setStreamSort] = useState<
    "name-asc" | "name-desc" | "uptime-desc" | "uptime-asc"
  >("name-asc");
  const [streamSource, setStreamSource] = useState<"manual" | "artists" | "genres">("manual");
  const [streamShuffle, setStreamShuffle] = useState(false);
  const [streamEncoding, setStreamEncoding] = useState<StreamEncoding>("original");
  const [streamArtistQuery, setStreamArtistQuery] = useState("");
  const [streamGenreQuery, setStreamGenreQuery] = useState("");
  const [streamArtistIds, setStreamArtistIds] = useState<number[]>([]);
  const [streamGenreIds, setStreamGenreIds] = useState<number[]>([]);
  const [streamTrackQuery, setStreamTrackQuery] = useState("");
  const [streamTrackResults, setStreamTrackResults] = useState<StreamTrackOption[]>([]);
  const [streamTrackLoading, setStreamTrackLoading] = useState(false);
  const [selectedStreamTracks, setSelectedStreamTracks] = useState<StreamTrackOption[]>([]);
  const [isCreatingStream, setIsCreatingStream] = useState(false);
  const [expandedStreamIds, setExpandedStreamIds] = useState<number[]>([]);
  const [streamMenuId, setStreamMenuId] = useState<number | null>(null);
  const [editingStreamId, setEditingStreamId] = useState<number | null>(null);
  const [editingStreamName, setEditingStreamName] = useState("");
  const [editingStreamIcon, setEditingStreamIcon] = useState("");
  const [editingStreamEncoding, setEditingStreamEncoding] = useState<StreamEncoding>("original");
  const [editingStreamShuffle, setEditingStreamShuffle] = useState(false);
  const [editingStreamStatus, setEditingStreamStatus] = useState<StreamStatus>("active");
  const [editingStreamRestartOnSave, setEditingStreamRestartOnSave] = useState(true);
  const [editingStreamTab, setEditingStreamTab] = useState<"artists" | "tracks">("artists");
  const [editingStreamTracks, setEditingStreamTracks] = useState<StreamTrackOption[]>([]);
  const [editingStreamSelectedIds, setEditingStreamSelectedIds] = useState<number[]>([]);
  const editingStreamSelectionAnchor = useRef<number | null>(null);
  const [editingStreamArtistQuery, setEditingStreamArtistQuery] = useState("");
  const [editingStreamArtistIds, setEditingStreamArtistIds] = useState<number[]>([]);
  const [editingStreamArtistLoadingIds, setEditingStreamArtistLoadingIds] = useState<number[]>([]);
  const [editingStreamTrackQuery, setEditingStreamTrackQuery] = useState("");
  const [editingStreamTrackResults, setEditingStreamTrackResults] = useState<
    StreamTrackOption[]
  >([]);
  const [editingStreamTrackLoading, setEditingStreamTrackLoading] = useState(false);
  const [plexBaseUrl, setPlexBaseUrl] = useState("");
  const [plexToken, setPlexToken] = useState("");
  const [plexSectionId, setPlexSectionId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingJokeIndex, setLoadingJokeIndex] = useState(0);
  const [loadingHoldUntil, setLoadingHoldUntil] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<AudioDbArtist[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [artistSortKey, setArtistSortKey] = useState<ArtistSortKey>("name");
  const [artistSortDirection, setArtistSortDirection] = useState<ArtistSortDirection>("asc");
  const [pendingImportArtist, setPendingImportArtist] = useState<AudioDbArtist | null>(null);
  const [isImportingArtist, setIsImportingArtist] = useState(false);
  const [importMode, setImportMode] = useState<ArtistPreference["import_mode"]>("discography");
  const [importQuality, setImportQuality] = useState<ArtistPreference["quality"]>("1080p");
  const [importAutoDownload, setImportAutoDownload] = useState(true);
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [artistPreferences, setArtistPreferences] = useState<ArtistPreference | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [expandedAlbumIds, setExpandedAlbumIds] = useState<number[]>([]);
  const [dashboardView, setDashboardView] = useState<"posters" | "list">("posters");
  const [dashboardSelectMode, setDashboardSelectMode] = useState(false);
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);
  const [deleteArtistModal, setDeleteArtistModal] = useState<{
    open: boolean;
    artistIds: number[];
    label: string;
  }>({ open: false, artistIds: [], label: "" });
  const [bulkImportMode, setBulkImportMode] =
    useState<ArtistPreference["import_mode"]>("discography");
  const [bulkQuality, setBulkQuality] = useState<ArtistPreference["quality"]>("1080p");
  const [bulkAutoDownload, setBulkAutoDownload] = useState(true);
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<number[]>([]);
  const [monitorNotice, setMonitorNotice] = useState<string | null>(null);
  const [youtubeSearchContext, setYoutubeSearchContext] =
    useState<YoutubeSearchContext | null>(null);
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState("");
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<YoutubeSearchResult[]>([]);
  const [youtubeSearchLoading, setYoutubeSearchLoading] = useState(false);
  const [youtubeSearchError, setYoutubeSearchError] = useState<string | null>(null);
  const [youtubeSearchQuality, setYoutubeSearchQuality] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [youtubeCookiesPath, setYoutubeCookiesPath] = useState("");
  const [youtubeCookiesBrowser, setYoutubeCookiesBrowser] = useState("");
  const [youtubeCookiesHeader, setYoutubeCookiesHeader] = useState("");
  const [youtubeOutputFormat, setYoutubeOutputFormat] =
    useState<YoutubeOutputFormat>("original");
  const [youtubeStatus, setYoutubeStatus] = useState<YoutubeSettings | null>(null);
  const [youtubeSaveStatus, setYoutubeSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings | null>(null);
  const [downloadConcurrency, setDownloadConcurrency] = useState(2);
  const [downloadSaveStatus, setDownloadSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [searchSettings, setSearchSettings] = useState<SearchSettings | null>(null);
  const [skipNonOfficialMusicVideos, setSkipNonOfficialMusicVideos] = useState(false);
  const [searchSaveStatus, setSearchSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [integrationsStatus, setIntegrationsStatus] =
    useState<IntegrationSettings | null>(null);
  const [audiodbApiKey, setAudiodbApiKey] = useState("");
  const [lastfmApiKey, setLastfmApiKey] = useState("");
  const [showAudiodbKey, setShowAudiodbKey] = useState(false);
  const [showLastfmKey, setShowLastfmKey] = useState(false);
  const [showSettingsNotice, setShowSettingsNotice] = useState(true);
  const [integrationsSaveStatus, setIntegrationsSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [streamSettings, setStreamSettings] = useState<StreamSettings | null>(null);
  const [streamToken, setStreamToken] = useState("");
  const [streamTokenStatus, setStreamTokenStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [connectionsModalStreamId, setConnectionsModalStreamId] = useState<number | null>(null);
  const [restartingStreamIds, setRestartingStreamIds] = useState<number[]>([]);
  const [rescanningStreamIds, setRescanningStreamIds] = useState<number[]>([]);
  const [playingStreamId, setPlayingStreamId] = useState<number | null>(null);
  const [streamPlayerNotice, setStreamPlayerNotice] = useState<string | null>(null);
  const [currentPlaybackInfo, setCurrentPlaybackInfo] = useState<TrackMediaInfo | null>(null);
  const [currentPlaybackInfoStatus, setCurrentPlaybackInfoStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [streamingStatsHistory, setStreamingStatsHistory] = useState<DashboardStatsSample[]>([]);
  const generalSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const integrationsSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const youtubeSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamTokenSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackItem[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  const [playerPosition, setPlayerPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPlayer, setIsDraggingPlayer] = useState(false);
  const [playerMode, setPlayerMode] = useState<"full" | "compact">("full");
  const [draggedPlaylistIndex, setDraggedPlaylistIndex] = useState<number | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const streamMenuRef = useRef<HTMLDivElement | null>(null);
  const artistSettingsRef = useRef<HTMLDivElement | null>(null);
  const artistTracksRef = useRef<HTMLDivElement | null>(null);
  const playerDragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const streamPlayerRef = useRef<HTMLVideoElement | null>(null);
  const streamHlsRef = useRef<any>(null);
  const previousImportJobIds = useRef<Set<number>>(new Set());
  const recentImportJobIds = useRef<Set<number>>(new Set());

  const setupComplete = setupStatus === "complete";
  const canUseApi = setupComplete && authStatus === "authenticated";

  const streamsEnabled = streamEnabled;

  const activeTab = useMemo<(typeof tabs)[number]>(() => {
    const path = location.pathname;
    if (path.startsWith("/artists")) return "Artists";
    if (path === "/downloads") return "Downloads";
    if (path === "/lists") return "Lists";
    if (path.startsWith("/streams")) return streamsEnabled ? "Streams" : "Dashboard";
    if (path === "/logs") return "Logs";
    if (path === "/settings") return "Settings";
    return "Dashboard";
  }, [location.pathname, streamsEnabled]);

  const activeSettingsTab = useMemo<SettingsTabId>(() => {
    const hash = location.hash.replace("#", "");
    const match = settingsTabs.find((tab) => tab.id === hash);
    return match ? match.id : defaultSettingsTab;
  }, [location.hash]);

  useEffect(() => {
    if (!streamsEnabled && location.pathname.startsWith("/streams")) {
      navigate("/dashboard");
    }
  }, [streamsEnabled, location.pathname, navigate]);

  const visibleStreams = useMemo(() => {
    const normalized = streamSearchQuery.trim().toLowerCase();
    const filtered = streams.filter((stream) => {
      if (normalized && !stream.name.toLowerCase().includes(normalized)) {
        return false;
      }
      if (streamOnlineFilter !== "all") {
        const isOnline = stream.status === "active" && stream.onlineSeconds !== null;
        if (streamOnlineFilter === "online" && !isOnline) return false;
        if (streamOnlineFilter === "offline" && isOnline) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (streamSort.startsWith("name")) {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        return streamSort === "name-asc" ? cmp : -cmp;
      }
      const aUptime = a.onlineSeconds ?? 0;
      const bUptime = b.onlineSeconds ?? 0;
      const diff = aUptime - bUptime;
      return streamSort === "uptime-asc" ? diff : -diff;
    });
    return sorted;
  }, [streamSearchQuery, streamOnlineFilter, streamSort, streams]);

  const latestStreamingSample = useMemo(
    () => streamingStatsHistory[streamingStatsHistory.length - 1],
    [streamingStatsHistory]
  );

  const activeConnectionsSeries = useMemo(() => {
    if (streamingStatsHistory.length > 0) {
      return streamingStatsHistory.map((entry) => entry.activeConnections);
    }
    if (dashboardStats) {
      return [dashboardStats.activeConnections];
    }
    return [];
  }, [streamingStatsHistory, dashboardStats]);

  const bandwidthSeries = useMemo(() => {
    if (streamingStatsHistory.length > 0) {
      return streamingStatsHistory.map((entry) => entry.bandwidthBps);
    }
    if (dashboardStats) {
      return [dashboardStats.bandwidthBps];
    }
    return [];
  }, [streamingStatsHistory, dashboardStats]);

  useEffect(() => {
    if (!streamMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (streamMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setStreamMenuId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [streamMenuId]);

  const isStreamCreateRoute = useMemo(
    () => location.pathname === streamCreateRoute,
    [location.pathname]
  );

  const artistRouteId = useMemo(() => {
    const match = location.pathname.match(/^\/artists\/(\d+)/);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isNaN(id) ? null : id;
  }, [location.pathname]);

  const isArtistDetailRoute = artistRouteId !== null;

  const loadSetupStatus = async () => {
    setSetupError(null);
    setSetupStatus("loading");
    try {
      const status = await apiGet<SetupStatusResponse>("/api/setup/status");
      if (!status.completed) {
        const defaults = status.defaults;
        setSetupStatus("incomplete");
        setSetupMediaRoot(defaults?.mediaRoot ?? "");
        setSetupDomain(defaults?.domain ?? "");
        setSetupPublicApiBaseUrl(defaults?.publicApiBaseUrl ?? "");
        setSetupStreamEnabled(defaults?.streamEnabled ?? true);
        setAuthStatus("unauthenticated");
        return;
      }
      setSetupStatus("complete");
    } catch (err) {
      setSetupStatus("error");
      setSetupError(err instanceof Error ? err.message : "Failed to load setup status");
    }
  };

  const refreshAuthStatus = async () => {
    try {
      const status = await apiGet<AuthStatusResponse>("/api/auth/status");
      if (status.authenticated) {
        setAuthStatus("authenticated");
        setAdminUsername(status.username ?? "");
        setCurrentAdminUsername(status.username ?? "");
        return;
      }
      setAuthStatus("unauthenticated");
    } catch {
      setAuthStatus("unauthenticated");
    }
  };

  const handleAuthFailure = (err: unknown) => {
    if (err instanceof Error && err.message.includes("401")) {
      setAuthToken(null);
      setAuthStatus("unauthenticated");
      return true;
    }
    return false;
  };

  const loadStorageBrowser = async (
    requestedPath?: string | null,
    targetOverride?: "setup" | "settings"
  ) => {
    setStorageBrowserError(null);
    setStorageBrowserLoading(true);
    try {
      const target = targetOverride ?? storageBrowserTarget;
      const endpoint = target === "setup" ? "/api/setup/browse" : "/api/settings/storage/browse";
      const pathParam = requestedPath ? `?path=${encodeURIComponent(requestedPath)}` : "";
      const result = await apiGet<StorageBrowseResponse>(`${endpoint}${pathParam}`);
      setStorageBrowserPath(result.path);
      setStorageBrowserParent(result.parent);
      setStorageBrowserEntries(result.entries);
    } catch (err) {
      setStorageBrowserError(
        err instanceof Error ? err.message : "Failed to load folder list"
      );
    } finally {
      setStorageBrowserLoading(false);
    }
  };

  const openStorageBrowser = (target: "setup" | "settings") => {
    setStorageBrowserTarget(target);
    setStorageBrowserVisible(true);
    void loadStorageBrowser(
      target === "setup" ? setupMediaRoot || undefined : generalMediaRoot || undefined,
      target
    );
  };

  const applyStorageSelection = () => {
    if (!storageBrowserPath) return;
    if (storageBrowserTarget === "setup") {
      setSetupMediaRoot(storageBrowserPath);
    } else {
      setGeneralMediaRoot(storageBrowserPath);
    }
    setStorageBrowserVisible(false);
  };

  const completeSetup = async () => {
    const username = setupAdminUsername.trim();
    if (!username) {
      setSetupError("Admin username is required");
      return;
    }
    if (!setupMediaRoot.trim()) {
      setSetupError("Media storage destination is required");
      return;
    }
    if (setupAdminPassword.length < 6) {
      setSetupError("Admin password must be at least 6 characters");
      return;
    }
    if (setupAdminPassword !== setupAdminPasswordConfirm) {
      setSetupError("Admin passwords do not match");
      return;
    }
    setSetupSaving(true);
    setSetupError(null);
    try {
      await apiPost("/api/setup", {
        adminUsername: username,
        adminPassword: setupAdminPassword,
        mediaRoot: setupMediaRoot.trim(),
        domain: setupDomain.trim() || null,
        publicApiBaseUrl: setupPublicApiBaseUrl.trim() || null,
        streamEnabled: setupStreamEnabled
      });
      const token = `Basic ${btoa(`${username}:${setupAdminPassword}`)}`;
      setAuthToken(token);
      setAuthStatus("authenticated");
      setSetupStatus("complete");
      setAdminUsername(username);
      setCurrentAdminUsername(username);
      setGeneralMediaRoot(setupMediaRoot.trim());
      setGeneralDomain(setupDomain.trim());
      setGeneralPublicApiBaseUrl(setupPublicApiBaseUrl.trim());
      setSetupAdminPassword("");
      setSetupAdminPasswordConfirm("");
      setLoginPassword("");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Failed to complete setup");
    } finally {
      setSetupSaving(false);
    }
  };

  const submitLogin = async () => {
    setAuthError(null);
    const username = loginUsername.trim();
    if (!username || !loginPassword) {
      setAuthError("Username and password are required");
      return;
    }
    try {
      const result = await apiPost<AuthLoginResponse>("/api/auth/login", {
        username,
        password: loginPassword
      });
      setAuthToken(result.token);
      setAuthStatus("authenticated");
      setAdminUsername(result.username);
      setCurrentAdminUsername(result.username);
      setLoginPassword("");
    } catch (err) {
      setAuthStatus("unauthenticated");
      setAuthError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const loadAll = async () => {
    if (!canUseApi) return;
    try {
      setError(null);
      const [
        activityData,
        artistData,
        genreData,
        downloadData,
        listData,
        plexData,
        youtubeData,
        integrationsData,
        streamSettingsData,
        downloadSettingsData,
        searchSettingsData,
        generalSettingsData,
        adminSettingsData
      ] = await Promise.all([
        apiGet<ActivityEvent[]>("/api/activity"),
        apiGet<Artist[]>("/api/artists"),
        apiGet<Genre[]>("/api/genres"),
        apiGet<DownloadJob[]>("/api/downloads"),
        apiGet<ListSource[]>("/api/lists"),
        apiGet<PlexStatus>("/api/plex/status"),
        apiGet<YoutubeSettings>("/api/settings/youtube"),
        apiGet<IntegrationSettings>("/api/settings/integrations"),
        apiGet<StreamSettings>("/api/settings/streams"),
        apiGet<DownloadSettings>("/api/settings/downloads"),
        apiGet<SearchSettings>("/api/settings/search"),
        apiGet<GeneralSettings>("/api/settings/general"),
        apiGet<AdminSettings>("/api/settings/admin")
      ]);
      setActivity(activityData);
      setArtists(artistData);
      setGenres(genreData);
      setDownloads(downloadData);
      setLists(listData);
      setPlexStatus(plexData);
      setYoutubeStatus(youtubeData);
      setIntegrationsStatus(integrationsData);
      setStreamSettings(streamSettingsData);
      setDownloadSettings(downloadSettingsData);
      setSearchSettings(searchSettingsData);
      setYoutubeCookiesPath(youtubeData?.cookiesPath ?? "");
      setYoutubeCookiesBrowser(youtubeData?.cookiesFromBrowser ?? "");
      setYoutubeCookiesHeader(youtubeData?.cookiesHeader ?? "");
      setYoutubeOutputFormat(youtubeData?.outputFormat ?? "original");
      setDownloadConcurrency(downloadSettingsData?.concurrency ?? 2);
      setSkipNonOfficialMusicVideos(searchSettingsData?.skipNonOfficialMusicVideos ?? false);
      setAudiodbApiKey(integrationsData?.audiodbApiKey ?? "");
      setLastfmApiKey(integrationsData?.lastfmApiKey ?? "");
      setStreamToken(streamSettingsData?.token ?? "");
      setStreamEnabled(streamSettingsData?.enabled ?? true);
      setGeneralMediaRoot(generalSettingsData.mediaRoot ?? "");
      setGeneralDomain(generalSettingsData.domain ?? "");
      setGeneralPublicApiBaseUrl(generalSettingsData.publicApiBaseUrl ?? "");
      setAdminUsername(adminSettingsData.username ?? "");
      setCurrentAdminUsername(adminSettingsData.username ?? "");
      if (plexData?.baseUrl) {
        setPlexBaseUrl(plexData.baseUrl);
      }
    } catch (err) {
      if (handleAuthFailure(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  };

  const loadDownloadsOnly = async () => {
    if (!canUseApi) return;
    try {
      const downloadData = await apiGet<DownloadJob[]>("/api/downloads");
      setDownloads(downloadData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load downloads");
    }
  };

  const loadDashboardStats = async () => {
    if (!canUseApi) return;
    try {
      const stats = await apiGet<DashboardStats>("/api/stats");
      setDashboardStats(stats);
    } catch (err) {
      setDashboardStats(null);
      setError(err instanceof Error ? err.message : "Failed to load dashboard stats");
    }
  };

  const loadStreamingStatsHistory = async () => {
    if (!canUseApi) return;
    try {
      const samples = await apiGet<DashboardStatsSample[]>("/api/stats/history");
      setStreamingStatsHistory(samples);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load streaming stats history");
    }
  };

  const loadArtistsOnly = async () => {
    if (!canUseApi) return;
    try {
      const artistData = await apiGet<Artist[]>("/api/artists");
      setArtists(artistData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artists");
    }
  };

  const loadArtistImportJobs = async () => {
    if (!canUseApi) return;
    try {
      const jobs = await apiGet<ArtistImportJob[]>("/api/artists/imports/active");
      
      // Detect completed jobs (were in previous set, now gone)
      const currentJobIds = new Set(jobs.map((job) => job.id));
      const trackedJobIds = new Set<number>([
        ...previousImportJobIds.current,
        ...recentImportJobIds.current
      ]);
      const completedJobIds = [...trackedJobIds].filter((id) => !currentJobIds.has(id));
      
      if (completedJobIds.length > 0) {
        console.log(`${completedJobIds.length} import job(s) completed, refreshing UI...`);
        if (isArtistDetailRoute && artistRouteId) {
          void loadArtistDetail(artistRouteId);
        } else if (activeTab === "Artists") {
          void loadArtistsOnly();
        } else if (activeTab === "Dashboard") {
          void loadDashboardStats();
          void loadArtistsOnly();
        }
      }
      
      // Clean up completed tracked jobs
      for (const id of completedJobIds) {
        recentImportJobIds.current.delete(id);
      }

      // Update tracked job IDs
      previousImportJobIds.current = currentJobIds;
      setArtistImportJobs(jobs);
    } catch (err) {
      // Silent fail - not critical
      console.error("Failed to load import jobs:", err);
    }
  };

  const loadStreams = async (): Promise<StreamSummary[] | null> => {
    if (!canUseApi) return null;
    setStreamsLoading(true);
    try {
      const data = await apiGet<StreamSummary[]>("/api/streams");
      setStreams(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load streams");
    } finally {
      setStreamsLoading(false);
    }
    return null;
  };

  const searchStreamTracks = async (query: string) => {
    if (!canUseApi) return;
    setStreamTrackLoading(true);
    try {
      const result = await apiGet<StreamTrackOption[]>(
        `/api/streams/tracks?query=${encodeURIComponent(query)}`
      );
      setStreamTrackResults(result);
    } catch (err) {
      setStreamTrackResults([]);
      setError(err instanceof Error ? err.message : "Failed to search tracks");
    } finally {
      setStreamTrackLoading(false);
    }
  };

  const searchEditingStreamTracks = async (query: string) => {
    if (!canUseApi) return;
    setEditingStreamTrackLoading(true);
    try {
      const result = await apiGet<StreamTrackOption[]>(
        `/api/streams/tracks?query=${encodeURIComponent(query)}`
      );
      setEditingStreamTrackResults(result);
    } catch (err) {
      setEditingStreamTrackResults([]);
      setError(err instanceof Error ? err.message : "Failed to search tracks");
    } finally {
      setEditingStreamTrackLoading(false);
    }
  };

  const addStreamTrack = (track: StreamTrackOption) => {
    setSelectedStreamTracks((prev) => {
      if (prev.some((item) => item.id === track.id)) {
        return prev;
      }
      return [...prev, track];
    });
  };

  const removeStreamTrack = (trackId: number) => {
    setSelectedStreamTracks((prev) => prev.filter((item) => item.id !== trackId));
  };

  const moveStreamTrack = (index: number, direction: number) => {
    setSelectedStreamTracks((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const toggleStreamArtist = (artistId: number) => {
    setStreamArtistIds((prev) =>
      prev.includes(artistId) ? prev.filter((id) => id !== artistId) : [...prev, artistId]
    );
  };

  const toggleStreamGenre = (genreId: number) => {
    setStreamGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const mergeEditingStreamTracks = (tracks: StreamTrackOption[]) => {
    if (tracks.length === 0) return;
    setEditingStreamTracks((prev) => {
      const existing = new Set(prev.map((item) => item.id));
      const next = [...prev];
      for (const track of tracks) {
        if (existing.has(track.id)) continue;
        existing.add(track.id);
        next.push(track);
      }
      return next;
    });
  };

  const toggleEditingStreamArtist = async (artist: Artist) => {
    const isSelected = editingStreamArtistIds.includes(artist.id);
    if (isSelected) {
      const matchName = artist.name.toLowerCase();
      setEditingStreamArtistIds((prev) => prev.filter((id) => id !== artist.id));
      setEditingStreamTracks((prev) =>
        prev.filter((track) => (track.artist_name ?? "").toLowerCase() !== matchName)
      );
      return;
    }
    setEditingStreamArtistIds((prev) => [...prev, artist.id]);
    setEditingStreamArtistLoadingIds((prev) => [...prev, artist.id]);
    try {
      const detail = await apiGet<ArtistDetail>(`/api/artists/${artist.id}`);
      const artistTracks: StreamTrackOption[] = [];
      for (const album of detail.albums) {
        for (const track of album.tracks) {
          if (!track.downloaded) continue;
          artistTracks.push({
            id: track.id,
            title: track.title,
            album_title: album.title,
            artist_name: detail.artist.name
          });
        }
      }
      if (artistTracks.length === 0) {
        setError(`No downloaded tracks for ${detail.artist.name}.`);
        setEditingStreamArtistIds((prev) => prev.filter((id) => id !== artist.id));
        return;
      }
      mergeEditingStreamTracks(artistTracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artist tracks");
      setEditingStreamArtistIds((prev) => prev.filter((id) => id !== artist.id));
    } finally {
      setEditingStreamArtistLoadingIds((prev) => prev.filter((id) => id !== artist.id));
    }
  };

  const addEditingStreamTrack = (track: StreamTrackOption) => {
    setEditingStreamTracks((prev) => {
      if (prev.some((item) => item.id === track.id)) {
        return prev;
      }
      return [...prev, track];
    });
  };

  const getOrderedEditingStreamSelection = (
    tracks: StreamTrackOption[],
    selectedIds: number[]
  ) => {
    const selected = new Set(selectedIds);
    return tracks.filter((track) => selected.has(track.id)).map((track) => track.id);
  };

  const handleEditingStreamTrackSelect = (
    event: React.MouseEvent<HTMLLIElement>,
    index: number,
    trackId: number
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    if (event.shiftKey && editingStreamSelectionAnchor.current !== null) {
      const start = Math.min(editingStreamSelectionAnchor.current, index);
      const end = Math.max(editingStreamSelectionAnchor.current, index);
      const rangeIds = editingStreamTracks.slice(start, end + 1).map((track) => track.id);
      setEditingStreamSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return getOrderedEditingStreamSelection(editingStreamTracks, Array.from(next));
      });
    } else {
      setEditingStreamSelectedIds([trackId]);
    }
    editingStreamSelectionAnchor.current = index;
  };

  const ensureEditingStreamSelection = (trackId: number, index: number) => {
    if (editingStreamSelectedIds.includes(trackId)) {
      return editingStreamSelectedIds;
    }
    const next = [trackId];
    setEditingStreamSelectedIds(next);
    editingStreamSelectionAnchor.current = index;
    return next;
  };

  const removeEditingStreamTrack = (trackId: number) => {
    setEditingStreamTracks((prev) => prev.filter((item) => item.id !== trackId));
    setEditingStreamSelectedIds((prev) => prev.filter((id) => id !== trackId));
  };

  const moveEditingStreamTrack = (index: number, direction: number, trackId: number) => {
    const selection = ensureEditingStreamSelection(trackId, index);
    setEditingStreamTracks((prev) => {
      if (prev.length <= 1) return prev;
      const selected = new Set(selection);
      const next = [...prev];
      if (direction < 0) {
        for (let i = 1; i < next.length; i += 1) {
          if (selected.has(next[i].id) && !selected.has(next[i - 1].id)) {
            [next[i - 1], next[i]] = [next[i], next[i - 1]];
          }
        }
      } else {
        for (let i = next.length - 2; i >= 0; i -= 1) {
          if (selected.has(next[i].id) && !selected.has(next[i + 1].id)) {
            [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        }
      }
      return next;
    });
  };

  const moveEditingStreamTracksToEdge = (
    index: number,
    edge: "top" | "bottom",
    trackId: number
  ) => {
    const selection = ensureEditingStreamSelection(trackId, index);
    setEditingStreamTracks((prev) => {
      if (prev.length <= 1) return prev;
      const orderedSelection = getOrderedEditingStreamSelection(prev, selection);
      const selected = new Set(orderedSelection);
      const picked = prev.filter((item) => selected.has(item.id));
      const remaining = prev.filter((item) => !selected.has(item.id));
      return edge === "top" ? [...picked, ...remaining] : [...remaining, ...picked];
    });
  };

  useEffect(() => {
    setEditingStreamSelectedIds((prev) => {
      if (prev.length === 0) return prev;
      const ordered = getOrderedEditingStreamSelection(editingStreamTracks, prev);
      if (ordered.length === prev.length && ordered.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return ordered;
    });
  }, [editingStreamTracks]);

  const shuffleEditingStreamTracks = () => {
    setEditingStreamTracks((prev) => {
      if (prev.length <= 1) return prev;
      let next = shuffleTracksForEdit(prev);
      let attempts = 0;
      while (isSameTrackOrder(next, prev) && attempts < 5) {
        next = shuffleTracksForEdit(prev);
        attempts += 1;
      }
      return next;
    });
  };

  const toggleStreamExpanded = (streamId: number) => {
    setExpandedStreamIds((prev) =>
      prev.includes(streamId) ? prev.filter((id) => id !== streamId) : [...prev, streamId]
    );
  };

  const toggleStreamMenu = (streamId: number) => {
    setStreamMenuId((prev) => (prev === streamId ? null : streamId));
  };

  const buildStreamHlsUrl = (streamId: number, baseUrl: string) => {
    const token = streamSettings?.token || streamToken;
    if (!token) return "";
    return `${baseUrl}/api/streams/${streamId}/hls/playlist.m3u8?token=${encodeURIComponent(
      token
    )}`;
  };

  const streamLiveUrl = (streamId: number) => buildStreamHlsUrl(streamId, apiBaseUrl);

  const shareableStreamUrl = (streamId: number) => {
    const base =
      generalPublicApiBaseUrl.trim() || generalDomain.trim() || apiBaseUrl;
    return buildStreamHlsUrl(streamId, base);
  };

  const escapeM3uValue = (value: string) =>
    value.replace(/[\r\n]+/g, " ").replace(/"/g, "'").trim();

  const downloadStreamsM3u = () => {
    const token = streamSettings?.token || streamToken;
    if (!token) {
      setError("Load the stream token in Settings to generate shareable URLs.");
      return;
    }
    if (streams.length === 0) {
      setError("No streams available to export.");
      return;
    }
    const base =
      generalPublicApiBaseUrl.trim() || generalDomain.trim() || apiBaseUrl;
    const sortedStreams = [...streams].sort((a, b) => {
      const aName = a.name?.trim() || `Stream ${a.id}`;
      const bName = b.name?.trim() || `Stream ${b.id}`;
      return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" });
    });
    const lines = sortedStreams
      .map((stream) => {
        const url = buildStreamHlsUrl(stream.id, base);
        if (!url) return null;
        const safeName = escapeM3uValue(stream.name || `Stream ${stream.id}`);
        const tags = [
          `tvg-id="stream-${stream.id}"`,
          `tvg-name="${safeName}"`,
          `group-title="Streams"`
        ];
        const iconValue = stream.icon?.trim();
        if (iconValue && /^https?:\/\//i.test(iconValue)) {
          tags.push(`tvg-logo="${escapeM3uValue(iconValue)}"`);
        }
        return `#EXTINF:-1 ${tags.join(" ")},${safeName}\n${url}`;
      })
      .filter((line): line is string => Boolean(line));
    if (lines.length === 0) {
      setError("No streams with shareable URLs available.");
      return;
    }
    const content = ["#EXTM3U", ...lines].join("\n");
    const blob = new Blob([content], { type: "audio/x-mpegurl;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "streams.m3u";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const createStream = async () => {
    const trimmedName = streamName.trim();
    if (!trimmedName) {
      setError("Stream name is required");
      return;
    }
    setIsCreatingStream(true);
    setError(null);
    try {
      const trimmedIcon = streamIcon.trim();
      const payload: {
        name: string;
        shuffle: boolean;
        encoding: StreamEncoding;
        icon?: string;
        trackIds?: number[];
        artistIds?: number[];
        genreIds?: number[];
      } = {
        name: trimmedName,
        shuffle: streamShuffle,
        encoding: streamEncoding
      };
      if (trimmedIcon) {
        payload.icon = trimmedIcon;
      }

      if (streamSource === "manual") {
        if (selectedStreamTracks.length === 0) {
          setError("Pick at least one track");
          setIsCreatingStream(false);
          return;
        }
        payload.trackIds = selectedStreamTracks.map((track) => track.id);
      } else if (streamSource === "artists") {
        if (streamArtistIds.length === 0) {
          setError("Pick at least one artist");
          setIsCreatingStream(false);
          return;
        }
        payload.artistIds = streamArtistIds;
      } else {
        if (streamGenreIds.length === 0) {
          setError("Pick at least one genre");
          setIsCreatingStream(false);
          return;
        }
        payload.genreIds = streamGenreIds;
      }

      await apiPost<StreamSummary>("/api/streams", {
        ...payload
      });
      setStreamName("");
      setStreamIcon("");
      setStreamShuffle(false);
      setStreamEncoding("original");
      setStreamArtistIds([]);
      setStreamGenreIds([]);
      setStreamArtistQuery("");
      setStreamGenreQuery("");
      setStreamTrackQuery("");
      setStreamTrackResults([]);
      setSelectedStreamTracks([]);
      await loadStreams();
      navigate("/streams");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stream");
    } finally {
      setIsCreatingStream(false);
    }
  };

  const beginEditStream = (stream: StreamSummary) => {
    setEditingStreamId(stream.id);
    setEditingStreamName(stream.name);
    setEditingStreamIcon(stream.icon ?? "");
    setEditingStreamEncoding(stream.encoding);
    setEditingStreamShuffle(stream.shuffle);
    setEditingStreamStatus(stream.status);
    setEditingStreamRestartOnSave(stream.status === "active");
    const artistIds = new Set<number>();
    for (const item of stream.items) {
      if (!item.artist_name) continue;
      const match = artists.find(
        (artist) => artist.name.toLowerCase() === item.artist_name?.toLowerCase()
      );
      if (match) {
        artistIds.add(match.id);
      }
    }
    setEditingStreamArtistIds([...artistIds]);
    setEditingStreamArtistQuery("");
    setEditingStreamArtistLoadingIds([]);
    setEditingStreamTracks(
      stream.items.map((item) => ({
        id: item.track_id,
        title: item.title,
        album_title: item.album_title,
        artist_name: item.artist_name
      }))
    );
    setEditingStreamSelectedIds([]);
    editingStreamSelectionAnchor.current = null;
    setEditingStreamTrackQuery("");
    setEditingStreamTrackResults([]);
  };

  const cancelEditStream = () => {
    setEditingStreamId(null);
    setEditingStreamName("");
    setEditingStreamIcon("");
    setEditingStreamEncoding("original");
    setEditingStreamShuffle(false);
    setEditingStreamStatus("active");
    setEditingStreamRestartOnSave(true);
    setEditingStreamTab("artists");
    setEditingStreamTracks([]);
    setEditingStreamSelectedIds([]);
    editingStreamSelectionAnchor.current = null;
    setEditingStreamArtistQuery("");
    setEditingStreamArtistIds([]);
    setEditingStreamArtistLoadingIds([]);
    setEditingStreamTrackQuery("");
    setEditingStreamTrackResults([]);
  };

  const saveStreamEdits = async () => {
    if (!editingStreamId) {
      return;
    }
    const streamId = editingStreamId;
    const trimmedName = editingStreamName.trim();
    if (!trimmedName) {
      setError("Stream name is required");
      return;
    }
    if (editingStreamTracks.length === 0) {
      setError("Pick at least one track");
      return;
    }
    setError(null);
    try {
      await apiPatch<StreamSummary>(`/api/streams/${streamId}`, {
        name: trimmedName,
        icon: editingStreamIcon.trim(),
        shuffle: editingStreamShuffle,
        encoding: editingStreamEncoding,
        status: editingStreamStatus
      });
      await apiPut<StreamSummary>(`/api/streams/${streamId}/items`, {
        trackIds: editingStreamTracks.map((track) => track.id)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stream");
      return;
    }

    const shouldRestart = editingStreamRestartOnSave;
    if (shouldRestart) {
      const action = editingStreamStatus === "active" ? "reboot" : "start";
      try {
        await apiPost<StreamSummary>(`/api/streams/${streamId}/actions`, { action });
      } catch (err) {
        const actionLabel = action === "reboot" ? "restart" : "start";
        const message =
          err instanceof Error
            ? `Stream saved, but ${actionLabel} failed: ${err.message}`
            : `Stream saved, but ${actionLabel} failed`;
        setError(message);
      }
    }
    await loadStreams();
    cancelEditStream();
  };

  const updateEditingStreamTracks = (stream: StreamSummary) => {
    if (editingStreamId !== stream.id) return;
    setEditingStreamTracks(
      stream.items.map((item) => ({
        id: item.track_id,
        title: item.title,
        album_title: item.album_title,
        artist_name: item.artist_name
      }))
    );
    setEditingStreamSelectedIds([]);
    editingStreamSelectionAnchor.current = null;
    setEditingStreamStatus(stream.status);
  };

  const rescanStream = async (streamId: number, artistIds?: number[]) => {
    setError(null);
    setRescanningStreamIds((prev) => (prev.includes(streamId) ? prev : [...prev, streamId]));
    try {
      const payload = artistIds && artistIds.length > 0 ? { artistIds } : {};
      const result = await apiPost<StreamSummary>(`/api/streams/${streamId}/rescan`, payload);
      updateEditingStreamTracks(result);
      await loadStreams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rescan stream");
    } finally {
      setRescanningStreamIds((prev) => prev.filter((id) => id !== streamId));
    }
  };

  const rescanEditingStream = async () => {
    if (!editingStreamId) return;
    if (editingStreamArtistIds.length === 0) {
      setError("Select at least one artist to rescan.");
      return;
    }
    await rescanStream(editingStreamId, editingStreamArtistIds);
  };

  const runStreamAction = async (
    streamId: number,
    action: "start" | "stop" | "reboot"
  ) => {
    setError(null);
    if (action === "reboot") {
      setRestartingStreamIds((prev) =>
        prev.includes(streamId) ? prev : [...prev, streamId]
      );
    }
    try {
      const result = await apiPost<StreamSummary>(`/api/streams/${streamId}/actions`, { action });
      const updated = await loadStreams();
      if (action === "reboot") {
        const latest = updated?.find((stream) => stream.id === streamId) ?? result;
        if (latest?.status === "active") {
          setRestartingStreamIds((prev) => prev.filter((id) => id !== streamId));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stream status");
      if (action === "reboot") {
        setRestartingStreamIds((prev) => prev.filter((id) => id !== streamId));
      }
    }
  };

  const openStreamPlayer = (streamId: number) => {
    setPlayingStreamId(streamId);
    setStreamPlayerNotice(null);
  };

  const closeStreamPlayer = () => {
    setPlayingStreamId(null);
    setStreamPlayerNotice(null);
  };
  const playingStream = useMemo(
    () => streams.find((item) => item.id === playingStreamId) ?? null,
    [playingStreamId, streams]
  );
  const connectionsModalStream = useMemo(
    () => streams.find((item) => item.id === connectionsModalStreamId) ?? null,
    [connectionsModalStreamId, streams]
  );
  const playingStreamReloadKey = useMemo(() => {
    if (!playingStream) return null;
    const token = streamSettings?.token || streamToken || "";
    return `${playingStream.id}:${playingStream.status}:${playingStream.encoding}:${token}`;
  }, [playingStream, streamSettings?.token, streamToken]);
  useEffect(() => {
    if (!playingStreamId) {
      if (streamHlsRef.current) {
        streamHlsRef.current.destroy();
        streamHlsRef.current = null;
      }
      return;
    }
    const video = streamPlayerRef.current;
    if (!video) {
      return;
    }
    const stream = playingStream;
    if (!stream) {
      return;
    }
    const hlsUrl = streamLiveUrl(stream.id);
    if (!hlsUrl) {
      return;
    }
    if (streamHlsRef.current) {
      streamHlsRef.current.destroy();
      streamHlsRef.current = null;
    }
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30
      });
      streamHlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean }) => {
        if (data.fatal) {
          hls.destroy();
          streamHlsRef.current = null;
          setStreamPlayerNotice("HLS playback error. Please try refreshing.");
        }
      });
    } else {
      const canPlay =
        video.canPlayType("application/vnd.apple.mpegurl") ||
        video.canPlayType("application/x-mpegURL");
      if (canPlay) {
        video.src = hlsUrl;
        video.load();
      } else {
        setStreamPlayerNotice("HLS not supported in this browser.");
      }
    }
    return () => {
      if (streamHlsRef.current) {
        streamHlsRef.current.destroy();
        streamHlsRef.current = null;
      }
    };
  }, [playingStreamId, playingStreamReloadKey]);

  const deleteStream = async (streamId: number, streamName: string) => {
    const confirmed = window.confirm(`Delete stream "${streamName}"?`);
    if (!confirmed) return;
    setError(null);
    try {
      await apiDelete(`/api/streams/${streamId}`);
      setStreams((prev) => prev.filter((stream) => stream.id !== streamId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete stream");
    }
  };

  const loadLastfmTags = async () => {
    if (!canUseApi) return;
    setLastfmTagsStatus("loading");
    try {
      const result = await apiGet<{ tags: string[] }>("/api/genres/tags?limit=1000");
      setLastfmTags(result.tags);
      setLastfmTagsError(null);
      setLastfmTagsStatus("idle");
    } catch (err) {
      setLastfmTags([]);
      setLastfmTagsStatus("error");
      setLastfmTagsError(err instanceof Error ? err.message : "Failed to load Last.fm tags");
    }
  };

  const loadGenreImportJob = async (jobId: string) => {
    if (!canUseApi) return;
    try {
      const job = await apiGet<GenreImportJob>(`/api/genres/import/jobs/${jobId}`);
      setGenreImportJob(job);
      if (job.status === "completed" || job.status === "failed") {
        await loadAll();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load import job");
    }
  };

  const changeTab = (tab: (typeof tabs)[number]) => {
    navigate(tabRoutes[tab]);
    if (tab === "Dashboard") {
      void loadAll();
    }
  };

  const changeSettingsTab = (tabId: SettingsTabId) => {
    navigate(`/settings#${tabId}`);
  };

  const tabIcon = (tab: (typeof tabs)[number]) => {
    switch (tab) {
      case "Dashboard":
        return <HomeIcon />;
      case "Artists":
        return <ArtistIcon />;
      case "Downloads":
        return <DownloadIcon />;
      case "Lists":
        return <ListIcon />;
      case "Streams":
        return <StreamIcon />;
      case "Logs":
        return <LogsIcon />;
      case "Settings":
        return <SettingsIcon />;
      default:
        return null;
    }
  };

  const visibleTabs = useMemo(
    () => (streamsEnabled ? tabs : tabs.filter((tab) => tab !== "Streams")),
    [streamsEnabled]
  );

  useEffect(() => {
    void loadSetupStatus();
  }, []);

  useEffect(() => {
    if (setupStatus === "complete") {
      void refreshAuthStatus();
    }
  }, [setupStatus]);

  useEffect(() => {
    if (canUseApi) {
      void loadAll();
    }
  }, [canUseApi]);

  useEffect(() => {
    if (canUseApi) {
      void loadLastfmTags();
    }
  }, [canUseApi]);

  useEffect(() => {
    if (!canUseApi) return;
    // Poll artist import jobs every 3 seconds
    void loadArtistImportJobs();
    const interval = window.setInterval(() => {
      void loadArtistImportJobs();
    }, 3000);
    return () => {
      window.clearInterval(interval);
    };
  }, [canUseApi]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!genreImportJob?.id) return;
    if (genreImportJob.status !== "queued" && genreImportJob.status !== "running") {
      return;
    }
    const interval = window.setInterval(() => {
      void loadGenreImportJob(genreImportJob.id);
    }, 1500);
    return () => {
      window.clearInterval(interval);
    };
  }, [canUseApi, genreImportJob?.id, genreImportJob?.status]);

  useEffect(() => {
    return () => {
      if (generalSaveTimeout.current) {
        clearTimeout(generalSaveTimeout.current);
      }
      if (adminSaveTimeout.current) {
        clearTimeout(adminSaveTimeout.current);
      }
      if (integrationsSaveTimeout.current) {
        clearTimeout(integrationsSaveTimeout.current);
      }
      if (youtubeSaveTimeout.current) {
        clearTimeout(youtubeSaveTimeout.current);
      }
      if (streamTokenSaveTimeout.current) {
        clearTimeout(streamTokenSaveTimeout.current);
      }
      if (downloadSaveTimeout.current) {
        clearTimeout(downloadSaveTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (location.pathname === "/") {
      navigate("/dashboard", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!canUseApi) return;
    if (location.pathname === "/dashboard") {
      void loadAll();
      void loadDashboardStats();
    }
  }, [canUseApi, location.pathname]);

  useEffect(() => {
    if (!canUseApi) return;
    if (location.pathname !== "/dashboard") return;
    void loadStreamingStatsHistory();
    const interval = window.setInterval(() => {
      void loadStreamingStatsHistory();
    }, DASHBOARD_STATS_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [canUseApi, location.pathname]);

  useEffect(() => {
    if (!canUseApi) return;
    if (streamsEnabled && location.pathname.startsWith("/streams")) {
      void loadStreams();
    }
  }, [canUseApi, location.pathname, streamsEnabled]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!streamsEnabled || activeTab !== "Streams" || isStreamCreateRoute) return;
    if (!streams.some((stream) => stream.status === "active")) return;
    const interval = window.setInterval(() => {
      void loadStreams();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeTab, canUseApi, isStreamCreateRoute, streams, streamsEnabled]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!streamsEnabled || activeTab !== "Streams" || streamSource !== "manual") return;
    const trimmed = streamTrackQuery.trim();
    if (!trimmed) {
      setStreamTrackResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchStreamTracks(trimmed);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTab, canUseApi, streamSource, streamTrackQuery, streamsEnabled]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!editingStreamId) return;
    const trimmed = editingStreamTrackQuery.trim();
    if (!trimmed) {
      setEditingStreamTrackResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchEditingStreamTracks(trimmed);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [canUseApi, editingStreamId, editingStreamTrackQuery]);


  useEffect(() => {
    if (!artistDetail || artistDetail.albums.length === 0) {
      setExpandedAlbumIds([]);
      return;
    }
    const albumIds = new Set(artistDetail.albums.map((album) => album.id));
    setExpandedAlbumIds((prev) => {
      const preserved = prev.filter((id) => albumIds.has(id));
      if (preserved.length > 0) {
        return preserved;
      }
      const sorted = [...artistDetail.albums].sort((a, b) => {
        const yearA = a.year ?? 0;
        const yearB = b.year ?? 0;
        if (yearA !== yearB) {
          return yearB - yearA;
        }
        return a.title.localeCompare(b.title);
      });
      return sorted[0] ? [sorted[0].id] : [];
    });
  }, [artistDetail]);

  useEffect(() => {
    if (!monitorNotice) return;
    const timer = setTimeout(() => setMonitorNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [monitorNotice]);

  useEffect(() => {
    if (!genreImportNotice) return;
    const timer = setTimeout(() => setGenreImportNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [genreImportNotice]);

  const hasActiveArtistDownloads = useMemo(() => {
    if (!artistDetail) {
      return false;
    }
    return artistDetail.albums.some((album) =>
      album.tracks.some(
        (track) => track.download_status === "queued" || track.download_status === "downloading"
      )
    );
  }, [artistDetail]);

  const artistHasDownloads = useMemo(() => {
    if (!artistDetail) {
      return false;
    }
    return artistDetail.albums.some((album) => album.tracks.some((track) => track.downloaded));
  }, [artistDetail]);

  const scrollToArtistSettings = () => {
    artistSettingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToArtistTracks = () => {
    artistTracksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const artistDownloadProgress = useMemo(() => {
    if (!artistDetail) {
      return buildDownloadProgress(0, 0);
    }
    let monitored = 0;
    let downloaded = 0;
    for (const album of artistDetail.albums) {
      for (const track of album.tracks) {
        if (!track.monitored) continue;
        monitored += 1;
        if (track.downloaded) {
          downloaded += 1;
        }
      }
    }
    return buildDownloadProgress(downloaded, monitored);
  }, [artistDetail]);

  useEffect(() => {
    if (!canUseApi) return;
    if (isArtistDetailRoute && artistRouteId) {
      if (artistRouteId !== selectedArtistId) {
        void loadArtistDetail(artistRouteId);
      }
    } else if (location.pathname === "/artists") {
      setArtistDetail(null);
      setSelectedArtistId(null);
    }
  }, [canUseApi, isArtistDetailRoute, artistRouteId, location.pathname, selectedArtistId]);

  useEffect(() => {
    if (!artistDetail) {
      setSelectedAlbumIds([]);
      return;
    }
    setSelectedAlbumIds([]);
  }, [artistDetail]);

  useEffect(() => {
    if (!isDraggingPlayer) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const next = clampPlayerPosition(
        event.clientX - playerDragOffset.current.x,
        event.clientY - playerDragOffset.current.y
      );
      setPlayerPosition(next);
    };
    const handleUp = () => {
      setIsDraggingPlayer(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDraggingPlayer]);

  useEffect(() => {
    if (!isArtistDetailRoute || !artistDetail || !hasActiveArtistDownloads) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadArtistDetail(artistDetail.artist.id);
    }, 4000);
    return () => {
      window.clearInterval(interval);
    };
  }, [isArtistDetailRoute, artistDetail, hasActiveArtistDownloads]);

  const loadArtistDetail = async (artistId: number) => {
    const [detail, prefs] = await Promise.all([
      apiGet<ArtistDetail>(`/api/artists/${artistId}`),
      apiGet<ArtistPreference>(`/api/artists/${artistId}/preferences`)
    ]);
    setSelectedArtistId(artistId);
    setArtistDetail(detail);
    setArtistPreferences(prefs);
    setImportMode(prefs.import_mode);
    setImportQuality(prefs.quality);
    setImportAutoDownload(prefs.auto_download);
  };

  const openArtistPage = async (artistId: number) => {
    navigate(`/artists/${artistId}`);
    await loadArtistDetail(artistId);
  };

  const catalogSummary = useMemo(() => {
    return {
      artistCount: artists.length,
      genreCount: genres.length,
      downloadCount: downloads.length
    };
  }, [artists.length, genres.length, downloads.length]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const showSearchPanel = searchTerm.trim().length >= 2;

  const filteredActivity = useMemo(() => {
    if (!normalizedSearch) return activity;
    return activity.filter((event) => event.message.toLowerCase().includes(normalizedSearch));
  }, [activity, normalizedSearch]);

  const filteredArtists = useMemo(() => {
    if (!normalizedSearch) return artists;
    return artists.filter((artist) => matchesArtistQuery(artist.name, normalizedSearch));
  }, [artists, normalizedSearch]);

  const filteredGenres = useMemo(() => {
    if (!normalizedSearch) return genres;
    return genres.filter((genre) => genre.name.toLowerCase().includes(normalizedSearch));
  }, [genres, normalizedSearch]);

  const filteredStreamArtists = useMemo(() => {
    const query = streamArtistQuery.trim().toLowerCase();
    if (!query) return artists;
    return artists.filter((artist) => matchesArtistQuery(artist.name, query));
  }, [artists, streamArtistQuery]);

  const filteredEditingStreamArtists = useMemo(() => {
    const query = editingStreamArtistQuery.trim().toLowerCase();
    if (!query) return artists;
    return artists.filter((artist) => matchesArtistQuery(artist.name, query));
  }, [artists, editingStreamArtistQuery]);

  const filteredStreamGenres = useMemo(() => {
    const query = streamGenreQuery.trim().toLowerCase();
    if (!query) return genres;
    return genres.filter((genre) => genre.name.toLowerCase().includes(query));
  }, [genres, streamGenreQuery]);

  const configuredGenreImports = useMemo(() => {
    return [...genres]
      .filter(
        (genre) =>
          genre.import_source ||
          genre.import_mode ||
          genre.import_limit ||
          genre.import_quality
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [genres]);

  const lastfmTagOptions = useMemo(() => {
    const options = lastfmTags.map((tag) => toSentenceCase(tag));
    const trimmed = genreImportName.trim();
    if (trimmed) {
      const formatted = toSentenceCase(trimmed);
      const exists = options.some((tag) => tag.toLowerCase() === formatted.toLowerCase());
      if (!exists) {
        options.unshift(formatted);
      }
    }
    const unique = new Map<string, string>();
    for (const tag of options) {
      const key = tag.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, tag);
      }
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }, [lastfmTags, genreImportName]);

  const isGenreImportRunning = useMemo(() => {
    return genreImportJob
      ? genreImportJob.status === "queued" || genreImportJob.status === "running"
      : false;
  }, [genreImportJob]);

  const genreImportProgress = useMemo(() => {
    if (!genreImportJob || genreImportJob.total === 0) return 0;
    return Math.min(100, Math.round((genreImportJob.processed / genreImportJob.total) * 100));
  }, [genreImportJob]);

  const filteredDownloads = useMemo(() => {
    if (!normalizedSearch) return downloads;
    return downloads.filter((job) => {
      const displayTitle = (job.display_title ?? job.query).toLowerCase();
      const matchQuery = displayTitle.includes(normalizedSearch);
      const matchStatus = job.status.toLowerCase().includes(normalizedSearch);
      return matchQuery || matchStatus;
    });
  }, [downloads, normalizedSearch]);

  const activeDownloads = useMemo(() => {
    return downloads.filter((job) => job.status === "queued" || job.status === "downloading");
  }, [downloads]);

  const activeDownloadCounts = useMemo(() => {
    const queued = activeDownloads.filter((job) => job.status === "queued").length;
    const downloading = activeDownloads.filter((job) => job.status === "downloading").length;
    return { queued, downloading, total: queued + downloading };
  }, [activeDownloads]);

  const tabLabel = (tab: (typeof tabs)[number]) => {
    if (tab !== "Downloads") return tab;
    if (activeDownloadCounts.total === 0) return "Downloads";
    return (
      <span className="flex items-center justify-between gap-2">
        <span>Downloads</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
          {activeDownloadCounts.downloading} ↓
          <span className="text-emerald-300">·</span>
          {activeDownloadCounts.queued} q
        </span>
      </span>
    );
  };

  const downloadsForDisplay = useMemo(() => {
    const base = normalizedSearch
      ? activeDownloads.filter((job) => {
          const displayTitle = (job.display_title ?? job.query).toLowerCase();
          const matchQuery = displayTitle.includes(normalizedSearch);
          const matchStatus = job.status.toLowerCase().includes(normalizedSearch);
          return matchQuery || matchStatus;
        })
      : activeDownloads;
    const priority: Record<string, number> = { downloading: 0, queued: 1 };
    return [...base].sort((a, b) => {
      const priorityDiff = (priority[a.status] ?? 2) - (priority[b.status] ?? 2);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [activeDownloads, normalizedSearch]);

  const downloadsPageCount = useMemo(() => {
    return Math.max(1, Math.ceil(downloadsForDisplay.length / DOWNLOADS_PAGE_SIZE));
  }, [downloadsForDisplay.length]);

  const downloadsPageItems = useMemo(() => {
    const start = (downloadsPage - 1) * DOWNLOADS_PAGE_SIZE;
    return downloadsForDisplay.slice(start, start + DOWNLOADS_PAGE_SIZE);
  }, [downloadsForDisplay, downloadsPage]);

  useEffect(() => {
    setDownloadsPage((prev) => {
      const next = Math.min(Math.max(prev, 1), downloadsPageCount);
      return prev === next ? prev : next;
    });
  }, [downloadsPageCount]);

  // Poll downloads - fast when active, slow when idle
  const downloadsIntervalRef = useRef<number | null>(null);
  const lastDownloadPollMode = useRef<"fast" | "slow" | null>(null);

  useEffect(() => {
    const hasActiveDownloads = activeDownloadCounts.total > 0;
    const shouldPollFast = hasActiveDownloads || location.pathname === "/downloads";
    const currentMode = shouldPollFast ? "fast" : "slow";

    const pollDownloads = () => {
      void loadDownloadsOnly();
      if (hasActiveDownloads) {
        void loadArtistsOnly();
      }
    };
    
    // Create or recreate interval when mode changes
    if (downloadsIntervalRef.current === null || currentMode !== lastDownloadPollMode.current) {
      if (downloadsIntervalRef.current !== null) {
        window.clearInterval(downloadsIntervalRef.current);
      }
    const intervalMs = shouldPollFast ? 2000 : 15000;
      downloadsIntervalRef.current = window.setInterval(() => {
        pollDownloads();
    }, intervalMs);
      lastDownloadPollMode.current = currentMode;
    }
    pollDownloads();
    
    return () => {
      if (downloadsIntervalRef.current !== null) {
        window.clearInterval(downloadsIntervalRef.current);
        downloadsIntervalRef.current = null;
      }
    };
  }, [activeDownloadCounts.total, location.pathname]);

  const filteredLists = useMemo(() => {
    if (!normalizedSearch) return lists;
    return lists.filter((list) => {
      const matchName = list.name.toLowerCase().includes(normalizedSearch);
      const matchType = list.type.toLowerCase().includes(normalizedSearch);
      const matchId = list.external_id.toLowerCase().includes(normalizedSearch);
      return matchName || matchType || matchId;
    });
  }, [lists, normalizedSearch]);

  type LocalSearchMatch = Pick<Artist, "id" | "name" | "image_url" | "genres">;
  const localSearchMatches = useMemo<LocalSearchMatch[]>(() => {
    if (!showSearchPanel) return [];
    const byId = new Map<number, LocalSearchMatch>();
    const localResults = searchResults.filter((result) => result.source === "local");
    for (const result of localResults) {
      const id = Number(result.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      const existing = artists.find((artist) => artist.id === id);
      if (existing) {
        byId.set(id, {
          id: existing.id,
          name: existing.name,
          image_url: existing.image_url,
          genres: existing.genres
        });
      } else {
        byId.set(id, {
          id,
          name: result.name,
          image_url: result.thumb,
          genres: []
        });
      }
    }
    if (byId.size === 0) {
      artists
        .filter((artist) => matchesArtistQuery(artist.name, normalizedSearch))
        .slice(0, 5)
        .forEach((artist) => {
          byId.set(artist.id, {
            id: artist.id,
            name: artist.name,
            image_url: artist.image_url,
            genres: artist.genres
          });
        });
    }
    return Array.from(byId.values());
  }, [artists, normalizedSearch, searchResults, showSearchPanel]);

  const sortedArtists = useMemo(() => {
    const data = [...filteredArtists];
    data.sort((a, b) => {
      if (artistSortKey === "name") {
        const cmp = a.name.localeCompare(b.name);
        return artistSortDirection === "asc" ? cmp : -cmp;
      }
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      const cmp = timeA - timeB;
      return artistSortDirection === "asc" ? cmp : -cmp;
    });
    return data;
  }, [filteredArtists, artistSortKey, artistSortDirection]);

  const dashboardArtists = useMemo(() => sortedArtists, [sortedArtists]);

  const toggleDashboardSelectMode = () => {
    setDashboardSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedArtistIds([]);
      }
      return next;
    });
  };

  const openDeleteArtistModal = (artistIds: number[], label: string) => {
    if (artistIds.length === 0) return;
    setDeleteArtistModal({ open: true, artistIds, label });
  };

  const closeDeleteArtistModal = () => {
    setDeleteArtistModal({ open: false, artistIds: [], label: "" });
  };

  const performDeleteArtists = async (artistIds: number[]) => {
    await Promise.all(artistIds.map((artistId) => apiDelete(`/api/artists/${artistId}`)));
    clearArtistSelection();
    await loadAll();
    if (selectedArtistId && artistIds.includes(selectedArtistId)) {
      setArtistDetail(null);
      setSelectedArtistId(null);
      if (isArtistDetailRoute) {
        navigate("/");
      }
    }
  };

  const confirmDeleteArtistModal = async () => {
    const ids = deleteArtistModal.artistIds;
    if (ids.length === 0) {
      closeDeleteArtistModal();
      return;
    }
    closeDeleteArtistModal();
    try {
      await performDeleteArtists(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete artist(s)");
    }
  };

  const toggleArtistSelection = (artistId: number) => {
    if (!dashboardSelectMode) {
      return;
    }
    setSelectedArtistIds((prev) =>
      prev.includes(artistId) ? prev.filter((id) => id !== artistId) : [...prev, artistId]
    );
  };

  const clearArtistSelection = () => {
    setSelectedArtistIds([]);
  };

  useEffect(() => {
    if (!deleteArtistModal.open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteArtistModal();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void confirmDeleteArtistModal();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [deleteArtistModal.open]);

  const toggleSelectAllArtists = () => {
    if (!dashboardSelectMode) {
      return;
    }
    if (selectedArtistIds.length === dashboardArtists.length) {
      setSelectedArtistIds([]);
      return;
    }
    setSelectedArtistIds(dashboardArtists.map((artist) => artist.id));
  };

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const results = await apiGet<AudioDbArtist[]>(
          `/api/search/artists?query=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        setSearchResults(results);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setSearchResults([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const addGenre = async () => {
    if (!newGenre.trim()) return;
    await apiPost("/api/genres", { name: newGenre.trim() });
    setNewGenre("");
    await loadAll();
  };

  const resetGenreImportForm = () => {
    setGenreImportId(null);
    setGenreImportName("");
    setGenreImportLimit(50);
    setGenreImportSource("lastfm");
    setGenreImportMode("new");
    setGenreImportQuality("1080p");
    setGenreImportAutoDownload(false);
    setGenreImportEnabled(true);
  };

  const editGenreImport = (genre: Genre) => {
    setGenreImportId(genre.id);
    setGenreImportName(genre.name);
    setGenreImportLimit(genre.import_limit ?? 50);
    setGenreImportSource((genre.import_source as "lastfm") ?? "lastfm");
    setGenreImportMode(genre.import_mode ?? "new");
    setGenreImportQuality(genre.import_quality ?? "1080p");
    setGenreImportAutoDownload(genre.import_auto_download ?? false);
    setGenreImportEnabled(genre.import_enabled ?? true);
  };

  const selectGenreImportTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      resetGenreImportForm();
      return;
    }
    const existing = genres.find(
      (genre) => genre.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      editGenreImport(existing);
      return;
    }
    setGenreImportId(null);
    setGenreImportName(trimmed);
  };

  const saveGenreImportSettings = async () => {
    const trimmed = genreImportName.trim();
    if (!trimmed) return;
    setError(null);
    try {
      let id = genreImportId;
      if (!id) {
        const existing = genres.find(
          (genre) => genre.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) {
          id = existing.id;
          setGenreImportId(existing.id);
        } else {
          const created = await apiPost<Genre>("/api/genres", { name: trimmed });
          id = created.id;
          setGenreImportId(created.id);
        }
      }
      if (!id) return;
      await apiPut<Genre>(`/api/genres/${id}/import`, {
        source: genreImportSource,
        limit: genreImportLimit,
        importMode: genreImportMode,
        quality: genreImportQuality,
        autoDownload: genreImportAutoDownload,
        enabled: genreImportEnabled
      });
      setGenreImportNotice(`Saved settings for ${trimmed}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save genre settings");
    }
  };

  const deleteGenreImportSettings = async (genreId: number, name: string) => {
    const confirmed = window.confirm(`Remove import settings for ${name}?`);
    if (!confirmed) return;
    try {
      await apiDelete(`/api/genres/${genreId}/import`);
      if (genreImportId === genreId) {
        resetGenreImportForm();
      }
      if (genreImportJob?.genre_id === genreId) {
        setGenreImportJob(null);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete genre import settings");
    }
  };

  const runGenreImport = async (options: {
    name: string;
    source: "lastfm";
    limit: number;
    importMode: ArtistPreference["import_mode"];
    quality: ArtistPreference["quality"];
    autoDownload: boolean;
    enabled: boolean;
  }) => {
    const trimmed = options.name.trim();
    if (!trimmed || isGenreImporting) return;
    setError(null);
    setIsGenreImporting(true);
    try {
      const result = await apiPost<GenreImportStartResult>("/api/genres/import", {
        source: options.source,
        genre: trimmed,
        limit: options.limit,
        importMode: options.importMode,
        quality: options.quality,
        autoDownload: options.autoDownload,
        enabled: options.enabled,
        async: true
      });
      setGenreImportNotice(`Queued import for ${trimmed} (${result.total} artists).`);
      setGenreImportJob({
        id: result.jobId,
        genre_id: null,
        genre_name: trimmed,
        source: options.source,
        limit: options.limit,
        import_mode: options.importMode,
        import_quality: options.quality,
        auto_download: options.autoDownload,
        enabled: options.enabled,
        status: "queued",
        processed: 0,
        total: result.total,
        imported: 0,
        skipped: 0,
        errors: 0,
        error_samples: null,
        started_at: null,
        finished_at: null
      });
      void loadGenreImportJob(result.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import genre artists");
    } finally {
      setIsGenreImporting(false);
    }
  };

  const importGenreArtists = async () => {
    await runGenreImport({
      name: genreImportName,
      source: genreImportSource,
      limit: genreImportLimit,
      importMode: genreImportMode,
      quality: genreImportQuality,
      autoDownload: genreImportAutoDownload,
      enabled: genreImportEnabled
    });
  };

  const addArtist = async () => {
    if (!newArtist.trim()) return;
    await apiPost("/api/artists", { name: newArtist.trim(), genreIds: artistGenreIds });
    setNewArtist("");
    setArtistGenreIds([]);
    await loadArtistsOnly();
  };

  const queueDownload = async () => {
    if (!newDownloadQuery.trim()) return;
    const trimmed = newDownloadQuery.trim();
    await apiPost("/api/downloads", {
      query: trimmed,
      displayTitle: trimmed,
      source: "manual"
    });
    setNewDownloadQuery("");
    await loadAll();
  };

  const cancelDownload = async (downloadId: number, label: string) => {
    const confirmed = window.confirm(`Cancel download for "${label}"?`);
    if (!confirmed) return;
    await apiDelete(`/api/downloads/${downloadId}`);
    await loadDownloadsOnly();
  };

  const clearActiveDownloads = async () => {
    const confirmed = window.confirm("Cancel all queued/downloading items?");
    if (!confirmed) return;
    await apiDelete("/api/downloads/active");
    await loadDownloadsOnly();
  };

  const addList = async () => {
    if (!newListId.trim() || !newListName.trim()) return;
    await apiPost("/api/lists", {
      type: newListType,
      externalId: newListId.trim(),
      name: newListName.trim(),
      enabled: true
    });
    setNewListId("");
    setNewListName("");
    await loadAll();
  };

  const savePlexSettings = async () => {
    await apiPost("/api/plex/settings", {
      baseUrl: plexBaseUrl.trim(),
      token: plexToken.trim(),
      librarySectionId: plexSectionId.trim()
    });
    await loadAll();
  };

  const refreshPlex = async () => {
    await apiPost("/api/plex/refresh", {});
    await loadAll();
  };

  const scanPlex = async () => {
    await apiPost("/api/plex/scan", {});
    await loadAll();
  };

  const deleteGenre = async (id: number) => {
    await apiDelete(`/api/genres/${id}`);
    await loadAll();
  };

  const deleteArtist = async (id: number, name?: string) => {
    const label = name?.trim() ? `"${name.trim()}"` : "this artist";
    openDeleteArtistModal([id], label);
  };

  const cancelArtistImport = async (jobId: number, artistName: string) => {
    const confirmed = window.confirm(`Cancel import for "${artistName}"?`);
    if (!confirmed) return;
    try {
      await apiPost(`/api/artists/imports/${jobId}/cancel`, {});
      await loadArtistImportJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel import");
    }
  };

  const importArtist = async (audiodbId: string, artistName?: string) => {
    setIsImportingArtist(true);
    setError(null);
    try {
      const result = await apiPost<{ id?: number; name?: string; jobId?: number; artistName?: string; message?: string }>("/api/artists/import", {
        audiodbId,
        artistName,
        importMode,
        quality: importQuality,
        autoDownload: importAutoDownload
      });
      
      changeTab("Dashboard");
      setSearchTerm("");
      setSearchResults([]);
      setPendingImportArtist(null);
      await loadAll();
      
      // If background import (has jobId), show message and don't navigate
      if (result.jobId) {
        setError(null); // Clear any previous errors
        console.log(`Artist import started: ${result.artistName} (Job ID: ${result.jobId})`);
        recentImportJobIds.current.add(result.jobId);
        // Don't navigate to artist page - it's being imported in background
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add artist");
    } finally {
      setIsImportingArtist(false);
    }
  };

  const openImportModal = (artist: AudioDbArtist) => {
    setPendingImportArtist(artist);
    setImportMode("discography");
    setImportQuality("1080p");
    setImportAutoDownload(true);
  };

  const saveArtistPreferences = async () => {
    if (!selectedArtistId) return;
    await apiPut(`/api/artists/${selectedArtistId}/preferences`, {
      importMode,
      quality: importQuality,
      autoDownload: importAutoDownload
    });
    await loadArtistDetail(selectedArtistId);
  };

  const updateAlbumMonitored = async (albumId: number, monitored: boolean) => {
    await apiPatch(`/api/albums/${albumId}`, { monitored });
    if (selectedArtistId) {
      await loadArtistDetail(selectedArtistId);
    }
    setMonitorNotice(
      monitored
        ? "Album monitored — downloads queued."
        : "Album unmonitored."
    );
  };

  const updateTrackMonitored = async (trackId: number, monitored: boolean) => {
    await apiPatch(`/api/tracks/${trackId}`, { monitored });
    if (selectedArtistId) {
      await loadArtistDetail(selectedArtistId);
    }
    setMonitorNotice(
      monitored
        ? "Track monitored — download queued."
        : "Track unmonitored."
    );
  };

  const queueTrackDownload = async (
    trackId: number,
    trackTitle: string,
    albumTitle: string,
    albumId: number
  ) => {
    if (!artistDetail) return;
    const query = `${artistDetail.artist.name} - ${trackTitle}`;
    await apiPost("/api/downloads", {
      query,
      source: "manual",
      quality: importQuality,
      artistName: artistDetail.artist.name,
      albumTitle,
      trackId,
      albumId
    });
    await loadAll();
    await loadArtistDetail(artistDetail.artist.id);
    setMonitorNotice(`Queued download for ${trackTitle}.`);
  };

  const openYoutubeSearchModal = (track: TrackDetail, album: AlbumDetail) => {
    if (!artistDetail) return;
    const query = `${artistDetail.artist.name} - ${track.title}`;
    setYoutubeSearchContext({
      trackId: track.id,
      trackTitle: track.title,
      albumId: album.id,
      albumTitle: album.title,
      artistName: artistDetail.artist.name
    });
    setYoutubeSearchQuery(query);
    setYoutubeSearchResults([]);
    setYoutubeSearchQuality({});
    setYoutubeSearchError(null);
    void searchYoutubeResults(query);
  };

  const closeYoutubeSearchModal = () => {
    setYoutubeSearchContext(null);
    setYoutubeSearchResults([]);
    setYoutubeSearchQuality({});
    setYoutubeSearchError(null);
    setYoutubeSearchQuery("");
  };

  const resolveDefaultQuality = (qualities: string[]) => {
    if (qualities.includes(importQuality)) {
      return importQuality;
    }
    return qualities[0] ?? "";
  };

  const searchYoutubeResults = async (queryOverride?: string) => {
    const query = (queryOverride ?? youtubeSearchQuery).trim();
    if (!query) {
      setYoutubeSearchResults([]);
      setYoutubeSearchLoading(false);
      return;
    }
    setYoutubeSearchResults([]);
    setYoutubeSearchLoading(true);
    setYoutubeSearchError(null);
    try {
      const results = await apiGet<YoutubeSearchResult[]>(
        `/api/youtube/search?query=${encodeURIComponent(query)}`
      );
      setYoutubeSearchResults(results);
      setYoutubeSearchQuality((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (!next[result.id]) {
            next[result.id] = resolveDefaultQuality(result.qualities);
          }
        }
        return next;
      });
    } catch (err) {
      setYoutubeSearchError(err instanceof Error ? err.message : "Failed to search YouTube");
    } finally {
      setYoutubeSearchLoading(false);
    }
  };

  const downloadYoutubeResult = async (result: YoutubeSearchResult) => {
    if (!youtubeSearchContext) return;
    const selectedQuality = youtubeSearchQuality[result.id];
    const query = result.webpageUrl ?? `https://www.youtube.com/watch?v=${result.id}`;
    await apiPost("/api/downloads", {
      query,
      displayTitle: result.title,
      source: "youtube",
      quality: selectedQuality || undefined,
      artistName: youtubeSearchContext.artistName,
      albumTitle: youtubeSearchContext.albumTitle,
      trackId: youtubeSearchContext.trackId,
      albumId: youtubeSearchContext.albumId
    });
    await loadAll();
    if (artistDetail) {
      await loadArtistDetail(artistDetail.artist.id);
    }
    setMonitorNotice(`Queued download for ${youtubeSearchContext.trackTitle}.`);
    closeYoutubeSearchModal();
  };

  const remuxTrackMedia = async (trackId: number, trackTitle: string) => {
    await apiPost(`/api/tracks/${trackId}/remux`, {});
    setMonitorNotice(`Queued remux for ${trackTitle}.`);
  };

  const resyncArtist = async () => {
    if (!selectedArtistId || isResyncing) return;
    setIsResyncing(true);
    try {
      await apiPost(`/api/artists/${selectedArtistId}/resync`, {});
      await loadAll();
      await loadArtistDetail(selectedArtistId);
    } finally {
      setIsResyncing(false);
    }
  };

  const toggleAlbumExpanded = (albumId: number) => {
    setExpandedAlbumIds((prev) =>
      prev.includes(albumId) ? prev.filter((id) => id !== albumId) : [...prev, albumId]
    );
  };

  const toggleAlbumSelection = (albumId: number) => {
    setSelectedAlbumIds((prev) =>
      prev.includes(albumId) ? prev.filter((id) => id !== albumId) : [...prev, albumId]
    );
  };

  const toggleSelectAllAlbums = () => {
    if (!artistDetail) return;
    if (selectedAlbumIds.length === artistDetail.albums.length) {
      setSelectedAlbumIds([]);
      return;
    }
    setSelectedAlbumIds(artistDetail.albums.map((album) => album.id));
  };

  const applyAlbumMonitoring = async (monitored: boolean) => {
    if (!selectedArtistId || selectedAlbumIds.length === 0) return;
    await apiPatch(`/api/artists/${selectedArtistId}/albums/monitor`, {
      albumIds: selectedAlbumIds,
      monitored
    });
    await loadArtistDetail(selectedArtistId);
    setMonitorNotice(
      monitored
        ? `Queued downloads for ${selectedAlbumIds.length} album(s).`
        : `Unmonitored ${selectedAlbumIds.length} album(s).`
    );
  };

  const applyBulkPreferences = async () => {
    if (selectedArtistIds.length === 0) return;
    await Promise.all(
      selectedArtistIds.map((artistId) =>
        apiPut(`/api/artists/${artistId}/preferences`, {
          importMode: bulkImportMode,
          quality: bulkQuality,
          autoDownload: bulkAutoDownload
        })
      )
    );
    await loadAll();
    if (selectedArtistId) {
      await loadArtistDetail(selectedArtistId);
    }
  };

  const deleteSelectedArtists = async () => {
    if (selectedArtistIds.length === 0) return;
    openDeleteArtistModal(
      selectedArtistIds,
      `${selectedArtistIds.length} artist(s)`
    );
  };

  const clearLogs = async () => {
    await apiDelete("/api/activity");
    await loadAll();
  };

  const downloadFailedLogs = async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch(`${apiBaseUrl}/api/downloads/failed.csv`, {
        headers: authToken ? { Authorization: authToken } : undefined
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "failed-downloads.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download logs");
    }
  };

  const clearFailedDownloads = async () => {
    await apiDelete("/api/downloads/failed");
    await loadAll();
  };

  const normalizeCookieHeader = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }
    const match = trimmed.match(/^cookie\s*:\s*(.+)$/im);
    if (match?.[1]) {
      return match[1].trim();
    }
    const lines = trimmed.split(/\r?\n/);
    const cookieLine = lines.find((line) => /^cookie\s*:/i.test(line));
    if (cookieLine) {
      return cookieLine.replace(/^cookie\s*:/i, "").trim();
    }
    return trimmed;
  };

  const saveGeneralSettings = async () => {
    const mediaRoot = generalMediaRoot.trim();
    if (!mediaRoot) {
      setGeneralSaveStatus("error");
      setError("Media storage destination is required");
      return;
    }
    setError(null);
    setGeneralSaveStatus("saving");
    if (generalSaveTimeout.current) {
      clearTimeout(generalSaveTimeout.current);
      generalSaveTimeout.current = null;
    }
    try {
      const result = await apiPut<GeneralSettings>("/api/settings/general", {
        mediaRoot,
        domain: generalDomain.trim() || null,
        publicApiBaseUrl: generalPublicApiBaseUrl.trim() || null
      });
      setGeneralMediaRoot(result.mediaRoot ?? "");
      setGeneralDomain(result.domain ?? "");
      setGeneralPublicApiBaseUrl(result.publicApiBaseUrl ?? "");
      setGeneralSaveStatus("saved");
      generalSaveTimeout.current = window.setTimeout(() => setGeneralSaveStatus("idle"), 3000);
    } catch (err) {
      setGeneralSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save general settings");
    }
  };

  const saveAdminSettings = async () => {
    const nextUsername = adminUsername.trim();
    const usernameChanged = nextUsername && nextUsername !== currentAdminUsername;
    const passwordChanged = adminPassword.length > 0;
    if (!usernameChanged && !passwordChanged) {
      return;
    }
    if (usernameChanged && !passwordChanged) {
      setAdminSaveStatus("error");
      setError("Enter a new password to update the admin username");
      return;
    }
    if (passwordChanged && adminPassword.length < 6) {
      setAdminSaveStatus("error");
      setError("Admin password must be at least 6 characters");
      return;
    }
    if (passwordChanged && adminPassword !== adminPasswordConfirm) {
      setAdminSaveStatus("error");
      setError("Admin passwords do not match");
      return;
    }
    setError(null);
    setAdminSaveStatus("saving");
    if (adminSaveTimeout.current) {
      clearTimeout(adminSaveTimeout.current);
      adminSaveTimeout.current = null;
    }
    try {
      const payload: { username?: string; password?: string } = {};
      if (usernameChanged) {
        payload.username = nextUsername;
      }
      if (passwordChanged) {
        payload.password = adminPassword;
      }
      const result = await apiPut<AdminSettings>("/api/settings/admin", payload);
      const finalUsername = result.username ?? nextUsername ?? currentAdminUsername;
      setAdminUsername(finalUsername);
      setCurrentAdminUsername(finalUsername);
      if (payload.password) {
        const token = `Basic ${btoa(`${finalUsername}:${adminPassword}`)}`;
        setAuthToken(token);
      }
      setAdminPassword("");
      setAdminPasswordConfirm("");
      setAdminSaveStatus("saved");
      adminSaveTimeout.current = window.setTimeout(() => setAdminSaveStatus("idle"), 3000);
    } catch (err) {
      setAdminSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save admin settings");
    }
  };

  const saveIntegrationSettings = async () => {
    setError(null);
    setIntegrationsSaveStatus("saving");
    if (integrationsSaveTimeout.current) {
      clearTimeout(integrationsSaveTimeout.current);
      integrationsSaveTimeout.current = null;
    }
    try {
      const result = await apiPut<IntegrationSettings>("/api/settings/integrations", {
        audiodbApiKey: audiodbApiKey.trim() || null,
        lastfmApiKey: lastfmApiKey.trim() || null
      });
      setIntegrationsStatus(result);
      setAudiodbApiKey(result.audiodbApiKey ?? "");
      setLastfmApiKey(result.lastfmApiKey ?? "");
      await loadLastfmTags();
      setIntegrationsSaveStatus("saved");
      integrationsSaveTimeout.current = setTimeout(() => {
        setIntegrationsSaveStatus("idle");
      }, 3000);
    } catch (err) {
      setIntegrationsSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save integration settings");
    }
  };

  const saveStreamToken = async () => {
    setError(null);
    setStreamTokenStatus("saving");
    if (streamTokenSaveTimeout.current) {
      clearTimeout(streamTokenSaveTimeout.current);
      streamTokenSaveTimeout.current = null;
    }
    try {
      const result = await apiPut<StreamSettings>("/api/settings/streams", {
        token: streamToken.trim(),
        enabled: streamEnabled
      });
      setStreamSettings(result);
      setStreamToken(result.token);
      setStreamEnabled(result.enabled);
      setStreamTokenStatus("saved");
      streamTokenSaveTimeout.current = setTimeout(() => {
        setStreamTokenStatus("idle");
      }, 3000);
    } catch (err) {
      setStreamTokenStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save stream token");
    }
  };

  const saveDownloadSettings = async () => {
    setError(null);
    setDownloadSaveStatus("saving");
    if (downloadSaveTimeout.current) {
      clearTimeout(downloadSaveTimeout.current);
      downloadSaveTimeout.current = null;
    }
    try {
      const normalized = Math.min(10, Math.max(1, Math.floor(downloadConcurrency || 0)));
      const result = await apiPut<DownloadSettings>("/api/settings/downloads", {
        concurrency: normalized
      });
      setDownloadSettings(result);
      setDownloadConcurrency(result.concurrency ?? normalized);
      setDownloadSaveStatus("saved");
      downloadSaveTimeout.current = setTimeout(() => {
        setDownloadSaveStatus("idle");
      }, 3000);
    } catch (err) {
      setDownloadSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save download settings");
    }
  };

  const saveSearchSettings = async () => {
    setError(null);
    setSearchSaveStatus("saving");
    if (searchSaveTimeout.current) {
      clearTimeout(searchSaveTimeout.current);
      searchSaveTimeout.current = null;
    }
    try {
      const result = await apiPut<SearchSettings>("/api/settings/search", {
        skipNonOfficialMusicVideos
      });
      setSearchSettings(result);
      setSkipNonOfficialMusicVideos(result.skipNonOfficialMusicVideos);
      setSearchSaveStatus("saved");
      searchSaveTimeout.current = setTimeout(() => {
        setSearchSaveStatus("idle");
      }, 3000);
    } catch (err) {
      setSearchSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save search settings");
    }
  };

  const regenerateStreamToken = async () => {
    setError(null);
    setStreamTokenStatus("saving");
    if (streamTokenSaveTimeout.current) {
      clearTimeout(streamTokenSaveTimeout.current);
      streamTokenSaveTimeout.current = null;
    }
    try {
      const result = await apiPost<StreamSettings>("/api/settings/streams/token", {});
      setStreamSettings(result);
      setStreamToken(result.token);
      setStreamEnabled(result.enabled);
      setStreamTokenStatus("saved");
      streamTokenSaveTimeout.current = setTimeout(() => {
        setStreamTokenStatus("idle");
      }, 3000);
    } catch (err) {
      setStreamTokenStatus("error");
      setError(err instanceof Error ? err.message : "Failed to regenerate stream token");
    }
  };

  const saveYoutubeSettings = async () => {
    const normalizedCookiesHeader = normalizeCookieHeader(youtubeCookiesHeader);
    setError(null);
    setYoutubeSaveStatus("saving");
    if (youtubeSaveTimeout.current) {
      clearTimeout(youtubeSaveTimeout.current);
      youtubeSaveTimeout.current = null;
    }
    try {
      const result = await apiPut<YoutubeSettings>("/api/settings/youtube", {
        cookiesPath: youtubeCookiesPath.trim() || null,
        cookiesFromBrowser: youtubeCookiesBrowser.trim() || null,
        cookiesHeader: normalizedCookiesHeader || null,
        outputFormat: youtubeOutputFormat
      });
      setYoutubeStatus(result);
      setYoutubeCookiesHeader(result.cookiesHeader ?? "");
      setYoutubeSaveStatus("saved");
      youtubeSaveTimeout.current = setTimeout(() => {
        setYoutubeSaveStatus("idle");
      }, 3000);
    } catch (err) {
      setYoutubeSaveStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save YouTube settings");
    }
  };

  const currentPlayback = useMemo(() => {
    return playbackQueue[playbackIndex] ?? null;
  }, [playbackQueue, playbackIndex]);
  const hasActivePlayback = playbackQueue.length > 0;

  useEffect(() => {
    if (!currentPlayback) {
      setCurrentPlaybackInfo(null);
      setCurrentPlaybackInfoStatus("idle");
      return;
    }
    setPlayerPosition((prev) => prev ?? getDefaultPlayerPosition(playerMode));
  }, [currentPlayback, playerMode]);

  useEffect(() => {
    if (!currentPlayback) {
      return;
    }
    let active = true;
    setCurrentPlaybackInfoStatus("loading");
    apiGet<TrackMediaInfo>(`/api/tracks/${currentPlayback.trackId}/media-info`)
      .then((info) => {
        if (!active) return;
        setCurrentPlaybackInfo(info);
        setCurrentPlaybackInfoStatus("idle");
      })
      .catch(() => {
        if (!active) return;
        setCurrentPlaybackInfo(null);
        setCurrentPlaybackInfoStatus("error");
      });
    return () => {
      active = false;
    };
  }, [currentPlayback?.trackId]);

  useEffect(() => {
    if (!playerPosition) {
      return;
    }
    const handleResize = () => {
      setPlayerPosition((prev) => {
        if (!prev) {
          return prev;
        }
        if (playerMode === "compact") {
          return getDefaultPlayerPosition("compact");
        }
        return clampPlayerPosition(prev.x, prev.y);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [playerPosition, playerMode]);

  const buildQueueFromAlbum = (album?: AlbumDetail | null) => {
    if (!album) {
      return [];
    }
    return album.tracks
      .filter((track) => track.downloaded)
      .map((track) => ({
        trackId: track.id,
        title: track.title,
        albumTitle: album.title
      }));
  };

  const playTrack = (track: TrackDetail, album?: AlbumDetail | null) => {
    const queue = buildQueueFromAlbum(album);
    if (queue.length > 0) {
      const index = queue.findIndex((item) => item.trackId === track.id);
      setPlaybackQueue(queue);
      setPlaybackIndex(index >= 0 ? index : 0);
      setShuffleHistory([]);
      return;
    }
    setPlaybackQueue([
      {
        trackId: track.id,
        title: track.title,
        albumTitle: album?.title ?? null
      }
    ]);
    setPlaybackIndex(0);
    setShuffleHistory([]);
  };

  const playAlbum = (album: AlbumDetail) => {
    const queue = buildQueueFromAlbum(album);
    if (queue.length === 0) {
      setError("No downloaded tracks available to play.");
      return;
    }
    setPlaybackQueue(queue);
    setPlaybackIndex(0);
    setShuffleHistory([]);
  };

  const enqueueItems = (items: PlaybackItem[]) => {
    if (items.length === 0) {
      setError("No downloaded tracks available to queue.");
      return;
    }
    setPlaybackQueue((prev) => {
      const existing = new Set(prev.map((item) => item.trackId));
      const toAdd = items.filter((item) => !existing.has(item.trackId));
      if (prev.length === 0) {
        setPlaybackIndex(0);
        setShuffleHistory([]);
        return toAdd;
      }
      return [...prev, ...toAdd];
    });
  };

  const enqueueTrack = (track: TrackDetail, album?: AlbumDetail | null) => {
    if (!track.downloaded) {
      setError("Track has not been downloaded yet.");
      return;
    }
    enqueueItems([
      {
        trackId: track.id,
        title: track.title,
        albumTitle: album?.title ?? null
      }
    ]);
  };

  const enqueueAlbum = (album: AlbumDetail) => {
    const queue = buildQueueFromAlbum(album);
    enqueueItems(queue);
  };

  const buildArtistQueue = async (artistId: number) => {
    const detail = await apiGet<ArtistDetail>(`/api/artists/${artistId}`);
    return detail.albums.flatMap((album) =>
      album.tracks
        .filter((track) => track.downloaded)
        .map((track) => ({
          trackId: track.id,
          title: track.title,
          albumTitle: album.title
        }))
    );
  };

  const playArtistFromDashboard = async (artistId: number) => {
    setError(null);
    try {
      const queue = await buildArtistQueue(artistId);
      if (queue.length === 0) {
        setError("No downloaded tracks available for this artist.");
        return;
      }
      setPlaybackQueue(queue);
      setPlaybackIndex(0);
      setShuffleHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artist for playback");
    }
  };

  const enqueueArtistFromDashboard = async (artistId: number) => {
    setError(null);
    try {
      const queue = await buildArtistQueue(artistId);
      if (queue.length === 0) {
        setError("No downloaded tracks available for this artist.");
        return;
      }
      enqueueItems(queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artist for queue");
    }
  };

  const stopPlayback = () => {
    setPlaybackQueue([]);
    setPlaybackIndex(0);
    setShuffleHistory([]);
  };

  const getPlayerSize = (mode: "full" | "compact") => {
    if (mode === "compact") {
      return { width: PLAYER_COMPACT_WIDTH, height: PLAYER_COMPACT_HEIGHT };
    }
    return { width: PLAYER_DEFAULT_WIDTH, height: PLAYER_DEFAULT_HEIGHT };
  };

  const getDefaultPlayerPosition = (mode: "full" | "compact") => {
    if (typeof window === "undefined") {
      return { x: 16, y: 16 };
    }
    const { width, height } = getPlayerSize(mode);
    if (mode === "compact") {
      const inset = window.innerWidth >= 768 ? 24 : 16;
      return {
        x: inset,
        y: Math.max(inset, window.innerHeight - height - inset)
      };
    }
    return {
      x: Math.max(16, Math.round(window.innerWidth / 2 - width / 2)),
      y: Math.max(16, window.innerHeight - height - 16)
    };
  };

  const resetPlayerSize = (mode: "full" | "compact") => {
    const { width, height } = getPlayerSize(mode);
    if (playerRef.current) {
      playerRef.current.style.width = `${width}px`;
      playerRef.current.style.height = `${height}px`;
    }
  };

  const clampPlayerPosition = (x: number, y: number) => {
    if (typeof window === "undefined") {
      return { x, y };
    }
    const rect = playerRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 640;
    const height = rect?.height ?? 240;
    const maxX = Math.max(16, window.innerWidth - width - 16);
    const maxY = Math.max(16, window.innerHeight - height - 16);
    return {
      x: Math.min(Math.max(16, x), maxX),
      y: Math.min(Math.max(16, y), maxY)
    };
  };

  const playNext = () => {
    if (playbackQueue.length === 0) return;
    if (shuffleEnabled && playbackQueue.length > 1) {
      const nextIndex = Math.floor(Math.random() * playbackQueue.length);
      setShuffleHistory((prev) => [...prev, playbackIndex]);
      setPlaybackIndex(nextIndex);
      return;
    }
    setPlaybackIndex((prev) =>
      prev + 1 >= playbackQueue.length ? 0 : prev + 1
    );
  };

  const playPrev = () => {
    if (playbackQueue.length === 0) return;
    if (shuffleEnabled && shuffleHistory.length > 0) {
      const lastIndex = shuffleHistory[shuffleHistory.length - 1];
      setShuffleHistory((prev) => prev.slice(0, -1));
      setPlaybackIndex(lastIndex);
      return;
    }
    setPlaybackIndex((prev) =>
      prev - 1 < 0 ? playbackQueue.length - 1 : prev - 1
    );
  };

  const toggleShuffle = () => {
    setShuffleEnabled((prev) => !prev);
    setShuffleHistory([]);
  };

  const reorderPlaybackQueue = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }
    setPlaybackQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setPlaybackIndex((prev) => {
      if (prev === fromIndex) {
        return toIndex;
      }
      if (fromIndex < prev && prev <= toIndex) {
        return prev - 1;
      }
      if (toIndex <= prev && prev < fromIndex) {
        return prev + 1;
      }
      return prev;
    });
  };

  const removeFromQueue = (index: number) => {
    setPlaybackQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setPlaybackIndex((prev) => {
      if (index < prev) {
        return prev - 1;
      }
      if (index === prev) {
        return Math.max(0, prev - 1);
      }
      return prev;
    });
  };

  const withAuthQuery = (url: string) => {
    const token = getAuthToken();
    if (!token) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}auth=${encodeURIComponent(token)}`;
  };

  const popOutPlayer = () => {
    if (!currentPlayback) {
      return;
    }
    window.open(
      withAuthQuery(`${apiBaseUrl}/api/tracks/${currentPlayback.trackId}/stream`),
      "_blank",
      "noopener,noreferrer"
    );
  };

  const downloadArtistM3u = () => {
    if (!artistDetail) {
      return;
    }
    window.open(
      withAuthQuery(`${apiBaseUrl}/api/playlists/artist/${artistDetail.artist.id}.m3u`),
      "_blank"
    );
  };

  const downloadAlbumM3u = (albumId: number) => {
    window.open(withAuthQuery(`${apiBaseUrl}/api/playlists/album/${albumId}.m3u`), "_blank");
  };

  const handlePlayerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (playerMode === "compact") {
      return;
    }
    if (!playerRef.current) {
      return;
    }
    const rect = playerRef.current.getBoundingClientRect();
    playerDragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    setIsDraggingPlayer(true);
  };

  const dockPlayer = () => {
    setPlayerMode("compact");
    resetPlayerSize("compact");
    setPlayerPosition(getDefaultPlayerPosition("compact"));
  };

  const expandPlayer = () => {
    setPlayerMode("full");
    resetPlayerSize("full");
    setPlayerPosition(getDefaultPlayerPosition("full"));
  };

  const deleteTrackMedia = async (trackId: number) => {
    if (!artistDetail) {
      return;
    }
    const confirmed = window.confirm("Delete the downloaded file for this track?");
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await apiDelete(`/api/tracks/${trackId}/media`);
      if (currentPlayback?.trackId === trackId) {
        stopPlayback();
      } else {
        const nextQueue = playbackQueue.filter((item) => item.trackId !== trackId);
        setPlaybackQueue(nextQueue);
        if (nextQueue.length === 0) {
          setPlaybackIndex(0);
        } else if (playbackIndex >= nextQueue.length) {
          setPlaybackIndex(nextQueue.length - 1);
        }
      }
      await loadArtistDetail(artistDetail.artist.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete track media");
    }
  };

  const toggleArtistSort = (key: ArtistSortKey) => {
    if (artistSortKey === key) {
      setArtistSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setArtistSortKey(key);
      setArtistSortDirection("asc");
    }
  };

  const externalSearchResults = useMemo(
    () => searchResults.filter((result) => result.source !== "local"),
    [searchResults]
  );
  const artistByName = useMemo(() => {
    const map = new Map<string, Artist>();
    artists.forEach((artist) => map.set(artist.name.toLowerCase(), artist));
    return map;
  }, [artists]);
  const hasSearchResults = localSearchMatches.length > 0 || externalSearchResults.length > 0;
  const searchSourcesLabel = useMemo(() => "AudioDB", []);
  const searchPlaceholder = useMemo(
    () => `Search artists in ${searchSourcesLabel}...`,
    [searchSourcesLabel]
  );
  const showSetup = setupStatus === "incomplete";
  const rawShowLoading =
    setupStatus === "loading" || (setupStatus === "complete" && authStatus === "unknown");
  const showLoading =
    rawShowLoading || (loadingHoldUntil !== null && Date.now() < loadingHoldUntil);
  const showLogin = setupStatus === "complete" && authStatus === "unauthenticated";
  const loadingJoke = loadingJokes[loadingJokeIndex % loadingJokes.length] ?? "Loading...";

  useEffect(() => {
    if (!showLoading) {
      return;
    }
    setLoadingJokeIndex(Math.floor(Math.random() * loadingJokes.length));
  }, [showLoading]);

  useEffect(() => {
    if (rawShowLoading) {
      if (loadingHoldUntil === null) {
        setLoadingHoldUntil(Date.now() + LOADING_MIN_MS);
      }
      return;
    }
    if (loadingHoldUntil === null) {
      return;
    }
    const remaining = loadingHoldUntil - Date.now();
    if (remaining <= 0) {
      setLoadingHoldUntil(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setLoadingHoldUntil(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [rawShowLoading, loadingHoldUntil]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {storageBrowserVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">Select a folder</div>
                <div className="text-xs text-slate-500">
                  {storageBrowserPath ?? "Loading..."}
                </div>
              </div>
              <button
                onClick={() => setStorageBrowserVisible(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => storageBrowserParent && loadStorageBrowser(storageBrowserParent)}
                disabled={!storageBrowserParent}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Up one level
              </button>
              <button
                onClick={applyStorageSelection}
                disabled={!storageBrowserPath}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use this folder
              </button>
            </div>
            {storageBrowserError && (
              <div className="mt-3 text-xs text-rose-600">{storageBrowserError}</div>
            )}
            <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-100">
              {storageBrowserLoading && (
                <div className="px-4 py-3 text-sm text-slate-500">Loading folders...</div>
              )}
              {!storageBrowserLoading &&
                storageBrowserEntries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => loadStorageBrowser(entry.path)}
                    className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
                  >
                    <span className="text-slate-400">📁</span>
                    {entry.name}
                  </button>
                ))}
              {!storageBrowserLoading && storageBrowserEntries.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-500">No folders found.</div>
              )}
            </div>
          </div>
        </div>
      )}
      {showLoading && (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-white px-6 py-6 text-center shadow-sm">
            <img
              src="/mudarr_cropped.png"
              alt="Mudarr"
              className="w-full max-w-xs h-auto object-contain"
            />
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              <span>Loading Mudarr...</span>
            </div>
            <div className="text-xs text-slate-500">{loadingJoke}</div>
          </div>
        </div>
      )}
      {setupStatus === "error" && (
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold text-slate-800">Setup error</div>
            <p className="mt-2 text-sm text-slate-600">
              {setupError ?? "Unable to load initial setup status."}
            </p>
            <button
              onClick={loadSetupStatus}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {showSetup && (
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <div className="text-lg font-semibold text-slate-900">Initial setup</div>
              <p className="mt-1 text-sm text-slate-500">
                Configure storage, access, and streaming before using Mudarr.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Media storage destination
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={setupMediaRoot}
                    onChange={(event) => setSetupMediaRoot(event.currentTarget.value)}
                    placeholder="/data/music"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => openStorageBrowser("setup")}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Browse
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Downloads will be organized by artist and album in this folder.
                </p>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  App domain (frontend)
                </div>
                <input
                  value={setupDomain}
                  onChange={(event) => setSetupDomain(event.currentTarget.value)}
                  placeholder="https://mudarr.example.com"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Optional. Use your frontend URL if you have one.
                </p>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Public API base URL
                </div>
                <input
                  value={setupPublicApiBaseUrl}
                  onChange={(event) => setSetupPublicApiBaseUrl(event.currentTarget.value)}
                  placeholder="https://api.mudarr.example.com"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Optional. Used for shareable stream URLs.
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Admin username
                </div>
                <input
                  value={setupAdminUsername}
                  onChange={(event) => setSetupAdminUsername(event.currentTarget.value)}
                  placeholder="admin"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Admin password
                </div>
                <input
                  type="password"
                  value={setupAdminPassword}
                  onChange={(event) => setSetupAdminPassword(event.currentTarget.value)}
                  placeholder="••••••••"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Confirm password
                </div>
                <input
                  type="password"
                  value={setupAdminPasswordConfirm}
                  onChange={(event) => setSetupAdminPasswordConfirm(event.currentTarget.value)}
                  placeholder="••••••••"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Streaming
                </div>
                <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={setupStreamEnabled}
                    onChange={(event) => setSetupStreamEnabled(event.currentTarget.checked)}
                    className="h-4 w-4"
                  />
                  Enable streaming features
                </label>
              </div>
            </div>
            {setupError && <div className="text-sm text-rose-600">{setupError}</div>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={completeSetup}
                disabled={setupSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {setupSaving ? "Saving..." : "Complete setup"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showLogin && (
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold text-slate-900">Sign in</div>
            <p className="mt-1 text-sm text-slate-500">
              Enter the admin credentials.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Username
                </div>
                <input
                  value={loginUsername}
                  onChange={(event) => setLoginUsername(event.currentTarget.value)}
                  placeholder="admin"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Password
                </div>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.currentTarget.value)}
                  placeholder="••••••••"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {authError && <div className="mt-3 text-sm text-rose-600">{authError}</div>}
            <button
              onClick={submitLogin}
              className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Sign in
            </button>
          </div>
        </div>
      )}
      {!showLoading &&
        !showSetup &&
        !showLogin &&
        setupStatus === "complete" &&
        authStatus === "authenticated" && (
        <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="bg-slate-900 text-slate-100 md:w-64 w-full p-6 flex flex-col md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto">
          <div className="flex justify-center -mx-6">
            <img
              src="/mudarr_cropped.png"
              alt="Mudarr"
              className="w-full max-w-[220px] h-auto object-contain"
            />
          </div>
          <nav className="mt-6 space-y-1 flex-1">
            {visibleTabs.map((tab) => {
              if (tab === "Streams") {
                return (
                  <div key={tab} className="space-y-1">
                    <button
                      onClick={() => changeTab(tab)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        activeTab === tab && !isStreamCreateRoute
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {tabIcon(tab)}
                        <span>Streams</span>
                      </span>
                    </button>
                    {activeTab === "Streams" && (
                      <button
                        onClick={() => navigate(streamCreateRoute)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                          isStreamCreateRoute
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                        }`}
                      >
                        Create stream
                      </button>
                    )}
                  </div>
                );
              }

              if (tab === "Settings") {
                return (
                  <div key={tab} className="space-y-1">
                    <button
                      onClick={() => changeSettingsTab(activeSettingsTab)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        activeTab === tab
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {tabIcon(tab)}
                        <span>Settings</span>
                      </span>
                    </button>
                    {activeTab === "Settings" &&
                      settingsTabs.map((settingsTab) => (
                        <button
                          key={settingsTab.id}
                          onClick={() => changeSettingsTab(settingsTab.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                            activeSettingsTab === settingsTab.id
                              ? "bg-slate-800 text-white"
                              : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                          }`}
                        >
                          {settingsTab.label}
                        </button>
                      ))}
                  </div>
                );
              }

              return (
                <button
                  key={tab}
                  onClick={() => changeTab(tab)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    activeTab === tab
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {tabIcon(tab)}
                    <span className="flex-1">{tabLabel(tab)}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Artist Import Progress */}
          {artistImportJobs.length > 0 && (
            <div className="mt-auto border-t border-slate-700 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Importing Artists
              </div>
              <div className="space-y-2">
                {artistImportJobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-slate-800 rounded-lg p-3 text-xs"
                  >
                    <div className="font-medium text-white mb-1">
                      {job.artist_name}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      {job.status === "pending" && "Queued..."}
                      {job.status === "processing" && (job.progress_stage || "Processing...")}
                      {job.status === "failed" && `Failed: ${job.error_message}`}
                    </div>
                    {job.status === "processing" && (
                      <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full animate-pulse w-full" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center">
              <div className="relative z-40 w-full md:max-w-lg">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.currentTarget.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                {showSearchPanel && (
                  <div className="absolute right-0 top-12 z-50 w-full rounded-lg border border-slate-200 bg-white shadow-xl">
                    {searchLoading && (
                      <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
                    )}
                    {localSearchMatches.length > 0 && (
                      <div className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        In your library
                      </div>
                    )}
                    {localSearchMatches.map((artist) => (
                      <div
                        key={artist.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                      >
                        {artist.image_url ? (
                          <img
                            src={artist.image_url}
                            alt={artist.name}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-slate-200" />
                        )}
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-900">{artist.name}</div>
                          <div className="text-xs text-slate-500">
                            {artist.genres.length > 0
                              ? artist.genres.map((genre) => genre.name).join(", ")
                              : "No genres"}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSearchTerm("");
                            setSearchResults([]);
                            void openArtistPage(artist.id);
                          }}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </button>
                      </div>
                    ))}
                    {(searchLoading || externalSearchResults.length > 0) && (
                      <div className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {searchSourcesLabel}
                      </div>
                    )}
                    {!searchLoading &&
                      externalSearchResults.map((result) => {
                        const existingArtist = artistByName.get(result.name.toLowerCase());
                        return (
                        <div
                          key={result.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                        >
                          {result.thumb ? (
                            <img
                              src={result.thumb}
                              alt={result.name}
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-slate-200" />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-slate-900">{result.name}</div>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                {result.source === "lastfm"
                                  ? "Last.fm"
                                  : result.source === "local"
                                  ? "Local"
                                  : "AudioDB"}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {[result.genre, result.style].filter(Boolean).join(" • ")}
                            </div>
                          </div>
                          {existingArtist ? (
                            <button
                              onClick={() => {
                                setSearchTerm("");
                                setSearchResults([]);
                                void openArtistPage(existingArtist.id);
                              }}
                              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              View
                            </button>
                          ) : (
                            <button
                              onClick={() => openImportModal(result)}
                              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {!searchLoading && !hasSearchResults && (
                      <div className="px-4 py-3 text-sm text-slate-500">
                        No matches yet. Try the full artist name, e.g. &quot;Linkin Park&quot;.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="px-6 py-6">
      {error && (
              <div className="mb-4 rounded-lg bg-rose-100 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {activeTab === "Dashboard" && (
              <section className="space-y-6">
                <div className={`grid gap-4 ${streamsEnabled ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="text-xs text-slate-500">Disk used</div>
                    <div className="text-2xl font-semibold text-slate-900">
                      {dashboardStats ? formatBytes(dashboardStats.mediaBytes) : "—"}
                    </div>
                    {dashboardStats && (
                      <>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width:
                                dashboardStats.diskTotalBytes && dashboardStats.diskTotalBytes > 0
                                  ? `${Math.min(
                                      100,
                                      Math.round(
                                        (dashboardStats.mediaBytes /
                                          dashboardStats.diskTotalBytes) *
                                          100
                                      )
                                    )}%`
                                  : "0%"
                            }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          {dashboardStats.diskTotalBytes
                            ? `${formatBytes(
                                dashboardStats.diskTotalBytes - (dashboardStats.diskFreeBytes ?? 0)
                              )} used of ${formatBytes(dashboardStats.diskTotalBytes)}`
                            : "Disk total unavailable"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {dashboardStats.mediaFiles} files
                          {dashboardStats.missingFiles > 0
                            ? ` · ${dashboardStats.missingFiles} missing`
                            : ""}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="text-xs text-slate-500">Artists saved</div>
                    <div className="text-2xl font-semibold text-slate-900">
                      {dashboardStats?.artists ?? artists.length}
                    </div>
                  </div>
                  {streamsEnabled && (
                    <div className="relative overflow-hidden rounded-xl bg-white p-4 shadow-sm">
                      <div className="pointer-events-none absolute inset-0 opacity-70">
                        <Sparkline
                          values={activeConnectionsSeries}
                          strokeClassName="stroke-emerald-500"
                          gradientFrom="#34d399"
                          gradientTo="#d1fae5"
                        />
                      </div>
                      <div className="relative z-10">
                        <div className="text-xs text-slate-500">Active connections</div>
                        <div className="text-2xl font-semibold text-slate-900">
                          {typeof latestStreamingSample?.activeConnections === "number"
                            ? latestStreamingSample.activeConnections
                            : dashboardStats
                            ? dashboardStats.activeConnections
                            : "—"}
                        </div>
                      </div>
                    </div>
                  )}
                  {streamsEnabled && (
                    <div className="relative overflow-hidden rounded-xl bg-white p-4 shadow-sm">
                      <div className="pointer-events-none absolute inset-0 opacity-70">
                        <Sparkline
                          values={bandwidthSeries}
                          strokeClassName="stroke-sky-500"
                          gradientFrom="#38bdf8"
                          gradientTo="#e0f2fe"
                        />
                      </div>
                      <div className="relative z-10">
                        <div className="text-xs text-slate-500">Bandwidth</div>
                        <div className="text-2xl font-semibold text-slate-900">
                          {typeof latestStreamingSample?.bandwidthBps === "number"
                            ? formatBandwidth(latestStreamingSample.bandwidthBps)
                            : dashboardStats
                            ? formatBandwidth(dashboardStats.bandwidthBps)
                            : "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Artists</h2>
                      <p className="text-xs text-slate-500">
                        Manage monitoring and quality preferences across your library.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <button
                        onClick={() => toggleArtistSort("name")}
                        className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                      >
                        Sort by name {artistSortKey === "name" ? `(${artistSortDirection})` : ""}
                      </button>
                      <button
                        onClick={() => toggleArtistSort("created_at")}
                        className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                      >
                        Sort by added {artistSortKey === "created_at" ? `(${artistSortDirection})` : ""}
                      </button>
                      <button
                        onClick={() => setDashboardView("posters")}
                        className={`rounded-md border px-2 py-1 ${
                          dashboardView === "posters"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        Posters
                      </button>
                      <button
                        onClick={toggleDashboardSelectMode}
                        className={`rounded-md border px-2 py-1 ${
                          dashboardSelectMode
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        Select
                      </button>
                      <button
                        onClick={() => setDashboardView("list")}
                        className={`rounded-md border px-2 py-1 ${
                          dashboardView === "list"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        List
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {selectedArtistIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        <span className="font-semibold">
                          {selectedArtistIds.length} selected
                        </span>
                        <button
                          onClick={clearArtistSelection}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
                        >
                          Clear
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={bulkImportMode}
                            onChange={(event) =>
                              setBulkImportMode(
                                event.currentTarget.value as ArtistPreference["import_mode"]
                              )
                            }
                            className="rounded-md border border-slate-200 bg-white px-2 py-1"
                          >
                            <option value="discography">Monitor all</option>
                            <option value="new">Monitor none</option>
                            <option value="custom">Custom</option>
                          </select>
                          <select
                            value={bulkQuality}
                            onChange={(event) =>
                              setBulkQuality(
                                event.currentTarget.value as ArtistPreference["quality"]
                              )
                            }
                            className="rounded-md border border-slate-200 bg-white px-2 py-1"
                          >
                            <option value="144p">144p</option>
                            <option value="240p">240p</option>
                            <option value="360p">360p</option>
                            <option value="480p">480p</option>
                            <option value="720p">720p</option>
                            <option value="1080p">1080p</option>
                            <option value="1440p">1440p</option>
                            <option value="2160p">4K</option>
                            <option value="4320p">8K</option>
                          </select>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={bulkAutoDownload}
                              onChange={(event) =>
                                setBulkAutoDownload(event.currentTarget.checked)
                              }
                            />
                            Auto-download
                          </label>
                          <button
                            onClick={applyBulkPreferences}
                            className="rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Apply
                          </button>
                          <button
                            onClick={deleteSelectedArtists}
                            className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-slate-100 p-4">
                      {dashboardSelectMode && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={
                              dashboardArtists.length > 0 &&
                              selectedArtistIds.length === dashboardArtists.length
                            }
                            onChange={toggleSelectAllArtists}
                          />
                          Select all
                        </label>
                      </div>
                      )}

                      {dashboardArtists.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-500">
                          No artists yet. Use search to add some.
                        </div>
                      ) : dashboardView === "posters" ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                          {dashboardArtists.map((artist) => {
                            const progress = buildDownloadProgress(
                              artist.downloaded_count ?? 0,
                              artist.monitored_count ?? 0
                            );
                            return (
                            <div
                              key={artist.id}
                              className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
                            >
                              <div className="relative aspect-[4/5] bg-slate-100">
                                  {artist.image_url ? (
                                    <img
                                      src={artist.image_url}
                                      alt={artist.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                      No artwork
                                    </div>
                                  )}
                                {dashboardSelectMode && selectedArtistIds.includes(artist.id) && (
                                  <div className="absolute right-2 top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                                    <CheckIcon />
                              </div>
                                )}
                                <button
                                  onClick={() =>
                                    dashboardSelectMode
                                      ? toggleArtistSelection(artist.id)
                                      : openArtistPage(artist.id)
                                  }
                                  className="absolute inset-0 z-10"
                                  aria-label={`Open ${artist.name}`}
                                />
                                <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 bg-gradient-to-t from-slate-900/70 via-slate-900/40 to-transparent px-2 pb-2 pt-6 opacity-0 transition group-hover:opacity-100">
                              {artist.has_downloads && (
                                <button
                                  onClick={() => playArtistFromDashboard(artist.id)}
                                      title="Play"
                                      className="rounded-full bg-white/90 p-1.5 text-slate-700 shadow-sm transition hover:bg-white"
                                >
                                      <PlayIcon />
                                </button>
                              )}
                              {hasActivePlayback && artist.has_downloads && (
                                <button
                                  onClick={() => enqueueArtistFromDashboard(artist.id)}
                                      title="Queue"
                                      className="rounded-full bg-white/90 p-1.5 text-slate-700 shadow-sm transition hover:bg-white"
                                >
                                      <ListIcon />
                                </button>
                              )}
                              <button
                                onClick={() => openArtistPage(artist.id)}
                                    title="Edit"
                                    className="rounded-full bg-white/90 p-1.5 text-slate-700 shadow-sm transition hover:bg-white"
                              >
                                    <EditIcon />
                              </button>
                              <button
                                onClick={() => openArtistPage(artist.id)}
                                    title="Search"
                                    className="rounded-full bg-white/90 p-1.5 text-slate-700 shadow-sm transition hover:bg-white"
                              >
                                    <SearchIcon />
                              </button>
                              <button
                                    onClick={() => deleteArtist(artist.id, artist.name)}
                                    title="Delete"
                                    className="rounded-full bg-white/90 p-1.5 text-rose-600 shadow-sm transition hover:bg-white"
                              >
                                    <TrashIcon />
                              </button>
                            </div>
                          </div>
                              <div className="relative h-4 w-full bg-slate-100">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${progress.percent}%` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                                  {progress.downloaded}/{progress.monitored}
                            </div>
                              </div>
                          <div className="px-3 py-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {artist.name}
                            </div>
                          </div>
                            </div>
                          );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="text-xs uppercase text-slate-500">
                              <tr>
                                {dashboardSelectMode && <th className="py-2">Select</th>}
                                <th className="py-2">Artist</th>
                                <th className="py-2">Added</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dashboardArtists.map((artist) => {
                                const progress = buildDownloadProgress(
                                  artist.downloaded_count ?? 0,
                                  artist.monitored_count ?? 0
                                );
                                return (
                                <tr key={artist.id} className="border-t border-slate-100">
                                  {dashboardSelectMode && (
                                  <td className="py-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedArtistIds.includes(artist.id)}
                                      onChange={() => toggleArtistSelection(artist.id)}
                                    />
                                  </td>
                                  )}
                                  <td className="py-2 font-medium text-slate-900">
                                    <div className="flex items-center gap-3">
                                      <div className="flex flex-col items-center gap-0 w-16">
                                      {artist.image_url ? (
                                        <img
                                          src={artist.image_url}
                                          alt={artist.name}
                                            className="h-10 w-10 rounded-full object-cover"
                                        />
                                      ) : (
                                          <div className="h-10 w-10 rounded-full bg-slate-200" />
                                        )}
                                        <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100">
                                          <div
                                            className="h-full bg-emerald-500"
                                            style={{ width: `${progress.percent}%` }}
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-slate-700">
                                            {progress.downloaded}/{progress.monitored}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <button
                                          onClick={() => openArtistPage(artist.id)}
                                          className="text-left hover:text-indigo-600"
                                        >
                                          {artist.name}
                                        </button>
                                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                          {artist.has_downloads && (
                                            <button
                                              onClick={() => playArtistFromDashboard(artist.id)}
                                              className="rounded-md border border-indigo-200 px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-50"
                                            >
                                              Play
                                            </button>
                                          )}
                                          {hasActivePlayback && artist.has_downloads && (
                                            <button
                                              onClick={() => enqueueArtistFromDashboard(artist.id)}
                                              className="rounded-md border border-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                                            >
                                              Queue
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 text-slate-500">
                                    {new Date(artist.created_at).toLocaleDateString()}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
        </section>
      )}

      {activeTab === "Artists" && (
              <section className="space-y-4">
                {isArtistDetailRoute ? (
                  artistDetail ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-100 bg-white p-4">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <label className="flex items-center gap-2">
            <input
                              type="checkbox"
                              checked={
                                artistDetail.albums.length > 0 &&
                                selectedAlbumIds.length === artistDetail.albums.length
                              }
                              onChange={toggleSelectAllAlbums}
                            />
                            Select all albums
                          </label>
                          <button
                            onClick={() => setSelectedAlbumIds([])}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
                          >
                            Clear
                          </button>
                          <button
                            onClick={() => applyAlbumMonitoring(true)}
                            disabled={selectedAlbumIds.length === 0}
                            className="rounded-md border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Monitor selected
                          </button>
                          <button
                            onClick={() => applyAlbumMonitoring(false)}
                            disabled={selectedAlbumIds.length === 0}
                            className="rounded-md border border-rose-200 px-2 py-1 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Unmonitor selected
                          </button>
                          <span className="text-xs text-slate-400">
                            {selectedAlbumIds.length} selected
                          </span>
                        </div>
                      </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        onClick={() => {
                          changeTab("Artists");
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        ← Back to artists
                      </button>
                      <div className="text-xs text-slate-500">
                        {artistDetail.albums.length} albums
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                      {monitorNotice && (
                        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                          {monitorNotice}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center gap-0 w-32">
                            <div className="group relative h-16 w-16 overflow-hidden rounded-full">
                          {artistDetail.artist.image_url ? (
                            <img
                              src={artistDetail.artist.image_url}
                              alt={artistDetail.artist.name}
                                  className="h-full w-full object-cover"
                            />
                          ) : (
                                <div className="h-full w-full bg-slate-200" />
                              )}
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45 opacity-0 transition group-hover:opacity-100">
                                <div className="grid grid-cols-2 gap-1">
                                  <button
                                    onClick={() => playArtistFromDashboard(artistDetail.artist.id)}
                                    disabled={!artistHasDownloads}
                                    title="Play"
                                    className="rounded-md bg-white/90 p-1 text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <PlayIcon />
                                  </button>
                                  <button
                                    onClick={scrollToArtistSettings}
                                    title="Edit"
                                    className="rounded-md bg-white/90 p-1 text-slate-700 shadow-sm transition hover:bg-white"
                                  >
                                    <EditIcon />
                                  </button>
                                  <button
                                    onClick={scrollToArtistTracks}
                                    title="Search"
                                    className="rounded-md bg-white/90 p-1 text-slate-700 shadow-sm transition hover:bg-white"
                                  >
                                    <SearchIcon />
                                  </button>
                                  <button
                                    onClick={() =>
                                      deleteArtist(artistDetail.artist.id, artistDetail.artist.name)
                                    }
                                    title="Delete"
                                    className="rounded-md bg-white/90 p-1 text-rose-600 shadow-sm transition hover:bg-white"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${artistDownloadProgress.percent}%` }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                                {artistDownloadProgress.downloaded}/
                                {artistDownloadProgress.monitored}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-2xl font-semibold text-slate-900">
                              {artistDetail.artist.name}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {artistDetail.albums.length} albums ·{" "}
                              {artistDetail.albums.reduce(
                                (total, album) => total + album.tracks.length,
                                0
                              )}{" "}
                              tracks
                            </div>
                          </div>
                        </div>
                      <div className="flex flex-wrap gap-2">
                        {artistHasDownloads && (
                          <button
                            onClick={downloadArtistM3u}
                            className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            Export M3U
                          </button>
                        )}
                        <button
                          onClick={resyncArtist}
                          disabled={isResyncing}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isResyncing ? "Resyncing..." : "Resync albums"}
                        </button>
                        <button
                          onClick={() =>
                            deleteArtist(artistDetail.artist.id, artistDetail.artist.name)
                          }
                          className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Remove artist
                        </button>
                      </div>
                      </div>

                      <div ref={artistSettingsRef} className="mt-6 grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Import mode
                          </div>
                          <select
                            value={importMode}
                            onChange={(event) =>
                              setImportMode(
                                event.currentTarget.value as ArtistPreference["import_mode"]
                              )
                            }
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="discography">Discography</option>
                            <option value="new">New albums only</option>
                            <option value="custom">Custom</option>
            </select>
          </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Quality
                          </div>
                          <select
                            value={importQuality}
                            onChange={(event) =>
                              setImportQuality(
                                event.currentTarget.value as ArtistPreference["quality"]
                              )
                            }
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="144p">144p</option>
                            <option value="240p">240p</option>
                            <option value="360p">360p</option>
                            <option value="480p">480p</option>
                            <option value="720p">720p</option>
                            <option value="1080p">1080p</option>
                            <option value="1440p">1440p</option>
                            <option value="2160p">4K (2160p)</option>
                            <option value="4320p">8K (4320p)</option>
                          </select>
                        </div>
                        <div className="flex flex-col justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Auto download
                          </div>
                          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={importAutoDownload}
                              onChange={(event) =>
                                setImportAutoDownload(event.currentTarget.checked)
                              }
                            />
                            Enabled
                          </label>
                        </div>
                      </div>

                      <div className="mt-3">
                        <button
                          onClick={saveArtistPreferences}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Save preferences
                        </button>
                      </div>

                    {importMode === "custom" && (
                      <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                        Custom mode enabled. Use the bookmark toggles on albums and tracks to
                        monitor what you want downloaded.
                      </div>
                    )}
                    </div>

                    <div ref={artistTracksRef} className="space-y-4">
                      {artistDetail.albums.length === 0 && (
                        <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                          No albums found.
                        </div>
                      )}
                      {artistDetail.albums.map((album) => {
                        const downloadingTracks = album.tracks.filter(
                          (track) => track.download_status === "downloading"
                        );
                        const queuedTracks = album.tracks.filter(
                          (track) => track.download_status === "queued"
                        );
                        const totalProgress = downloadingTracks.reduce(
                          (total, track) => total + (track.progress_percent ?? 0),
                          0
                        );
                        const averageProgress =
                          downloadingTracks.length > 0
                            ? Math.floor(totalProgress / downloadingTracks.length)
                            : null;
                        const albumHasDownload = album.tracks.some((track) => track.downloaded);

                        return (
                          <div key={album.id} className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {album.title}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {album.year ?? "Unknown year"} · {album.tracks.length} tracks
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {albumHasDownload && (
                                  <button
                                    onClick={() => playAlbum(album)}
                                    className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                  >
                                    Play
                                  </button>
                                )}
                                {albumHasDownload && (
                                  <button
                                    onClick={() => enqueueAlbum(album)}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                  >
                                    Queue
                                  </button>
                                )}
                                {albumHasDownload && (
                                  <button
                                    onClick={() => downloadAlbumM3u(album.id)}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                  >
                                    M3U
                                  </button>
                                )}
                                <label className="flex items-center gap-2 text-xs text-slate-500">
                                  <input
                                    type="checkbox"
                                    checked={selectedAlbumIds.includes(album.id)}
                                    onChange={() => toggleAlbumSelection(album.id)}
                                  />
                                  Select
                                </label>
                                <button
                                  onClick={() => toggleAlbumExpanded(album.id)}
                                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  {expandedAlbumIds.includes(album.id) ? "Collapse" : "Expand"}
                                </button>
                                <button
                                  onClick={() => updateAlbumMonitored(album.id, !album.monitored)}
                                  title={album.monitored ? "Monitored" : "Unmonitored"}
                                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                    album.monitored
                                      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                  }`}
                                >
                                  <span className="sr-only">
                                    {album.monitored ? "Monitored" : "Unmonitored"}
                                  </span>
                                  <BookmarkIcon active={album.monitored} />
                                </button>
                              </div>
                            </div>
                            {(downloadingTracks.length > 0 || queuedTracks.length > 0) && (
                              <div className="mt-3">
                                <div className="text-xs text-slate-500">
                                  {downloadingTracks.length > 0
                                    ? `Downloading ${downloadingTracks.length} track(s)`
                                    : `Queued ${queuedTracks.length} track(s)`}
                                </div>
                                <div className="mt-1 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full bg-indigo-500 ${
                                      averageProgress === null ? "animate-pulse w-1/3" : ""
                                    }`}
                                    style={
                                      averageProgress === null
                                        ? undefined
                                        : { width: `${Math.max(averageProgress, 1)}%` }
                                    }
                                  />
                                </div>
                                {averageProgress !== null && (
                                  <div className="text-xs text-slate-500">
                                    {averageProgress}% complete
                                  </div>
                                )}
                              </div>
                            )}
                            {expandedAlbumIds.includes(album.id) && (
                              <div className="mt-4 space-y-2 text-sm">
                                {album.tracks.map((track) => {
                                  const isDownloaded = track.downloaded;
                                  const isDownloading = track.download_status === "downloading";
                                  const isQueued = track.download_status === "queued";
                                  const isFailed = track.download_status === "failed";
                                  const skipMessage = track.download_error?.trim() ?? "";
                                  const isSkipped =
                                    track.monitored &&
                                    isFailed &&
                                    skipMessage.toLowerCase().startsWith("skipped");
                                  return (
                                    <div
                                      key={track.id}
                                      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2 transition hover:bg-slate-50"
                                    >
                                      <div className="text-slate-700">
                                        {track.track_no ? `${track.track_no}. ` : ""}
                                        {track.title}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {isSkipped && (
                                          <span
                                            title={skipMessage || "Skipped"}
                                            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700"
                                          >
                                            Skipped
                                          </span>
                                        )}
                                        {isDownloaded && (
                                          <>
                                            <button
                                            onClick={() => playTrack(track, album)}
                                              className="rounded-md border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                            >
                                              Play
                                            </button>
                                            <button
                                              onClick={() => enqueueTrack(track, album)}
                                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                            >
                                              Queue
                                            </button>
                                            <button
                                              onClick={() => remuxTrackMedia(track.id, track.title)}
                                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                            >
                                              Remux
                                            </button>
                                            <button
                                              onClick={() => deleteTrackMedia(track.id)}
                                              className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                            >
                  Delete
                </button>
                                          </>
                                        )}
                                        {track.monitored && !isDownloaded && !isDownloading && !isQueued && (
                                          <button
                                            onClick={() =>
                                              queueTrackDownload(
                                                track.id,
                                                track.title,
                                                album.title,
                                                album.id
                                              )
                                            }
                                            className="rounded-md border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                          >
                                            {isSkipped ? "Force download" : "Download"}
                                          </button>
                                        )}
                                        {!isDownloaded && !isDownloading && !isQueued && (
                                          <button
                                            onClick={() => openYoutubeSearchModal(track, album)}
                                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                          >
                                            Search
                                          </button>
                                        )}
                                        {(isQueued || isDownloading) && (
                                          <span className="text-xs text-slate-500">
                                            {isQueued ? "Queued" : "Downloading"}
                                          </span>
                                        )}
                                        <button
                                          onClick={() =>
                                            updateTrackMonitored(track.id, !track.monitored)
                                          }
                                          title={track.monitored ? "Monitored" : "Unmonitored"}
                                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                            track.monitored
                                              ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                              : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                          }`}
                                        >
                                          <span className="sr-only">
                                            {track.monitored ? "Monitored" : "Unmonitored"}
                                          </span>
                                          <BookmarkIcon active={track.monitored} />
                                        </button>
                                      </div>
                                      {isDownloading && (
                                        <div className="w-full">
                                          <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                                            <div
                                              className={`h-full rounded-full bg-indigo-500 ${
                                                track.progress_percent === null ||
                                                track.progress_percent === undefined
                                                  ? "animate-pulse w-1/3"
                                                  : ""
                                              }`}
                                              style={
                                                track.progress_percent === null ||
                                                track.progress_percent === undefined
                                                  ? undefined
                                                  : { width: `${Math.max(track.progress_percent, 1)}%` }
                                              }
                                            />
                                          </div>
                                          {track.progress_percent !== null &&
                                            track.progress_percent !== undefined && (
                                              <div className="text-xs text-slate-500">
                                                {track.progress_percent}% complete
                                              </div>
                                            )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {album.tracks.length === 0 && (
                                  <div className="text-xs text-slate-500">No tracks found.</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">
                      Loading artist…
                    </div>
                  )
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">Artists</h2>
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      {filteredArtists.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-500">
                          No artists yet.
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                          {filteredArtists.map((artist) => (
                            <div
                              key={artist.id}
                              className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
                            >
                              <button
                                onClick={() => openArtistPage(artist.id)}
                                className="aspect-[4/5] bg-slate-100"
                              >
                                {artist.image_url ? (
                                  <img
                                    src={artist.image_url}
                                    alt={artist.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                    No artwork
                                  </div>
                                )}
                              </button>
                              <div className="px-3 py-3">
                                <div className="text-sm font-semibold text-slate-900">
                                  {artist.name}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {artist.genres.length > 0
                                    ? artist.genres.map((g) => g.name).join(", ")
                                    : "No genres"}
                                </div>
                                <div className="mt-3 flex gap-2">
                                  {artist.has_downloads && (
                                    <button
                                      className="rounded-md border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                      onClick={() => playArtistFromDashboard(artist.id)}
                                    >
                                      Play
                                    </button>
                                  )}
                                  {hasActivePlayback && artist.has_downloads && (
                                    <button
                                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                      onClick={() => enqueueArtistFromDashboard(artist.id)}
                                    >
                                      Queue
                                    </button>
                                  )}
                                  <button
                                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    onClick={() => deleteArtist(artist.id, artist.name)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
        </section>
      )}

      {activeTab === "Downloads" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Downloads</h2>
            <button
              onClick={clearActiveDownloads}
              disabled={activeDownloadCounts.total === 0}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear active
            </button>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <ul className="space-y-2 text-sm">
              {downloadsPageItems.map((job) => {
                const sanitizedDetail =
                  job.progress_detail && !/^(NA|N\/A)$/i.test(job.progress_detail)
                    ? job.progress_detail
                    : null;
                const stageLabel =
                  job.progress_stage === "processing"
                    ? sanitizedDetail ?? "Converting"
                    : job.progress_stage === "finalizing"
                    ? "Finalizing"
                    : job.progress_stage === "download"
                    ? "Downloading"
                    : job.status;
                const hasPercent =
                  typeof job.progress_percent === "number" &&
                  Number.isFinite(job.progress_percent);
                const displayPercent = hasPercent ? job.progress_percent : null;
                const displayTitle = job.display_title?.trim() || job.query;
                return (
                  <li
                    key={job.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-100 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{displayTitle}</div>
                      <div className="text-xs text-slate-500">
                        Status: {job.status}
                        {job.quality ? ` · ${job.quality}` : ""}
                        {job.status === "downloading" ? ` · ${stageLabel}` : ""}
                      </div>
                      {job.status === "downloading" && (
                        <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full bg-indigo-500 ${
                              !hasPercent ? "animate-pulse w-1/3" : ""
                            }`}
                            style={
                              !hasPercent
                                ? undefined
                                : { width: `${Math.max(displayPercent ?? 0, 1)}%` }
                            }
                          />
                        </div>
                      )}
                      {job.status === "downloading" && hasPercent && (
                        <div className="text-xs text-slate-500">
                          {displayPercent}% complete
                        </div>
                      )}
                      {job.status === "downloading" && !hasPercent && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {job.progress_stage === "processing" && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                          )}
                          <span>{stageLabel}…</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => cancelDownload(job.id, displayTitle)}
                        className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Remove
                      </button>
                      {job.error && <div className="text-xs text-rose-600">{job.error}</div>}
                    </div>
                  </li>
                );
              })}
              {downloadsPageItems.length === 0 && (
                <li className="text-sm text-slate-500">
                  No downloads are queued or in progress.
                </li>
              )}
            </ul>
            {downloadsForDisplay.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <div>
                  Showing {downloadsPageItems.length} of {downloadsForDisplay.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDownloadsPage((prev) => Math.max(1, prev - 1))}
                    disabled={downloadsPage <= 1}
                    className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <span>
                    Page {downloadsPage} of {downloadsPageCount}
                  </span>
                  <button
                    onClick={() =>
                      setDownloadsPage((prev) => Math.min(downloadsPageCount, prev + 1))
                    }
                    disabled={downloadsPage >= downloadsPageCount}
                    className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "Lists" && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">List sources</h2>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <select
                    value={newListType}
                    onChange={(event) => setNewListType(event.currentTarget.value)}
                    className="w-full md:w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
              <option value="spotify">Spotify</option>
              <option value="lastfm">Last.fm</option>
            </select>
            <input
              value={newListId}
                    onChange={(event) => setNewListId(event.currentTarget.value)}
              placeholder="List ID"
                    className="w-full md:w-52 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={newListName}
                    onChange={(event) => setNewListName(event.currentTarget.value)}
              placeholder="List name"
                    className="w-full md:w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
                  <button
                    onClick={addList}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Add
                  </button>
          </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <ul className="space-y-2 text-sm">
                    {filteredLists.map((list) => (
                      <li
                        key={list.id}
                        className="flex flex-col gap-1 rounded-lg border border-slate-100 p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="font-semibold text-slate-900">{list.name}</div>
                        <div className="text-xs text-slate-500">
                          {list.type} · {list.external_id}
                        </div>
              </li>
            ))}
                    {filteredLists.length === 0 && (
                      <li className="text-sm text-slate-500">No lists yet.</li>
                    )}
          </ul>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">Genre imports</div>
                    {genreImportNotice && (
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                        {genreImportNotice}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Pull the top artists for a genre and import them into Mudarr.
                  </p>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                    <select
                      value={genreImportSource}
                      onChange={(event) =>
                        setGenreImportSource(event.currentTarget.value as "lastfm")
                      }
                      className="w-full md:w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="lastfm">Last.fm</option>
                    </select>
                    <select
                      value={genreImportName}
                      onChange={(event) => selectGenreImportTag(event.currentTarget.value)}
                      disabled={lastfmTagsStatus === "loading" || lastfmTagOptions.length === 0}
                      className="w-full md:w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">
                        {lastfmTagsStatus === "loading"
                          ? "Loading genres..."
                          : "Select a Last.fm genre"}
                      </option>
                      {lastfmTagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                    <select
                      value={genreImportLimit}
                      onChange={(event) => setGenreImportLimit(Number(event.currentTarget.value))}
                      className="w-full md:w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value={20}>Top 20</option>
                      <option value={50}>Top 50</option>
                      <option value={100}>Top 100</option>
                      <option value={200}>Top 200</option>
                    </select>
                    <button
                      onClick={importGenreArtists}
                      disabled={!genreImportName.trim() || isGenreImporting || isGenreImportRunning}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isGenreImporting || isGenreImportRunning ? "Importing..." : "Run import"}
                    </button>
                    <button
                      onClick={saveGenreImportSettings}
                      disabled={!genreImportName.trim() || isGenreImporting}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save settings
                    </button>
                    <button
                      onClick={resetGenreImportForm}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Import mode
                      </div>
                      <select
                        value={genreImportMode}
                        onChange={(event) =>
                          setGenreImportMode(
                            event.currentTarget.value as ArtistPreference["import_mode"]
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="discography">Discography</option>
                        <option value="new">New albums only</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Quality
                      </div>
                      <select
                        value={genreImportQuality}
                        onChange={(event) =>
                          setGenreImportQuality(
                            event.currentTarget.value as ArtistPreference["quality"]
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="144p">144p</option>
                        <option value="240p">240p</option>
                        <option value="360p">360p</option>
                        <option value="480p">480p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="1440p">1440p</option>
                        <option value="2160p">4K (2160p)</option>
                        <option value="4320p">8K (4320p)</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={genreImportAutoDownload}
                          onChange={(event) =>
                            setGenreImportAutoDownload(event.currentTarget.checked)
                          }
                        />
                        Auto download
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={genreImportEnabled}
                          onChange={(event) => setGenreImportEnabled(event.currentTarget.checked)}
                        />
                        Enabled
                      </label>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {lastfmTagsStatus === "error" && lastfmTagsError
                      ? `Unable to load Last.fm genres: ${lastfmTagsError}`
                      : "Requires a Last.fm API key (Settings or `LASTFM_API_KEY`)."}
                  </div>
                  {genreImportJob && (
                    <div className="mt-4 rounded-lg border border-slate-100 bg-white p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-slate-900">
                          Importing {genreImportJob.genre_name}
                        </div>
                        <div className="text-xs text-slate-500">{genreImportJob.status}</div>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${genreImportProgress}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {genreImportJob.processed}/{genreImportJob.total} processed · Imported{" "}
                        {genreImportJob.imported} · Skipped {genreImportJob.skipped} · Errors{" "}
                        {genreImportJob.errors}
                      </div>
                      {genreImportJob.updated_at && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          Last update: {new Date(genreImportJob.updated_at).toLocaleTimeString()}
                        </div>
                      )}
                      {genreImportJob.error_samples && genreImportJob.error_samples.length > 0 && (
                        <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
                          <div className="font-semibold text-rose-800">Recent errors</div>
                          <ul className="mt-2 space-y-1">
                            {genreImportJob.error_samples.map((error) => (
                              <li key={`${error.name}-${error.message}`}>
                                <span className="font-semibold">{error.name}:</span>{" "}
                                {error.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Configured genres
                    </div>
                    <ul className="mt-3 space-y-2">
                      {configuredGenreImports.map((genre) => (
                        <li
                          key={genre.id}
                          className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white p-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{genre.name}</div>
                            <div className="text-xs text-slate-500">
                              Source: {genre.import_source ?? "lastfm"} · Limit:{" "}
                              {genre.import_limit ?? "-"} · Mode:{" "}
                              {genre.import_mode ?? "new"} · Quality:{" "}
                              {genre.import_quality ?? "1080p"} · Auto download:{" "}
                              {genre.import_auto_download ? "on" : "off"} ·{" "}
                              {genre.import_enabled ? "Enabled" : "Disabled"}
                            </div>
                            {genre.imported_at && (
                              <div className="text-xs text-slate-400">
                                Last import: {new Date(genre.imported_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => editGenreImport(genre)}
                              className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                runGenreImport({
                                  name: genre.name,
                                  source: (genre.import_source as "lastfm") ?? "lastfm",
                                  limit: genre.import_limit ?? 50,
                                  importMode: genre.import_mode ?? "new",
                                  quality: genre.import_quality ?? "1080p",
                                  autoDownload: genre.import_auto_download ?? false,
                                  enabled: genre.import_enabled ?? true
                                })
                              }
                              disabled={isGenreImportRunning}
                              className="rounded-md border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isGenreImportRunning ? "Running..." : "Run"}
                            </button>
                            <button
                              onClick={() => deleteGenreImportSettings(genre.id, genre.name)}
                              className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Remove import
                            </button>
                          </div>
                        </li>
                      ))}
                      {configuredGenreImports.length === 0 && (
                        <li className="text-sm text-slate-500">No genre imports yet.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </section>
            )}

      {streamsEnabled && activeTab === "Streams" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Streams</h2>
            <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
              <input
                value={streamSearchQuery}
                onChange={(event) => setStreamSearchQuery(event.currentTarget.value)}
                placeholder="Search streams"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={streamOnlineFilter}
                onChange={(event) =>
                  setStreamOnlineFilter(event.currentTarget.value as "all" | "online" | "offline")
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-auto"
              >
                <option value="all">All statuses</option>
                <option value="online">Online only</option>
                <option value="offline">Offline only</option>
              </select>
              <select
                value={streamSort}
                onChange={(event) =>
                  setStreamSort(
                    event.currentTarget.value as
                      | "name-asc"
                      | "name-desc"
                      | "uptime-desc"
                      | "uptime-asc"
                  )
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-auto"
              >
                <option value="name-asc">Sort: name (A → Z)</option>
                <option value="name-desc">Sort: name (Z → A)</option>
                <option value="uptime-desc">Sort: uptime (high → low)</option>
                <option value="uptime-asc">Sort: uptime (low → high)</option>
              </select>
              <button
                onClick={downloadStreamsM3u}
                disabled={streams.length === 0}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Download M3U
              </button>
              <button
                onClick={loadStreams}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:w-auto"
              >
                Refresh
              </button>
            </div>
          </div>
          {isStreamCreateRoute && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700">Create stream</h3>
              <p className="mt-1 text-xs text-slate-500">
                Build a concatenated stream by selecting downloaded tracks.
              </p>
              <div className="mt-3 space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <input
                    value={streamName}
                    onChange={(event) => setStreamName(event.currentTarget.value)}
                    placeholder="Stream name"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={streamIcon}
                    onChange={(event) => setStreamIcon(event.currentTarget.value)}
                    placeholder="Icon (emoji or URL)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={streamEncoding}
                    onChange={(event) =>
                      setStreamEncoding(event.currentTarget.value as StreamEncoding)
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="original">Encoding: original (direct)</option>
                    <option value="copy">Encoding: copy (remux, lighter weight)</option>
                    <option value="transcode">Encoding: transcode (re-encode)</option>
                    <option value="web">Encoding: web-friendly</option>
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={streamShuffle}
                      onChange={(event) => setStreamShuffle(event.currentTarget.checked)}
                      className="h-4 w-4"
                    />
                    Shuffle on play
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => setStreamSource("manual")}
                    className={`rounded-md border px-3 py-1 font-semibold ${
                      streamSource === "manual"
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Manual tracks
                  </button>
                  <button
                    onClick={() => setStreamSource("artists")}
                    className={`rounded-md border px-3 py-1 font-semibold ${
                      streamSource === "artists"
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Artists
                  </button>
                  <button
                    onClick={() => setStreamSource("genres")}
                    className={`rounded-md border px-3 py-1 font-semibold ${
                      streamSource === "genres"
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Genres
                  </button>
                </div>

                {streamSource === "manual" && (
                  <>
                    <div className="space-y-2">
                      <input
                        value={streamTrackQuery}
                        onChange={(event) => setStreamTrackQuery(event.currentTarget.value)}
                        placeholder="Search downloaded tracks (artist, album, track)"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      {streamTrackLoading && (
                        <div className="text-xs text-slate-500">Searching...</div>
                      )}
                      {streamTrackResults.length > 0 && (
                        <ul className="max-h-56 overflow-auto rounded-lg border border-slate-100 text-sm">
                          {streamTrackResults.map((track) => (
                            <li
                              key={track.id}
                              className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <div className="font-semibold text-slate-900">{track.title}</div>
                                <div className="text-xs text-slate-500">
                                  {track.artist_name ?? "Unknown Artist"}
                                  {track.album_title ? ` · ${track.album_title}` : ""}
                                </div>
                              </div>
                              <button
                                onClick={() => addStreamTrack(track)}
                                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Add
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {streamTrackQuery.trim() &&
                        !streamTrackLoading &&
                        streamTrackResults.length === 0 && (
                          <div className="text-xs text-slate-500">No matches found.</div>
                        )}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Selected tracks ({selectedStreamTracks.length})
                      </div>
                      {selectedStreamTracks.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-500">
                          No tracks selected yet.
                        </div>
                      ) : (
                        <ul className="mt-2 space-y-2 text-sm">
                        {selectedStreamTracks.map((track, index) => (
                            <li
                            key={`${track.id}-${index}`}
                              className="flex flex-col gap-2 rounded-lg border border-slate-100 px-3 py-2 md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <div className="font-semibold text-slate-800">{track.title}</div>
                                <div className="text-xs text-slate-500">
                                  {track.artist_name ?? "Unknown Artist"}
                                  {track.album_title ? ` · ${track.album_title}` : ""}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => moveStreamTrack(index, -1)}
                                  disabled={index === 0}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveStreamTrack(index, 1)}
                                  disabled={index === selectedStreamTracks.length - 1}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => removeStreamTrack(track.id)}
                                  className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {streamSource === "artists" && (
                  <div className="space-y-2">
                    <input
                      value={streamArtistQuery}
                      onChange={(event) => setStreamArtistQuery(event.currentTarget.value)}
                      placeholder="Filter artists"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="max-h-60 overflow-auto rounded-lg border border-slate-100 text-sm">
                      {filteredStreamArtists.map((artist) => (
                        <label
                          key={artist.id}
                          className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={streamArtistIds.includes(artist.id)}
                            onChange={() => toggleStreamArtist(artist.id)}
                            className="h-4 w-4"
                          />
                          <span className="font-semibold text-slate-800">{artist.name}</span>
                        </label>
                      ))}
                      {filteredStreamArtists.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-500">No artists found.</div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Selected artists: {streamArtistIds.length}
                    </div>
                  </div>
                )}

                {streamSource === "genres" && (
                  <div className="space-y-2">
                    <input
                      value={streamGenreQuery}
                      onChange={(event) => setStreamGenreQuery(event.currentTarget.value)}
                      placeholder="Filter genres"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="max-h-60 overflow-auto rounded-lg border border-slate-100 text-sm">
                      {filteredStreamGenres.map((genre) => (
                        <label
                          key={genre.id}
                          className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={streamGenreIds.includes(genre.id)}
                            onChange={() => toggleStreamGenre(genre.id)}
                            className="h-4 w-4"
                          />
                          <span className="font-semibold text-slate-800">{genre.name}</span>
                        </label>
                      ))}
                      {filteredStreamGenres.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-500">No genres found.</div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Selected genres: {streamGenreIds.length}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={createStream}
                    disabled={isCreatingStream}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingStream ? "Creating..." : "Create stream"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {!isStreamCreateRoute && (
            <div className="w-full rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Existing streams</h3>
              {streamsLoading && <span className="text-xs text-slate-500">Loading...</span>}
            </div>
            <ul className="mt-4 w-full space-y-3 text-sm">
              {visibleStreams.map((stream) => {
                const isExpanded = expandedStreamIds.includes(stream.id);
                const liveUrl = streamLiveUrl(stream.id);
                const shareUrl = shareableStreamUrl(stream.id);
                const isEditing = editingStreamId === stream.id;
                const resolutionSummary = getResolutionSummary(stream.items);
                const isRestarting = restartingStreamIds.includes(stream.id);
                const isRescanning = rescanningStreamIds.includes(stream.id);
                const isMenuOpen = streamMenuId === stream.id;
                const iconValue = stream.icon?.trim();
                const isIconUrl = iconValue ? /^https?:\/\//i.test(iconValue) : false;
                return (
                  <li
                    key={stream.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm"
                  >
                    <div className="grid gap-3 md:grid-cols-12 md:items-start md:gap-4">
                      <div className="flex items-start gap-3 md:col-span-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          {iconValue ? (
                            isIconUrl ? (
                              <img
                                src={iconValue}
                                alt=""
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-base">{iconValue}</span>
                            )
                          ) : (
                            <StreamIcon />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 md:col-span-3">
                        <div className="text-sm font-semibold text-slate-900">{stream.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          {stream.missingCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                              {stream.missingCount} missing
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <FormatIcon />
                            {stream.encoding}
                          </span>
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <TracksIcon />
                            {stream.itemCount} tracks
                          </span>
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <ClockIcon />
                            {formatDuration(stream.totalDuration)}
                          </span>
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <DownloadIcon />
                            {formatBytes(stream.totalBytes)}
                          </span>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Uptime
                        </div>
                        {stream.status === "active" && stream.onlineSeconds !== null ? (
                          <div className="mt-1 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Online {formatDuration(stream.onlineSeconds)}
                          </div>
                        ) : (
                          <div className="mt-1 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                            Offline
                          </div>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Connections
                        </div>
                        {stream.connections > 0 ? (
                          <button
                            type="button"
                            onClick={() => setConnectionsModalStreamId(stream.id)}
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-200"
                          >
                            <ConnectionsIcon />
                            {stream.connections}
                          </button>
                        ) : (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            <ConnectionsIcon />
                            {stream.connections}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-1.5 text-[10px] text-slate-600 md:col-span-2 md:items-start">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Controls
                        </div>
                        <div className="relative" ref={isMenuOpen ? streamMenuRef : null}>
                          <button
                            onClick={() => toggleStreamMenu(stream.id)}
                            title="Stream controls"
                            aria-label="Stream controls"
                            aria-expanded={isMenuOpen}
                            className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold transition ${
                              isMenuOpen
                                ? "border-slate-200 bg-slate-900 text-white hover:bg-slate-800"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <MenuIcon />
                          </button>
                          {isMenuOpen && (
                            <div className="absolute right-0 z-10 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  openStreamPlayer(stream.id);
                                }}
                                disabled={!liveUrl || stream.status !== "active"}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <PlayIcon />
                                Play stream
                              </button>
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  runStreamAction(
                                    stream.id,
                                    stream.status === "active" ? "stop" : "start"
                                  );
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {stream.status === "active" ? <StopIcon /> : <PlayIcon />}
                                {stream.status === "active" ? "Stop stream" : "Start stream"}
                              </button>
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  runStreamAction(stream.id, "reboot");
                                }}
                                disabled={isRestarting}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span className={isRestarting ? "animate-spin" : ""}>
                                  <RefreshIcon />
                                </span>
                                Restart stream
                              </button>
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  void rescanStream(stream.id);
                                }}
                                disabled={isRescanning}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <SearchIcon />
                                {isRescanning ? "Rescanning..." : "Rescan tracks"}
                              </button>
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  isEditing ? cancelEditStream() : beginEditStream(stream);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {isEditing ? <CloseIcon /> : <EditIcon />}
                                {isEditing ? "Cancel edit" : "Edit stream"}
                              </button>
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  toggleStreamExpanded(stream.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <TracksIcon />
                                {isExpanded ? "Hide tracks" : "Show tracks"}
                              </button>
                              <button
                                onClick={() => {
                                  setStreamMenuId(null);
                                  deleteStream(stream.id, stream.name);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              >
                                <TrashIcon />
                                Delete stream
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 text-[10px] text-slate-600 md:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Stream info
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <ResolutionIcon />
                            {resolutionSummary}
                          </span>
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <VideoIcon />
                            {stream.videoCodecs.length > 0
                              ? stream.videoCodecs.join(", ")
                              : "Video unknown"}
                          </span>
                          <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                            <AudioIcon />
                            {stream.audioCodecs.length > 0
                              ? stream.audioCodecs.join(", ")
                              : "Audio unknown"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {shareUrl ? (
                      <div className="mt-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Stream URL (HLS)
                        </div>
                        <input
                          value={shareUrl}
                          readOnly
                          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="mt-1.5 text-xs text-slate-500">
                        Load the stream token in Settings to generate shareable URLs.
                      </div>
                    )}
                    {isExpanded && (
                      <>
                        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Connections
                          </div>
                          {stream.clients.length === 0 ? (
                            <div className="mt-2 text-xs text-slate-500">
                              No active clients.
                            </div>
                          ) : (
                            <ul className="mt-2 space-y-2 text-[10px] text-slate-600">
                              {stream.clients.map((client) => {
                                const lastSeenMs = Date.parse(client.lastSeen);
                                const seenSeconds = Number.isFinite(lastSeenMs)
                                  ? Math.max(1, Math.floor((Date.now() - lastSeenMs) / 1000))
                                  : null;
                                return (
                                  <li
                                    key={`${client.ip}-${client.userAgent ?? "unknown"}`}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-slate-700">
                                        {client.ip}
                                      </span>
                                      {client.activeConnections > 0 && (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                                          active
                                        </span>
                                      )}
                                      {seenSeconds !== null && (
                                        <span className="text-slate-500">
                                          seen {formatDuration(seenSeconds)} ago
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 text-slate-500">
                                      {client.userAgent ?? "Unknown user agent"}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <ul className="mt-3 space-y-2 text-xs">
                          {stream.items.map((item) => (
                            <li
                              key={item.id}
                              className="rounded-lg border border-slate-100 bg-white px-3 py-2"
                            >
                              <div className="font-semibold text-slate-800">
                                {item.artist_name ?? "Unknown Artist"} - {item.title}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                {item.album_title && (
                                  <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                    {item.album_title}
                                  </span>
                                )}
                                {item.available ? (
                                  <>
                                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                      {item.bytes ? formatBytes(item.bytes) : "Size unknown"}
                                    </span>
                                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                      {formatDuration(item.duration)}
                                    </span>
                                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                      {formatResolution(item.video_width, item.video_height)}
                                    </span>
                                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                      {formatBitrate(item.bit_rate)}
                                    </span>
                                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                      {item.video_codec ?? "Video unknown"}
                                    </span>
                                    <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                      {item.audio_codec ?? "Audio unknown"}
                                    </span>
                                  </>
                                ) : (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                                    Missing file
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                          {stream.items.length === 0 && (
                            <li className="text-xs text-slate-500">No tracks added yet.</li>
                          )}
                        </ul>
                      </>
                    )}
                  </li>
                );
              })}
              {visibleStreams.length === 0 && !streamsLoading && (
                <li className="col-span-full text-sm text-slate-500">
                  {streams.length === 0
                    ? "No streams yet."
                    : "No streams match your filters."}
                </li>
              )}
            </ul>
          </div>
          )}
          {editingStreamId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
              onClick={cancelEditStream}
            >
              <div
                className="flex w-full max-w-5xl max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Edit stream</div>
                    <div className="text-xs text-slate-500">
                      {streams.find((stream) => stream.id === editingStreamId)?.name ??
                        "Stream details"}
                    </div>
                  </div>
                  <button
                    onClick={cancelEditStream}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                    <input
                      value={editingStreamName}
                      onChange={(event) => setEditingStreamName(event.currentTarget.value)}
                      placeholder="Stream name"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={editingStreamIcon}
                      onChange={(event) => setEditingStreamIcon(event.currentTarget.value)}
                      placeholder="Icon (emoji or URL)"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <select
                      value={editingStreamEncoding}
                      onChange={(event) =>
                        setEditingStreamEncoding(event.currentTarget.value as StreamEncoding)
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="original">Encoding: original (direct)</option>
                      <option value="copy">Encoding: copy (remux)</option>
                      <option value="transcode">Encoding: transcode</option>
                      <option value="web">Encoding: web-friendly</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={editingStreamShuffle}
                        onChange={(event) => setEditingStreamShuffle(event.currentTarget.checked)}
                        className="h-4 w-4"
                      />
                      Shuffle on play
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={editingStreamRestartOnSave}
                        onChange={(event) => setEditingStreamRestartOnSave(event.currentTarget.checked)}
                        className="h-4 w-4"
                      />
                      Restart on save
                    </label>
                    <select
                      value={editingStreamStatus}
                      onChange={(event) =>
                        setEditingStreamStatus(event.currentTarget.value as StreamStatus)
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="active">Status: active</option>
                      <option value="stopped">Status: stopped</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setEditingStreamTab("artists")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        editingStreamTab === "artists"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Artists
                    </button>
                    <button
                      onClick={() => setEditingStreamTab("tracks")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        editingStreamTab === "tracks"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Tracks
                    </button>
                  </div>
                  {editingStreamTab === "artists" && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Add artists
                      </div>
                      <input
                        value={editingStreamArtistQuery}
                        onChange={(event) => setEditingStreamArtistQuery(event.currentTarget.value)}
                        placeholder="Filter artists"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <div className="max-h-60 overflow-auto rounded-lg border border-slate-100 text-sm">
                        {filteredEditingStreamArtists.map((artist) => {
                          const isSelected = editingStreamArtistIds.includes(artist.id);
                          const isLoading = editingStreamArtistLoadingIds.includes(artist.id);
                          return (
                            <label
                              key={artist.id}
                              className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isLoading}
                                  onChange={() => void toggleEditingStreamArtist(artist)}
                                  className="h-4 w-4"
                                />
                                <span className="font-semibold text-slate-800">{artist.name}</span>
                              </span>
                              {isLoading && (
                                <span className="text-[10px] text-slate-400">Loading tracks...</span>
                              )}
                            </label>
                          );
                        })}
                        {filteredEditingStreamArtists.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-500">No artists found.</div>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Selected artists: {editingStreamArtistIds.length} · Adds downloaded tracks
                      </div>
                    </div>
                  )}
                  {editingStreamTab === "tracks" && (
                    <>
                      <div className="space-y-2">
                        <input
                          value={editingStreamTrackQuery}
                          onChange={(event) => setEditingStreamTrackQuery(event.currentTarget.value)}
                          placeholder="Search downloaded tracks (artist, album, track)"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        {editingStreamTrackLoading && (
                          <div className="text-xs text-slate-500">Searching...</div>
                        )}
                        {editingStreamTrackResults.length > 0 && (
                          <ul className="max-h-56 overflow-auto rounded-lg border border-slate-100 text-sm">
                            {editingStreamTrackResults.map((track) => (
                              <li
                                key={track.id}
                                className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 md:flex-row md:items-center md:justify-between"
                              >
                                <div>
                                  <div className="font-semibold text-slate-900">{track.title}</div>
                                  <div className="text-xs text-slate-500">
                                    {track.artist_name ?? "Unknown Artist"}
                                    {track.album_title ? ` · ${track.album_title}` : ""}
                                  </div>
                                </div>
                                <button
                                  onClick={() => addEditingStreamTrack(track)}
                                  className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Add
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {editingStreamTrackQuery.trim() &&
                          !editingStreamTrackLoading &&
                          editingStreamTrackResults.length === 0 && (
                            <div className="text-xs text-slate-500">No matches found.</div>
                          )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Selected tracks ({editingStreamTracks.length})
                          </div>
                          <button
                            onClick={shuffleEditingStreamTracks}
                            className="flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
                          >
                            <ShuffleIcon />
                            Shuffle
                          </button>
                        </div>
                        {editingStreamTracks.length === 0 ? (
                          <div className="mt-2 text-sm text-slate-500">No tracks selected yet.</div>
                        ) : (
                          <ul className="mt-2 space-y-2 text-sm">
                            {editingStreamTracks.map((track, index) => {
                              const isSelected = editingStreamSelectedIds.includes(track.id);
                              return (
                                <li
                                  key={`${track.id}-${index}`}
                                  onClick={(event) =>
                                    handleEditingStreamTrackSelect(event, index, track.id)
                                  }
                                  aria-selected={isSelected}
                                  className={`flex flex-col gap-2 rounded-lg border px-3 py-2 md:flex-row md:items-center md:justify-between ${
                                    isSelected
                                      ? "border-indigo-200 bg-indigo-50/40"
                                      : "border-slate-100"
                                  }`}
                                >
                                  <div>
                                    <div className="font-semibold text-slate-800">{track.title}</div>
                                    <div className="text-xs text-slate-500">
                                      {track.artist_name ?? "Unknown Artist"}
                                      {track.album_title ? ` · ${track.album_title}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => moveEditingStreamTrack(index, -1, track.id)}
                                      disabled={!isSelected && index === 0}
                                      title="Move up"
                                      aria-label="Move up"
                                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      onClick={() => moveEditingStreamTrack(index, 1, track.id)}
                                      disabled={
                                        !isSelected && index === editingStreamTracks.length - 1
                                      }
                                      title="Move down"
                                      aria-label="Move down"
                                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      onClick={() =>
                                        moveEditingStreamTracksToEdge(index, "top", track.id)
                                      }
                                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      <span aria-hidden="true">↑</span>
                                      <span>Send to top</span>
                                    </button>
                                    <button
                                      onClick={() =>
                                        moveEditingStreamTracksToEdge(index, "bottom", track.id)
                                      }
                                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      <span aria-hidden="true">↓</span>
                                      <span>Send to bottom</span>
                                    </button>
                                    <button
                                      onClick={() => removeEditingStreamTrack(track.id)}
                                      className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
                  <p className="text-xs text-slate-500">
                    Changes apply immediately to the stream playlist.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={rescanEditingStream}
                      disabled={
                        editingStreamArtistIds.length === 0 ||
                        (editingStreamId !== null &&
                          rescanningStreamIds.includes(editingStreamId))
                      }
                      className="flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <SearchIcon />
                      {editingStreamId !== null && rescanningStreamIds.includes(editingStreamId)
                        ? "Rescanning..."
                        : "Rescan artists"}
                    </button>
                    <button
                      onClick={cancelEditStream}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveStreamEdits}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {connectionsModalStream && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
              onClick={() => setConnectionsModalStreamId(null)}
            >
              <div
                className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Stream clients</div>
                    <div className="text-xs text-slate-500">
                      {connectionsModalStream.name} · {connectionsModalStream.connections} active
                    </div>
                  </div>
                  <button
                    onClick={() => setConnectionsModalStreamId(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label="Close connections"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                  {connectionsModalStream.clients.length === 0 ? (
                    <div className="text-sm text-slate-500">No active clients.</div>
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {connectionsModalStream.clients.map((client) => {
                        const connectedMs = Date.parse(client.connectedSince);
                        const connectedSeconds = Number.isFinite(connectedMs)
                          ? Math.max(1, Math.floor((Date.now() - connectedMs) / 1000))
                          : null;
                        return (
                          <li
                            key={`${client.ip}-${client.userAgent ?? "unknown"}`}
                            className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-800">{client.ip}</span>
                              {client.activeConnections > 0 && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                  active
                                </span>
                              )}
                              {connectedSeconds !== null && (
                                <span className="text-xs text-slate-500">
                                  online for {formatElapsed(connectedSeconds)}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {client.userAgent ?? "Unknown user agent"}
                            </div>
                            {client.lastPath && (
                              <div className="mt-1 text-xs text-slate-400">
                                {client.lastPath}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
          {playingStreamId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
              onClick={closeStreamPlayer}
            >
              <div
                className="flex w-full max-w-4xl max-h-[80vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Stream player</div>
                    <div className="text-xs text-slate-500">
                      {streams.find((stream) => stream.id === playingStreamId)?.name ??
                        "Live stream"}
                    </div>
                  </div>
                  <button
                    onClick={closeStreamPlayer}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="flex-1 bg-slate-950">
                  {(() => {
                    const stream = streams.find((item) => item.id === playingStreamId);
                    const url = stream ? streamLiveUrl(stream.id) : "";
                    if (!stream) {
                      return (
                        <div className="flex h-full items-center justify-center text-sm text-slate-400">
                          Stream not found.
                        </div>
                      );
                    }
                    if (stream.status !== "active") {
                      return (
                        <div className="flex h-full items-center justify-center text-sm text-slate-400">
                          Stream is stopped. Start it to play.
                        </div>
                      );
                    }
                    const hlsUrl = url;
                    if (!hlsUrl) {
                      return (
                        <div className="flex h-full items-center justify-center text-sm text-slate-400">
                          Stream token required to play.
                        </div>
                      );
                    }
                    return (
                      <>
                        {streamPlayerNotice && (
                          <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-xs text-slate-300">
                            <span>{streamPlayerNotice}</span>
                          </div>
                        )}
                        <video
                          ref={streamPlayerRef}
                          key={`${stream.id}-hls`}
                          src={undefined}
                          controls
                          autoPlay
                          onError={() => {
                            setStreamPlayerNotice("HLS playback error. Please try refreshing.");
                          }}
                          className="h-full w-full"
                        />
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
                  <span>Live stream playback</span>
                  <button
                    onClick={closeStreamPlayer}
                    className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

            {activeTab === "Logs" && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Logs</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={downloadFailedLogs}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Download failed logs
                    </button>
                    <button
                      onClick={clearLogs}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Clear logs
                    </button>
                    <button
                      onClick={loadAll}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Artist imports</h3>
                <button
                  onClick={loadArtistImportJobs}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {artistImportJobs.map((job) => (
                  <li key={job.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-800">{job.artist_name}</div>
                        <div className="text-xs text-slate-500">
                          {job.status === "processing"
                            ? job.progress_stage || "Processing"
                            : job.status === "pending"
                            ? "Queued"
                            : job.status}
                        </div>
                      </div>
                      <button
                        onClick={() => cancelArtistImport(job.id, job.artist_name)}
                        disabled={job.status !== "pending" && job.status !== "processing"}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
                {artistImportJobs.length === 0 && (
                  <li className="text-sm text-slate-500">No active imports.</li>
                )}
              </ul>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <ul className="space-y-2 text-sm text-slate-700">
                    {filteredActivity.map((event) => (
                      <li key={event.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="font-semibold text-slate-800">{event.message}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(event.created_at).toLocaleString()}
                        </div>
                      </li>
                    ))}
                    {filteredActivity.length === 0 && (
                      <li className="text-sm text-slate-500">No activity yet.</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Failed downloads</h3>
                    <button
                      onClick={clearFailedDownloads}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Clear failed
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {downloads
                      .filter((job) => job.status === "failed")
                      .map((job) => (
                        <li key={job.id} className="rounded-lg border border-slate-100 p-3">
                          <div className="font-semibold text-slate-800">
                            {job.display_title?.trim() || job.query}
                          </div>
                          <div className="text-xs text-rose-600">{job.error ?? "Unknown error"}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(job.created_at).toLocaleString()}
                          </div>
                        </li>
                      ))}
                    {downloads.filter((job) => job.status === "failed").length === 0 && (
                      <li className="text-sm text-slate-500">No failed downloads.</li>
                    )}
                  </ul>
                </div>
        </section>
      )}

      {activeTab === "Settings" && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Settings</h2>
                {showSettingsNotice && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-600">
                          Configure API keys here or in `.env`. Settings values override env on
                          this server.
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          API base: {import.meta.env.VITE_API_URL ?? "http://localhost:3001"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSettingsNotice(false)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-white p-2 shadow-sm">
                  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Settings tabs">
                    {settingsTabs.map((settingsTab) => (
                      <button
                        key={settingsTab.id}
                        role="tab"
                        aria-selected={activeSettingsTab === settingsTab.id}
                        onClick={() => changeSettingsTab(settingsTab.id)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          activeSettingsTab === settingsTab.id
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {settingsTab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {activeSettingsTab === "general" && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-700">General</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Storage and domain settings for this server.
                      </p>
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Media storage destination
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              value={generalMediaRoot}
                              onChange={(event) => setGeneralMediaRoot(event.currentTarget.value)}
                              placeholder="/data/music"
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                            <button
                              onClick={() => openStorageBrowser("settings")}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Browse
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Downloads land here. Restart the worker to apply changes.
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            App domain (frontend)
                          </div>
                          <input
                            value={generalDomain}
                            onChange={(event) => setGeneralDomain(event.currentTarget.value)}
                            placeholder="https://mudarr.example.com"
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                          <p className="mt-2 text-xs text-slate-500">
                            Optional. Used for links in the UI or docs you share.
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Public API base URL
                          </div>
                          <input
                            value={generalPublicApiBaseUrl}
                            onChange={(event) =>
                              setGeneralPublicApiBaseUrl(event.currentTarget.value)
                            }
                            placeholder="https://api.mudarr.example.com"
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                          <p className="mt-2 text-xs text-slate-500">
                            Optional. Used for shareable stream URLs. Leave blank in dev.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          onClick={saveGeneralSettings}
                          disabled={generalSaveStatus === "saving"}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          {generalSaveStatus === "saving" ? "Saving..." : "Save general"}
                        </button>
                        {generalSaveStatus === "saved" && (
                          <span className="text-xs text-emerald-600">Saved</span>
                        )}
                        {generalSaveStatus === "error" && (
                          <span className="text-xs text-rose-600">Save failed</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-700">Admin access</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Update the admin username or rotate the password.
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Admin username
                          </div>
                          <input
                            value={adminUsername}
                            onChange={(event) => setAdminUsername(event.currentTarget.value)}
                            placeholder="admin"
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            New password
                          </div>
                          <input
                            type="password"
                            value={adminPassword}
                            onChange={(event) => setAdminPassword(event.currentTarget.value)}
                            placeholder="••••••••"
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Confirm password
                          </div>
                          <input
                            type="password"
                            value={adminPasswordConfirm}
                            onChange={(event) => setAdminPasswordConfirm(event.currentTarget.value)}
                            placeholder="••••••••"
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Changing the username requires setting a new password.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          onClick={saveAdminSettings}
                          disabled={adminSaveStatus === "saving"}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          {adminSaveStatus === "saving" ? "Saving..." : "Save admin"}
                        </button>
                        {adminSaveStatus === "saved" && (
                          <span className="text-xs text-emerald-600">Saved</span>
                        )}
                        {adminSaveStatus === "error" && (
                          <span className="text-xs text-rose-600">Save failed</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeSettingsTab === "api-keys" && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700">API keys</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Used for AudioDB metadata and Last.fm genre imports.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        AudioDB API key
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                      <input
                          type={showAudiodbKey ? "text" : "password"}
                        value={audiodbApiKey}
                        onChange={(event) => setAudiodbApiKey(event.currentTarget.value)}
                        placeholder="AudioDB API key"
                          className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                        <button
                          type="button"
                          onClick={() => setShowAudiodbKey((prev) => !prev)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          {showAudiodbKey ? "Hide" : "Show"}
                        </button>
                      </div>
                      {integrationsStatus && (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {integrationsStatus.audiodbConfigured
                            ? integrationsStatus.audiodbApiKey
                              ? "Configured (settings)"
                              : "Configured (.env)"
                            : "Not configured"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Last.fm API key
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                      <input
                          type={showLastfmKey ? "text" : "password"}
                        value={lastfmApiKey}
                        onChange={(event) => setLastfmApiKey(event.currentTarget.value)}
                        placeholder="Last.fm API key"
                          className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                        <button
                          type="button"
                          onClick={() => setShowLastfmKey((prev) => !prev)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          {showLastfmKey ? "Hide" : "Show"}
                        </button>
                      </div>
                      {integrationsStatus && (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {integrationsStatus.lastfmConfigured
                            ? integrationsStatus.lastfmApiKey
                              ? "Configured (settings)"
                              : "Configured (.env)"
                            : "Not configured"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={saveIntegrationSettings}
                      disabled={integrationsSaveStatus === "saving"}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      {integrationsSaveStatus === "saving" ? "Saving..." : "Save API keys"}
                    </button>
                    {integrationsSaveStatus === "saved" && (
                      <span className="text-xs text-emerald-600">Saved</span>
                    )}
                    {integrationsSaveStatus === "error" && (
                      <span className="text-xs text-rose-600">Save failed</span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Leave blank to keep using `.env` values.
                  </div>
                </div>
                )}

                {activeSettingsTab === "streaming-options" && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Streaming</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Configure streaming availability and access credentials.
                    </p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Streaming availability
                        </div>
                        <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={streamEnabled}
                            onChange={(event) => setStreamEnabled(event.currentTarget.checked)}
                            className="h-4 w-4"
                          />
                          Enable streaming features
                        </label>
                      </div>
                      <div className="border-t border-slate-100 pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Stream access token
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Required for stream URLs. Rotate if you suspect unauthorized access.
                        </p>
                        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                          <input
                            value={streamToken}
                            onChange={(event) => setStreamToken(event.currentTarget.value)}
                            placeholder="Stream token"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                          />
                          <button
                            onClick={saveStreamToken}
                            disabled={streamTokenStatus === "saving"}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {streamTokenStatus === "saving" ? "Saving..." : "Save settings"}
                          </button>
                          <button
                            onClick={regenerateStreamToken}
                            disabled={streamTokenStatus === "saving"}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Regenerate
                          </button>
                          {streamTokenStatus === "saved" && (
                            <span className="text-xs text-emerald-600">Saved</span>
                          )}
                          {streamTokenStatus === "error" && (
                            <span className="text-xs text-rose-600">Save failed</span>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Applies to Streams playlists and item endpoints.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSettingsTab === "downloads" && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700">Downloads</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Control how many downloads run at once. Max 10. Changes apply after the worker
                    restarts.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={downloadConcurrency}
                      onChange={(event) =>
                        setDownloadConcurrency(Number(event.currentTarget.value) || 1)
                      }
                      className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={saveDownloadSettings}
                      disabled={downloadSaveStatus === "saving"}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      {downloadSaveStatus === "saving" ? "Saving..." : "Save downloads"}
                    </button>
                    {downloadSaveStatus === "saved" && (
                      <span className="text-xs text-emerald-600">Saved</span>
                    )}
                    {downloadSaveStatus === "error" && (
                      <span className="text-xs text-rose-600">Save failed</span>
                    )}
                    {downloadSettings && (
                      <span className="text-xs text-slate-500">
                        Current: {downloadSettings.concurrency ?? 2}
                      </span>
                    )}
                  </div>
                </div>
                )}

                {activeSettingsTab === "search" && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Search options</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Fine-tune how auto downloads match YouTube results.
                    </p>
                    <div className="mt-4">
                      <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={skipNonOfficialMusicVideos}
                          onChange={(event) =>
                            setSkipNonOfficialMusicVideos(event.currentTarget.checked)
                          }
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          <span className="block font-semibold text-slate-700">
                            Skip non-official music videos
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            When enabled, monitored/auto downloads are skipped unless the YouTube
                            title includes &quot;Official Music Video&quot;. Manual downloads are
                            not affected.
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        onClick={saveSearchSettings}
                        disabled={searchSaveStatus === "saving"}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        {searchSaveStatus === "saving" ? "Saving..." : "Save search options"}
                      </button>
                      {searchSaveStatus === "saved" && (
                        <span className="text-xs text-emerald-600">Saved</span>
                      )}
                      {searchSaveStatus === "error" && (
                        <span className="text-xs text-rose-600">Save failed</span>
                      )}
                      {searchSettings && (
                        <span className="text-xs text-slate-500">
                          Current: {searchSettings.skipNonOfficialMusicVideos ? "On" : "Off"}
                      </span>
                    )}
                  </div>
                </div>
                )}

                {activeSettingsTab === "youtube" && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700">YouTube (yt-dlp)</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Set cookies to avoid 403 errors. Use either a Netscape-format cookies file
                    exported from your browser, or yt-dlp&apos;s cookies-from-browser option (e.g.
                    chrome, firefox, or chrome:Default). You can also paste a raw Cookie header.
                    You do not need a bearer token.
                  </p>
                  <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      How to get cookies (macOS, Windows, Linux)
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="font-semibold text-slate-700">macOS</p>
                        <p>
                          Option A: set &quot;Cookies from browser&quot; to{" "}
                          <span className="font-mono">chrome</span> or{" "}
                          <span className="font-mono">firefox</span>.
                        </p>
                        <p>
                          Option B: export a Netscape cookies file and set its full path, e.g.{" "}
                          <span className="font-mono">/Users/you/Downloads/cookies.txt</span>.
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">Windows</p>
                        <p>
                          Option A: set &quot;Cookies from browser&quot; to{" "}
                          <span className="font-mono">chrome</span> or{" "}
                          <span className="font-mono">firefox</span>.
                        </p>
                        <p>
                          Option B: export a Netscape cookies file and set its full path, e.g.{" "}
                          <span className="font-mono">
                            C:\\Users\\you\\Downloads\\cookies.txt
                          </span>
                          .
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">Linux</p>
                        <p>
                          Option A: set &quot;Cookies from browser&quot; to{" "}
                          <span className="font-mono">chrome</span> or{" "}
                          <span className="font-mono">firefox</span>.
                        </p>
                        <p>
                          Option B: export a Netscape cookies file and set its full path, e.g.{" "}
                          <span className="font-mono">/home/you/Downloads/cookies.txt</span>.
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">
                          DevTools network tab (advanced)
                        </p>
                        <p>
                          Open DevTools &gt; Network &gt; click a YouTube request &gt; Request
                          Headers, then copy the <span className="font-mono">Cookie</span> header
                          value and paste it into the &quot;Raw Cookie header&quot; field below.
                        </p>
                        <p>
                          Response headers like <span className="font-mono">HTTP/2 200</span>,{" "}
                          <span className="font-mono">content-type</span>, or{" "}
                          <span className="font-mono">server</span> are not cookies. Look for the
                          request <span className="font-mono">Cookie</span> header or export a
                          Netscape cookies file instead.
                        </p>
                      </div>
                      <p className="text-slate-500">
                        Tip: if you use multiple browser profiles, try{" "}
                        <span className="font-mono">chrome:Default</span> or{" "}
                        <span className="font-mono">chrome:Profile 1</span>.
                      </p>
                    </div>
                  </details>
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Output format for new downloads
                    </div>
                    <select
                      value={youtubeOutputFormat}
                      onChange={(event) =>
                        setYoutubeOutputFormat(event.currentTarget.value as YoutubeOutputFormat)
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    >
                      <option value="original">Keep original format (fastest)</option>
                      <option value="mp4-remux">MP4 (remux, no re-encode)</option>
                      <option value="mp4-recode">MP4 (re-encode, most compatible)</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Use MP4 if your browser cannot play WebM. Re-encode is slower but most
                      compatible and requires ffmpeg.
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      value={youtubeCookiesPath}
                      onChange={(event) => setYoutubeCookiesPath(event.currentTarget.value)}
                      placeholder="Cookies file path"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={youtubeCookiesBrowser}
                      onChange={(event) => setYoutubeCookiesBrowser(event.currentTarget.value)}
                      placeholder="Cookies from browser (e.g. chrome)"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mt-3">
                    <textarea
                      value={youtubeCookiesHeader}
                      onChange={(event) => setYoutubeCookiesHeader(event.currentTarget.value)}
                      placeholder="Raw Cookie header (name=value; name2=value2)"
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Paste just the Cookie header value; including &quot;Cookie:&quot; is OK. If you
                      paste a full request, we&apos;ll extract the Cookie line automatically.
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={saveYoutubeSettings}
                      disabled={youtubeSaveStatus === "saving"}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      {youtubeSaveStatus === "saving" ? "Saving..." : "Save YouTube settings"}
                    </button>
                    {youtubeSaveStatus === "saved" && (
                      <span className="text-xs text-emerald-600">Saved</span>
                    )}
                    {youtubeSaveStatus === "error" && (
                      <span className="text-xs text-rose-600">Save failed</span>
                    )}
                    {youtubeStatus && (
                      <span className="text-xs text-slate-500">
                        {youtubeStatus.cookiesPath ||
                        youtubeStatus.cookiesFromBrowser ||
                        youtubeStatus.cookiesHeader
                          ? "Cookies configured"
                          : "Cookies not configured"}
                        {" · "}
                        Format:{" "}
                        {youtubeStatus.outputFormat === "mp4-remux"
                          ? "MP4 (remux)"
                          : youtubeStatus.outputFormat === "mp4-recode"
                          ? "MP4 (re-encode)"
                          : "Original"}
                      </span>
                    )}
                  </div>
                </div>
                )}

                {activeSettingsTab === "plex" && (
                  <div className="rounded-xl bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700">Plex</h3>
                  {plexStatus ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Status: {plexStatus.enabled ? "enabled" : "disabled"} /{" "}
                      {plexStatus.configured ? "configured" : "not configured"}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Loading Plex status...</p>
                  )}
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <input
                      value={plexBaseUrl}
                      onChange={(event) => setPlexBaseUrl(event.currentTarget.value)}
                      placeholder="Plex base URL"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={plexToken}
                      onChange={(event) => setPlexToken(event.currentTarget.value)}
                      placeholder="Plex token"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={plexSectionId}
                      onChange={(event) => setPlexSectionId(event.currentTarget.value)}
                      placeholder="Library section ID"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={savePlexSettings}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Save
                    </button>
                    <button
                      onClick={refreshPlex}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Refresh library
                    </button>
                    <button
                      onClick={scanPlex}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Scan library
                    </button>
                  </div>
                </div>
                )}
        </section>
      )}
          </div>
          {currentPlayback && (
            <div
              ref={playerRef}
              style={playerPosition ? { left: playerPosition.x, top: playerPosition.y } : undefined}
              className={`fixed z-10 overflow-auto max-w-[90vw] max-h-[90vh] ${
                playerMode === "compact"
                  ? "w-[220px] h-[180px] min-w-[200px] min-h-[160px] resize-none"
                  : "w-[520px] h-[260px] min-w-[320px] min-h-[200px] resize"
              }`}
            >
              <div className="flex h-full w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <div
                  onPointerDown={handlePlayerPointerDown}
                  className={`flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 ${
                    playerMode === "compact"
                      ? "cursor-default"
                      : isDraggingPlayer
                      ? "cursor-grabbing"
                      : "cursor-grab"
                  }`}
                >
                  <span>
                    Now playing:{" "}
                    <span className="font-semibold text-slate-700">{currentPlayback.title}</span>
                    {currentPlayback.albumTitle ? ` · ${currentPlayback.albumTitle}` : ""}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    {currentPlaybackInfoStatus === "loading" && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">
                        Loading media…
                      </span>
                    )}
                    {currentPlaybackInfoStatus === "error" && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600">
                        Media info unavailable
                      </span>
                    )}
                    {currentPlaybackInfo && currentPlaybackInfoStatus !== "loading" && (
                      <>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          {formatResolution(
                            currentPlaybackInfo.videoWidth,
                            currentPlaybackInfo.videoHeight
                          )}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          {formatBitrate(currentPlaybackInfo.bitRate)}
                        </span>
                        {currentPlaybackInfo.videoCodec && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                            {currentPlaybackInfo.videoCodec.toUpperCase()}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={playPrev}
                      className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {playerMode === "compact" ? "⏮" : "Prev"}
                    </button>
                    <button
                      onClick={playNext}
                      className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {playerMode === "compact" ? "⏭" : "Next"}
                    </button>
                    <button
                      onClick={toggleShuffle}
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                        shuffleEnabled
                          ? "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {playerMode === "compact" ? "🔀" : "Shuffle"}
                    </button>
                    <button
                      onClick={playerMode === "compact" ? expandPlayer : dockPlayer}
                      className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {playerMode === "compact" ? "⤢" : "Dock"}
                    </button>
                    {playerMode !== "compact" && (
                      <button
                        onClick={popOutPlayer}
                        className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Pop out
                      </button>
                    )}
                    <button
                      onClick={stopPlayback}
                      className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {playerMode === "compact" ? "✕" : "Close"}
                    </button>
                  </div>
                </div>
                <div
                  className={`flex h-full min-h-0 flex-col gap-3 ${
                    playerMode === "compact" ? "" : "md:flex-row"
                  }`}
                >
                  <div className="flex min-h-0 flex-1 flex-col">
                    <video
                      key={currentPlayback.trackId}
                      src={withAuthQuery(
                        `${apiBaseUrl}/api/tracks/${currentPlayback.trackId}/stream`
                      )}
                      crossOrigin="anonymous"
                      controls
                      autoPlay
                      onEnded={playNext}
                      className="h-full w-full flex-1 rounded-lg bg-slate-900"
                    />
                  </div>
                  {playerMode !== "compact" && (
                    <div
                      className="flex min-h-0 w-full flex-col md:w-56"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Playlist
                      </div>
                      {playbackQueue.length > 0 ? (
                        <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                          {playbackQueue.map((item, index) => (
                            <div
                              key={`${item.trackId}-${index}`}
                              draggable
                              onDragStart={() => setDraggedPlaylistIndex(index)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                if (draggedPlaylistIndex === null) return;
                                reorderPlaybackQueue(draggedPlaylistIndex, index);
                                setDraggedPlaylistIndex(null);
                              }}
                              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 ${
                                index === playbackIndex
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "hover:bg-slate-100"
                              }`}
                            >
                              <button
                                onClick={() => setPlaybackIndex(index)}
                                className="flex flex-1 items-center gap-2 text-left"
                              >
                                <span className="text-[10px] text-slate-400">⋮⋮</span>
                                <span className="truncate">
                                  {item.title}
                                  {item.albumTitle ? ` · ${item.albumTitle}` : ""}
                                </span>
                              </button>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400">
                                  {index + 1}/{playbackQueue.length}
                                </span>
                                <button
                                  onClick={() => removeFromQueue(index)}
                                  className="rounded-full border border-slate-200 px-1 text-[10px] text-slate-500 hover:bg-slate-100"
                                  title="Remove from queue"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-400">Queue is empty.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {youtubeSearchContext && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4 py-6">
              <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">YouTube options</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {youtubeSearchContext.artistName} · {youtubeSearchContext.trackTitle}
                    </div>
                  </div>
                  <button
                    onClick={closeYoutubeSearchModal}
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    value={youtubeSearchQuery}
                    onChange={(event) => setYoutubeSearchQuery(event.currentTarget.value)}
                    placeholder="Search YouTube..."
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    onClick={() => searchYoutubeResults()}
                    disabled={youtubeSearchLoading}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {youtubeSearchLoading ? "Searching..." : "Search"}
                  </button>
                </div>

                {youtubeSearchError && (
                  <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {youtubeSearchError}
                  </div>
                )}

                <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
                  {youtubeSearchLoading && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6">
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                        </span>
                        Searching YouTube...
                      </div>
                      <div className="mt-4 space-y-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={`skeleton-${index}`}
                            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                          >
                            <div className="h-16 w-28 rounded-lg bg-slate-100 animate-pulse" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
                              <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
                              <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!youtubeSearchLoading && youtubeSearchResults.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                      No results yet. Try a different search phrase.
                    </div>
                  )}
                  {youtubeSearchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/30 p-4 shadow-sm md:flex-row md:items-center"
                    >
                      <div className="h-20 w-32 overflow-hidden rounded-xl bg-slate-200">
                        {result.thumbnail ? (
                          <img
                            src={result.thumbnail}
                            alt={result.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            No preview
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="text-sm font-semibold text-slate-900">{result.title}</div>
                        <div className="text-xs text-slate-500">
                          {result.channel || "Unknown channel"} · {formatDuration(result.duration)}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {result.qualities.length > 0 ? (
                            result.qualities.map((quality) => (
                              <span
                                key={quality}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500"
                              >
                                {quality}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400">Qualities unknown</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-row items-center gap-2 md:flex-col md:items-end">
                        <select
                          value={youtubeSearchQuality[result.id] ?? ""}
                          onChange={(event) =>
                            setYoutubeSearchQuality((prev) => ({
                              ...prev,
                              [result.id]: event.currentTarget.value
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                        >
                          <option value="">Auto (best)</option>
                          {result.qualities.map((quality) => (
                            <option key={quality} value={quality}>
                              {quality}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => downloadYoutubeResult(result)}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {deleteArtistModal.open && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 px-4 py-6"
              onClick={closeDeleteArtistModal}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="text-lg font-semibold text-slate-900">
                  {deleteArtistModal.artistIds.length > 1 ? "Delete artists?" : "Delete artist?"}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  This will remove {deleteArtistModal.label} and any downloaded files. This action
                  cannot be undone.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={closeDeleteArtistModal}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void confirmDeleteArtistModal()}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
          {pendingImportArtist && (
            <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <div className="text-lg font-semibold text-slate-900">
                  Add {pendingImportArtist.name}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Choose how you want to import this artist and which quality to target for
                  downloads.
                </p>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Import mode
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "discography"}
                          onChange={() => setImportMode("discography")}
                        />
                        <span>
                          <span className="font-semibold">Discography</span> — import all albums and
                          tracks, and optionally queue downloads.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "new"}
                          onChange={() => setImportMode("new")}
                        />
                        <span>
                          <span className="font-semibold">New albums only</span> — import albums but
                          mark them unmonitored for now.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "custom"}
                          onChange={() => setImportMode("custom")}
                        />
                        <span>
                          <span className="font-semibold">Custom</span> — import metadata only and
                          manually queue downloads per song/album.
                        </span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Quality
                    </div>
                    <select
                      value={importQuality}
                      onChange={(event) =>
                        setImportQuality(event.currentTarget.value as ArtistPreference["quality"])
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="144p">144p</option>
                      <option value="240p">240p</option>
                      <option value="360p">360p</option>
                      <option value="480p">480p</option>
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="1440p">1440p</option>
                      <option value="2160p">4K (2160p)</option>
                      <option value="4320p">8K (4320p)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={importAutoDownload}
                      onChange={(event) => setImportAutoDownload(event.currentTarget.checked)}
                    />
                    Auto-download tracks after import
                  </label>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={() => setPendingImportArtist(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => importArtist(pendingImportArtist.id, pendingImportArtist.name)}
                    disabled={isImportingArtist}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isImportingArtist && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    )}
                    {isImportingArtist ? "Adding..." : "Add artist"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
