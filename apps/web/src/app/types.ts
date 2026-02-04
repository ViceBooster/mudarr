export type ActivityEvent = {
  id: number;
  type: string;
  message: string;
  metadata: unknown;
  created_at: string;
};

export type Artist = {
  id: number;
  name: string;
  image_url?: string | null;
  created_at: string;
  genres: { id: number; name: string }[];
  has_downloads?: boolean;
  monitored_count?: number | null;
  downloaded_count?: number | null;
};

export type Genre = {
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

export type GenreImportResult = {
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

export type GenreImportStartResult = {
  status: "queued";
  jobId: string;
  total: number;
};

export type GenreImportJob = {
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

export type ArtistImportJob = {
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

export type DownloadJob = {
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

export type ListSource = {
  id: number;
  type: string;
  external_id: string;
  name: string;
  enabled: boolean;
  last_sync_at: string | null;
  created_at: string;
};

export type PlexStatus = {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
};

export type YoutubeOutputFormat = "original" | "mp4-remux" | "mp4-recode";

export type YoutubeSettings = {
  cookiesPath: string | null;
  cookiesFromBrowser: string | null;
  cookiesHeader: string | null;
  outputFormat: YoutubeOutputFormat | null;
};

export type DownloadSettings = {
  concurrency: number | null;
};

export type SearchSettings = {
  skipNonOfficialMusicVideos: boolean;
};

export type YoutubeSearchResult = {
  id: string;
  title: string;
  channel: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string | null;
  qualities: string[];
};

export type YoutubeSearchContext = {
  trackId: number;
  trackTitle: string;
  albumId: number;
  albumTitle: string;
  artistName: string;
};

export type IntegrationSettings = {
  audiodbApiKey: string | null;
  lastfmApiKey: string | null;
  audiodbConfigured: boolean;
  lastfmConfigured: boolean;
};

export type StreamSettings = {
  token: string;
  enabled: boolean;
};

export type GeneralSettings = {
  mediaRoot: string | null;
  domain: string | null;
  publicApiBaseUrl: string | null;
};

export type SetupDefaults = {
  mediaRoot: string;
  domain: string | null;
  publicApiBaseUrl: string | null;
  streamEnabled: boolean;
};

export type SetupStatusResponse = {
  completed: boolean;
  defaults?: SetupDefaults;
};

export type AuthStatusResponse = {
  authenticated: boolean;
  username: string | null;
};

export type AuthLoginResponse = {
  token: string;
  username: string;
};

export type AdminSettings = {
  username: string | null;
};

export type UpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  releaseUrl: string | null;
  checkedAt: string;
  source: "github" | "custom" | "none";
  message?: string | null;
};

export type StorageBrowseEntry = {
  name: string;
  path: string;
};

export type StorageBrowseResponse = {
  path: string;
  parent: string | null;
  entries: StorageBrowseEntry[];
};

export type StreamEncoding = "original" | "copy" | "transcode" | "web";

export type StreamStatus = "active" | "stopped";

export type StreamTrackOption = {
  id: number;
  title: string;
  album_title: string | null;
  artist_name: string | null;
};

export type StreamItem = {
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

export type StreamProbeSnapshot = {
  updatedAt: string;
  trackId: number | null;
  data: unknown | null;
  error: string | null;
} | null;

export type StreamSummary = {
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
  streamProbe: StreamProbeSnapshot;
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

export type TrackMediaInfo = {
  bytes: number | null;
  duration: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  bitRate: number | null;
};

export type DashboardStats = {
  artists: number;
  mediaBytes: number;
  mediaFiles: number;
  missingFiles: number;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  activeConnections: number;
  bandwidthBps: number;
};

export type DashboardStatsSample = {
  timestamp: number;
  activeConnections: number;
  bandwidthBps: number;
};

export type PlaybackItem = {
  trackId: number;
  title: string;
  albumTitle: string | null;
};

export type AudioDbArtist = {
  id: string;
  name: string;
  genre: string | null;
  style: string | null;
  thumb: string | null;
  source?: "local" | "theaudiodb" | "lastfm" | null;
  listeners?: number | null;
};

export type TrackDetail = {
  id: number;
  title: string;
  track_no: number | null;
  monitored: boolean;
  downloaded?: boolean;
  download_status?: string | null;
  progress_percent?: number | null;
  download_error?: string | null;
};

export type AlbumDetail = {
  id: number;
  title: string;
  year: number | null;
  monitored: boolean;
  tracks: TrackDetail[];
};

export type ArtistDetail = {
  artist: {
    id: number;
    name: string;
    image_url?: string | null;
    created_at: string;
    genres: { id: number; name: string }[];
  };
  albums: AlbumDetail[];
};

export type ArtistPreference = {
  import_mode: "discography" | "new" | "custom";
  quality: "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | "4320p";
  auto_download: boolean;
};

export type ArtistSortKey = "name" | "created_at";

export type ArtistSortDirection = "asc" | "desc";

