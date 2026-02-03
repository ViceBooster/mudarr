import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { defaultSettingsTab, settingsTabs, streamCreateRoute, tabRoutes, tabs, type SettingsTabId } from "./app/routes";
import { InitialSetupScreen } from "./app/screens/InitialSetupScreen";
import { LoadingScreen } from "./app/screens/LoadingScreen";
import { LoginScreen } from "./app/screens/LoginScreen";
import { SetupErrorScreen } from "./app/screens/SetupErrorScreen";
import { Sidebar } from "./app/components/Sidebar";
import { useActiveStreamsCount } from "./features/streams/useActiveStreamsCount";
import { StorageBrowserModal } from "./app/components/StorageBrowserModal";
import { AppMain } from "./app/components/AppMain";
import { getResolutionSummary } from "./features/streams/utils";
import { useStreamsFeature } from "./features/streams/useStreamsFeature";
import { useYoutubeSearch } from "./features/youtube/useYoutubeSearch";
import { useFloatingPlayerLayout } from "./features/player/useFloatingPlayerLayout";
import { usePlaybackQueue } from "./features/player/usePlaybackQueue";
import { useArtistSearchResults } from "./features/artists/useArtistSearchResults";
import { useDownloadsPolling } from "./features/downloads/useDownloadsPolling";
import { useCurrentPlaybackInfo } from "./features/player/useCurrentPlaybackInfo";
import { useGenreImportFeature } from "./features/lists/useGenreImportFeature";
import { useListsFeature } from "./features/lists/useListsFeature";
import { useSettingsActions } from "./features/settings/useSettingsActions";
import { Sparkline } from "./components/charts/Sparkline";
import {
  ArtistIcon,
  AudioIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  ConnectionsIcon,
  DownloadIcon,
  EditIcon,
  FormatIcon,
  HomeIcon,
  ListIcon,
  LogsIcon,
  MenuIcon,
  PlayIcon,
  RefreshIcon,
  ResolutionIcon,
  SearchIcon,
  SettingsIcon,
  ShuffleIcon,
  StopIcon,
  StreamIcon,
  TracksIcon,
  TrashIcon,
  VideoIcon
} from "./components/icons";
import {
  DASHBOARD_STATS_INTERVAL_MS,
  DOWNLOADS_PAGE_SIZE
} from "./constants/ui";
import {
  formatBandwidth,
  formatBitrate,
  formatBytes,
  formatDuration,
  formatElapsed,
  formatResolution,
  formatVersionLabel
} from "./utils/format";
import { matchesArtistQuery, toSentenceCase } from "./utils/text";
import { buildDownloadProgress } from "./utils/progress";
import type {
  ActivityEvent,
  AdminSettings,
  AlbumDetail,
  Artist,
  ArtistDetail,
  ArtistImportJob,
  ArtistPreference,
  ArtistSortDirection,
  ArtistSortKey,
  AudioDbArtist,
  AuthLoginResponse,
  AuthStatusResponse,
  DashboardStats,
  DashboardStatsSample,
  DownloadJob,
  DownloadSettings,
  Genre,
  GenreImportJob,
  GenreImportResult,
  GenreImportStartResult,
  GeneralSettings,
  IntegrationSettings,
  ListSource,
  PlaybackItem,
  PlexStatus,
  SearchSettings,
  SetupDefaults,
  SetupStatusResponse,
  StorageBrowseEntry,
  StorageBrowseResponse,
  StreamEncoding,
  StreamItem,
  StreamSettings,
  StreamStatus,
  StreamSummary,
  StreamTrackOption,
  TrackDetail,
  TrackMediaInfo,
  UpdateStatus,
  YoutubeOutputFormat,
  YoutubeSearchContext,
  YoutubeSearchResult,
  YoutubeSettings
} from "./app/types";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [lists, setLists] = useState<ListSource[]>([]);
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
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);
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
  const [newDownloadQuery, setNewDownloadQuery] = useState("");
  const [downloadsPage, setDownloadsPage] = useState(1);
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [plexBaseUrl, setPlexBaseUrl] = useState("");
  const [plexToken, setPlexToken] = useState("");
  const [plexSectionId, setPlexSectionId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { searchResults, setSearchResults, clearSearchResults, searchLoading } =
    useArtistSearchResults({ apiGet, searchTerm });
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
  const loadArtistDetail = useCallback(async (artistId: number) => {
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
  }, [apiGet]);
  const {
    youtubeSearchContext,
    youtubeSearchQuery,
    setYoutubeSearchQuery,
    youtubeSearchResults,
    youtubeSearchLoading,
    youtubeSearchError,
    youtubeSearchQuality,
    setYoutubeSearchQuality,
    openYoutubeSearchModal,
    closeYoutubeSearchModal,
    searchYoutubeResults,
    downloadYoutubeResult
  } = useYoutubeSearch({
    apiGet,
    apiPost,
    artistDetail,
    importQuality,
    loadAll,
    loadArtistDetail,
    setMonitorNotice
  });
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
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [streamingStatsHistory, setStreamingStatsHistory] = useState<DashboardStatsSample[]>([]);
  const artistSettingsRef = useRef<HTMLDivElement | null>(null);
  const artistTracksRef = useRef<HTMLDivElement | null>(null);
  const previousImportJobIds = useRef<Set<number>>(new Set());
  const recentImportJobIds = useRef<Set<number>>(new Set());
  const updateCheckTriggered = useRef(false);
  const importJobsInFlight = useRef(false);
  const hasActiveImportJobsRef = useRef(false);
  const lastImportJobsFetchAt = useRef(0);

  const setupComplete = setupStatus === "complete";
  const canUseApi = setupComplete && authStatus === "authenticated";

  const streamsEnabled = streamEnabled;
  const { activeStreamsCount } = useActiveStreamsCount({ canUseApi, streamsEnabled, apiGet });

  const {
    genreImportId,
    setGenreImportId,
    genreImportName,
    setGenreImportName,
    genreImportLimit,
    setGenreImportLimit,
    genreImportSource,
    setGenreImportSource,
    genreImportMode,
    setGenreImportMode,
    genreImportQuality,
    setGenreImportQuality,
    genreImportAutoDownload,
    setGenreImportAutoDownload,
    genreImportEnabled,
    setGenreImportEnabled,
    genreImportNotice,
    isGenreImporting,
    genreImportJob,
    lastfmTagsStatus,
    lastfmTagsError,
    configuredGenreImports,
    lastfmTagOptions,
    isGenreImportRunning,
    genreImportProgress,
    resetGenreImportForm,
    editGenreImport,
    selectGenreImportTag,
    saveGenreImportSettings,
    deleteGenreImportSettings,
    runGenreImport,
    importGenreArtists,
    loadLastfmTags
  } = useGenreImportFeature({
    canUseApi,
    genres,
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    loadAll,
    setError
  });

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

  const isStreamCreateRoute = useMemo(
    () => location.pathname === streamCreateRoute,
    [location.pathname]
  );

  const {
    streams,
    streamsLoading,
    visibleStreams,
    streamSearchQuery,
    setStreamSearchQuery,
    streamOnlineFilter,
    setStreamOnlineFilter,
    streamSort,
    setStreamSort,
    downloadStreamsM3u,
    loadStreams,
    streamName,
    setStreamName,
    streamIcon,
    setStreamIcon,
    streamEncoding,
    setStreamEncoding,
    streamShuffle,
    setStreamShuffle,
    streamPrecacheHls,
    setStreamPrecacheHls,
    streamSource,
    setStreamSource,
    streamTrackQuery,
    setStreamTrackQuery,
    streamTrackLoading,
    streamTrackResults,
    addStreamTrack,
    selectedStreamTracks,
    moveStreamTrack,
    removeStreamTrack,
    streamArtistQuery,
    setStreamArtistQuery,
    filteredStreamArtists,
    streamArtistIds,
    toggleStreamArtist,
    streamGenreQuery,
    setStreamGenreQuery,
    filteredStreamGenres,
    streamGenreIds,
    toggleStreamGenre,
    isCreatingStream,
    createStream,
    expandedStreamIds,
    toggleStreamExpanded,
    streamHlsPrecacheStatus,
    streamMenuId,
    setStreamMenuId,
    streamMenuRef,
    toggleStreamMenu,
    editingStreamId,
    beginEditStream,
    cancelEditStream,
    restartingStreamIds,
    rescanningStreamIds,
    streamLiveUrl,
    streamCachedUrl,
    shareableStreamUrl,
    runStreamAction,
    rescanStream,
    precacheStreamHls,
    deleteStream,
    setConnectionsModalStreamId,
    editingStreamName,
    setEditingStreamName,
    editingStreamIcon,
    setEditingStreamIcon,
    editingStreamEncoding,
    setEditingStreamEncoding,
    editingStreamShuffle,
    setEditingStreamShuffle,
    editingStreamRestartOnSave,
    setEditingStreamRestartOnSave,
    editingStreamPrecacheHls,
    setEditingStreamPrecacheHls,
    editingStreamStatus,
    setEditingStreamStatus,
    editingStreamTab,
    setEditingStreamTab,
    editingStreamArtistQuery,
    setEditingStreamArtistQuery,
    filteredEditingStreamArtists,
    editingStreamArtistIds,
    editingStreamArtistLoadingIds,
    toggleEditingStreamArtist,
    editingStreamTrackQuery,
    setEditingStreamTrackQuery,
    editingStreamTrackLoading,
    editingStreamTrackResults,
    addEditingStreamTrack,
    editingStreamTracks,
    editingStreamSelectedIds,
    handleEditingStreamTrackSelect,
    shuffleEditingStreamTracks,
    moveEditingStreamTrack,
    moveEditingStreamTracksToEdge,
    removeEditingStreamTrack,
    rescanEditingStream,
    saveStreamEdits,
    connectionsModalStream,
    openStreamPlayer,
    playingStreamId,
    streamPlayerNotice,
    setStreamPlayerNotice,
    streamPlayerRef,
    closeStreamPlayer
  } = useStreamsFeature({
    canUseApi,
    streamsEnabled,
    activeTab,
    isStreamCreateRoute,
    pathname: location.pathname,
    navigate,
    apiBaseUrl,
    generalDomain,
    generalPublicApiBaseUrl,
    streamSettings,
    streamToken,
    apiGet,
    apiPost,
    apiPut,
    apiPatch,
    apiDelete,
    artists,
    genres,
    setError
  });

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

  async function loadAll() {
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
  }

  const loadDownloadsOnly = useCallback(async () => {
    if (!canUseApi) return;
    try {
      const downloadData = await apiGet<DownloadJob[]>("/api/downloads");
      setDownloads(downloadData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load downloads");
    }
  }, [apiGet, canUseApi]);

  const loadDashboardStats = useCallback(async () => {
    if (!canUseApi) return;
    try {
      const stats = await apiGet<DashboardStats>("/api/stats");
      setDashboardStats(stats);
    } catch (err) {
      setDashboardStats(null);
      setError(err instanceof Error ? err.message : "Failed to load dashboard stats");
    }
  }, [apiGet, canUseApi]);

  const loadStreamingStatsHistory = async () => {
    if (!canUseApi) return;
    try {
      const samples = await apiGet<DashboardStatsSample[]>("/api/stats/history");
      setStreamingStatsHistory(samples);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load streaming stats history");
    }
  };

  const loadArtistsOnly = useCallback(async () => {
    if (!canUseApi) return;
    try {
      const artistData = await apiGet<Artist[]>("/api/artists");
      setArtists(artistData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artists");
    }
  }, [apiGet, canUseApi]);

  const loadArtistImportJobs = useCallback(async () => {
    if (!canUseApi) return;
    // Hard throttle: even if multiple pollers exist (HMR/duplicate mounts),
    // never hit this endpoint more often than every 10s.
    const minIntervalMs = 10_000;
    const now = Date.now();
    const w = window as unknown as Record<string, unknown>;
    const globalLast = typeof w.__mudarrImportJobsLastFetchAt === "number" ? (w.__mudarrImportJobsLastFetchAt as number) : 0;
    const globalInFlight = w.__mudarrImportJobsInFlight === true;
    const last = Math.max(lastImportJobsFetchAt.current, globalLast);
    if (globalInFlight) return;
    if (now - last < minIntervalMs) return;
    if (importJobsInFlight.current) return;

    importJobsInFlight.current = true;
    w.__mudarrImportJobsInFlight = true;
    lastImportJobsFetchAt.current = now;
    w.__mudarrImportJobsLastFetchAt = now;
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
    } finally {
      importJobsInFlight.current = false;
      w.__mudarrImportJobsInFlight = false;
    }
  }, [apiGet, canUseApi, isArtistDetailRoute, artistRouteId, activeTab, loadArtistDetail, loadArtistsOnly, loadDashboardStats]);

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

  const checkForUpdates = async (force = false) => {
    if (!canUseApi) return;
    setUpdateCheckStatus("loading");
    setUpdateCheckError(null);
    try {
      const suffix = force ? "?force=1" : "";
      const result = await apiGet<UpdateStatus>(`/api/settings/updates${suffix}`);
      setUpdateStatus(result);
      setUpdateCheckStatus("idle");
    } catch (err) {
      setUpdateCheckStatus("error");
      setUpdateCheckError(err instanceof Error ? err.message : "Update check failed");
    }
  };

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
    if (!canUseApi || updateCheckTriggered.current) return;
    updateCheckTriggered.current = true;
    void checkForUpdates(false);
  }, [canUseApi]);

  useEffect(() => {
    hasActiveImportJobsRef.current = artistImportJobs.some(
      (job) => job.status === "pending" || job.status === "processing"
    );
  }, [artistImportJobs]);

  useEffect(() => {
    if (!canUseApi) return;
    const isLogsPage = location.pathname === "/logs";
    let timeoutId: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const hasActiveImportJobs = hasActiveImportJobsRef.current;
      const intervalMs = isLogsPage || hasActiveImportJobs ? 10000 : 30000;
      timeoutId = window.setTimeout(() => {
        void loadArtistImportJobs().finally(() => {
          scheduleNext();
        });
      }, intervalMs);
    };

    void loadArtistImportJobs().finally(() => {
      scheduleNext();
    });

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [canUseApi, location.pathname, loadArtistImportJobs]);

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

  const { newListType, setNewListType, newListId, setNewListId, newListName, setNewListName, addList, filteredLists } =
    useListsFeature({
      apiPost,
      loadAll,
      lists,
      normalizedSearch
    });

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

  useDownloadsPolling({
    activeDownloadCount: activeDownloadCounts.total,
    pathname: location.pathname,
    loadDownloadsOnly,
    loadArtistsOnly
  });

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

  const addGenre = async () => {
    if (!newGenre.trim()) return;
    await apiPost("/api/genres", { name: newGenre.trim() });
    setNewGenre("");
    await loadAll();
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
      clearSearchResults();
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
  const {
    saveGeneralSettings,
    saveAdminSettings,
    saveIntegrationSettings,
    saveStreamToken,
    regenerateStreamToken,
    saveDownloadSettings,
    saveSearchSettings,
    saveYoutubeSettings
  } = useSettingsActions({
    apiPut,
    apiPost,
    setError,
    generalMediaRoot,
    generalDomain,
    generalPublicApiBaseUrl,
    setGeneralMediaRoot,
    setGeneralDomain,
    setGeneralPublicApiBaseUrl,
    setGeneralSaveStatus,
    adminUsername,
    currentAdminUsername,
    adminPassword,
    adminPasswordConfirm,
    setAdminUsername,
    setCurrentAdminUsername,
    setAdminPassword,
    setAdminPasswordConfirm,
    setAdminSaveStatus,
    setAuthToken,
    audiodbApiKey,
    lastfmApiKey,
    setIntegrationsStatus,
    setAudiodbApiKey,
    setLastfmApiKey,
    setIntegrationsSaveStatus,
    reloadLastfmTags: loadLastfmTags,
    streamToken,
    streamEnabled,
    setStreamSettings,
    setStreamToken,
    setStreamEnabled,
    setStreamTokenStatus,
    downloadConcurrency,
    setDownloadSettings,
    setDownloadConcurrency,
    setDownloadSaveStatus,
    skipNonOfficialMusicVideos,
    setSearchSettings,
    setSkipNonOfficialMusicVideos,
    setSearchSaveStatus,
    youtubeCookiesPath,
    youtubeCookiesBrowser,
    youtubeCookiesHeader,
    youtubeOutputFormat,
    setYoutubeStatus,
    setYoutubeCookiesHeader,
    setYoutubeSaveStatus
  });

  const {
    playbackQueue,
    playbackIndex,
    setPlaybackIndex,
    draggedPlaylistIndex,
    setDraggedPlaylistIndex,
    currentPlayback,
    hasActivePlayback,
    shuffleEnabled,
    toggleShuffle,
    playNext,
    playPrev,
    playTrack,
    enqueueTrack,
    playAlbum,
    enqueueAlbum,
    playArtistFromDashboard,
    enqueueArtistFromDashboard,
    reorderPlaybackQueue,
    removeFromQueue,
    removeTrackFromQueue,
    stopPlayback
  } = usePlaybackQueue({ apiGet, setError });

  const {
    playerRef,
    playerPosition,
    playerMode,
    isDraggingPlayer,
    handlePlayerPointerDown,
    dockPlayer,
    expandPlayer
  } = useFloatingPlayerLayout({ hasPlayback: Boolean(currentPlayback) });

  const { currentPlaybackInfo, currentPlaybackInfoStatus } = useCurrentPlaybackInfo({
    apiGet,
    trackId: currentPlayback?.trackId ?? null
  });

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
      removeTrackFromQueue(trackId);
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
  const showLogin = setupStatus === "complete" && authStatus === "unauthenticated";

  const appMainProps = {
    header: {
      searchTerm,
      onSearchTermChange: setSearchTerm,
      searchPlaceholder,
      showSearchPanel,
      searchLoading,
      localSearchMatches,
      externalSearchResults,
      hasSearchResults,
      searchSourcesLabel,
      getExistingArtistId: (name: string) => artistByName.get(name.toLowerCase())?.id ?? null,
      onViewArtist: (artistId: number) => {
        setSearchTerm("");
        clearSearchResults();
        void openArtistPage(artistId);
      },
      onAddExternalArtist: openImportModal,
      versionLabel: formatVersionLabel(updateStatus?.currentVersion),
      updateAvailable: Boolean(updateStatus?.updateAvailable),
      onOpenUpdates: () => changeSettingsTab("updates")
    },
    activeTab,
    streamsEnabled,
    error,
    dashboardRouteProps: {
      canUseApi,
      loadAll,
      loadDashboardStats,
      loadStreamingStatsHistory
    },
    dashboardPageProps: {
      streamsEnabled,
      dashboardStats,
      artistsCount: artists.length,
      latestStreamingSample,
      activeConnectionsSeries,
      bandwidthSeries,
      artistSortKey,
      artistSortDirection,
      toggleArtistSort,
      dashboardView,
      setDashboardView,
      dashboardSelectMode,
      toggleDashboardSelectMode,
      selectedArtistIds,
      clearArtistSelection,
      bulkImportMode,
      setBulkImportMode,
      bulkQuality,
      setBulkQuality,
      bulkAutoDownload,
      setBulkAutoDownload,
      applyBulkPreferences,
      deleteSelectedArtists,
      dashboardArtists,
      toggleSelectAllArtists,
      toggleArtistSelection,
      openArtistPage: (artistId: number) => void openArtistPage(artistId),
      playArtistFromDashboard,
      enqueueArtistFromDashboard,
      hasActivePlayback,
      deleteArtist
    },
    artistsRouteProps: {
      canUseApi,
      selectedArtistId,
      loadArtistDetail,
      resetArtistRoute: () => {
        setArtistDetail(null);
        setSelectedArtistId(null);
      },
      setExpandedAlbumIds,
      setMonitorNotice
    },
    artistsPageProps: {
      isArtistDetailRoute,
      artistDetail,
      monitorNotice,
      selectedAlbumIds,
      setSelectedAlbumIds,
      toggleSelectAllAlbums,
      toggleAlbumSelection,
      applyAlbumMonitoring,
      expandedAlbumIds,
      toggleAlbumExpanded,
      updateAlbumMonitored,
      updateTrackMonitored,
      changeTabToArtists: () => changeTab("Artists"),
      artistHasDownloads,
      artistDownloadProgress,
      artistSettingsRef,
      artistTracksRef,
      scrollToArtistSettings,
      scrollToArtistTracks,
      playArtistFromDashboard,
      enqueueArtistFromDashboard,
      hasActivePlayback,
      deleteArtist,
      downloadArtistM3u,
      resyncArtist,
      isResyncing,
      importMode,
      setImportMode,
      importQuality,
      setImportQuality,
      importAutoDownload,
      setImportAutoDownload,
      saveArtistPreferences,
      playAlbum,
      enqueueAlbum,
      downloadAlbumM3u,
      playTrack,
      enqueueTrack,
      remuxTrackMedia,
      deleteTrackMedia,
      queueTrackDownload,
      openYoutubeSearchModal,
      filteredArtists,
      openArtistPage: (artistId: number) => void openArtistPage(artistId)
    },
    downloadsRouteProps: {
      downloadsPageCount,
      setDownloadsPage
    },
    downloadsPageProps: {
      activeDownloadCounts,
      clearActiveDownloads,
      downloadsPageItems,
      downloadsForDisplayCount: downloadsForDisplay.length,
      cancelDownload,
      downloadsPage,
      downloadsPageCount,
      setDownloadsPage
    },
    listsPageProps: {
      newListType,
      setNewListType,
      newListId,
      setNewListId,
      newListName,
      setNewListName,
      addList,
      filteredLists,
      genreImportNotice,
      genreImportSource,
      setGenreImportSource,
      genreImportName,
      selectGenreImportTag,
      lastfmTagsStatus,
      lastfmTagOptions,
      genreImportLimit,
      setGenreImportLimit,
      importGenreArtists,
      isGenreImporting,
      isGenreImportRunning,
      saveGenreImportSettings,
      resetGenreImportForm,
      genreImportMode,
      setGenreImportMode,
      genreImportQuality,
      setGenreImportQuality,
      genreImportAutoDownload,
      setGenreImportAutoDownload,
      genreImportEnabled,
      setGenreImportEnabled,
      lastfmTagsError,
      genreImportJob,
      genreImportProgress,
      configuredGenreImports,
      editGenreImport,
      runGenreImport,
      deleteGenreImportSettings
    },
    streamsPageProps: {
      streams,
      streamsLoading,
      visibleStreams,
      streamSearchQuery,
      setStreamSearchQuery,
      streamOnlineFilter,
      setStreamOnlineFilter,
      streamSort,
      setStreamSort,
      downloadStreamsM3u,
      loadStreams,
      isStreamCreateRoute,
      streamName,
      setStreamName,
      streamIcon,
      setStreamIcon,
      streamEncoding,
      setStreamEncoding,
      streamShuffle,
      setStreamShuffle,
      streamPrecacheHls,
      setStreamPrecacheHls,
      streamSource,
      setStreamSource,
      streamTrackQuery,
      setStreamTrackQuery,
      streamTrackLoading,
      streamTrackResults,
      addStreamTrack,
      selectedStreamTracks,
      moveStreamTrack,
      removeStreamTrack,
      streamArtistQuery,
      setStreamArtistQuery,
      filteredStreamArtists,
      streamArtistIds,
      toggleStreamArtist,
      streamGenreQuery,
      setStreamGenreQuery,
      filteredStreamGenres,
      streamGenreIds,
      toggleStreamGenre,
      isCreatingStream,
      createStream,
      expandedStreamIds,
      toggleStreamExpanded,
      streamHlsPrecacheStatus,
      streamMenuId,
      setStreamMenuId,
      streamMenuRef,
      toggleStreamMenu,
      editingStreamId,
      beginEditStream,
      cancelEditStream,
      restartingStreamIds,
      rescanningStreamIds,
      streamLiveUrl,
      streamCachedUrl,
      shareableStreamUrl,
      getResolutionSummary,
      openStreamPlayer,
      runStreamAction,
      rescanStream,
      precacheStreamHls,
      deleteStream,
      setConnectionsModalStreamId,
      editingStreamName,
      setEditingStreamName,
      editingStreamIcon,
      setEditingStreamIcon,
      editingStreamEncoding,
      setEditingStreamEncoding,
      editingStreamShuffle,
      setEditingStreamShuffle,
      editingStreamRestartOnSave,
      setEditingStreamRestartOnSave,
      editingStreamPrecacheHls,
      setEditingStreamPrecacheHls,
      editingStreamStatus,
      setEditingStreamStatus,
      editingStreamTab,
      setEditingStreamTab,
      editingStreamArtistQuery,
      setEditingStreamArtistQuery,
      filteredEditingStreamArtists,
      editingStreamArtistIds,
      editingStreamArtistLoadingIds,
      toggleEditingStreamArtist,
      editingStreamTrackQuery,
      setEditingStreamTrackQuery,
      editingStreamTrackLoading,
      editingStreamTrackResults,
      addEditingStreamTrack,
      editingStreamTracks,
      editingStreamSelectedIds,
      handleEditingStreamTrackSelect,
      shuffleEditingStreamTracks,
      moveEditingStreamTrack,
      moveEditingStreamTracksToEdge,
      removeEditingStreamTrack,
      rescanEditingStream,
      saveStreamEdits,
      connectionsModalStream,
      playingStreamId,
      streamPlayerNotice,
      setStreamPlayerNotice,
      streamPlayerRef,
      closeStreamPlayer
    },
    logsPageProps: {
      downloadFailedLogs,
      clearLogs,
      refreshAll: loadAll,
      loadArtistImportJobs,
      artistImportJobs,
      cancelArtistImport,
      filteredActivity,
      clearFailedDownloads,
      downloads
    },
    settingsRouteProps: {
      canUseApi,
      activeSettingsTab,
      updateStatus,
      checkForUpdates
    },
    settingsPageProps: {
      apiBaseUrl,
      settingsTabs,
      activeSettingsTab,
      changeSettingsTab,
      showSettingsNotice,
      dismissSettingsNotice: () => setShowSettingsNotice(false),
      generalMediaRoot,
      setGeneralMediaRoot,
      generalDomain,
      setGeneralDomain,
      generalPublicApiBaseUrl,
      setGeneralPublicApiBaseUrl,
      generalSaveStatus,
      saveGeneralSettings,
      openStorageBrowser: () => openStorageBrowser("settings"),
      adminUsername,
      setAdminUsername,
      adminPassword,
      setAdminPassword,
      adminPasswordConfirm,
      setAdminPasswordConfirm,
      adminSaveStatus,
      saveAdminSettings,
      audiodbApiKey,
      setAudiodbApiKey,
      showAudiodbKey,
      setShowAudiodbKey,
      lastfmApiKey,
      setLastfmApiKey,
      showLastfmKey,
      setShowLastfmKey,
      integrationsStatus,
      integrationsSaveStatus,
      saveIntegrationSettings,
      streamEnabled,
      setStreamEnabled,
      streamToken,
      setStreamToken,
      streamTokenStatus,
      saveStreamToken,
      regenerateStreamToken,
      downloadConcurrency,
      setDownloadConcurrency,
      saveDownloadSettings,
      downloadSaveStatus,
      downloadSettings,
      skipNonOfficialMusicVideos,
      setSkipNonOfficialMusicVideos,
      saveSearchSettings,
      searchSaveStatus,
      searchSettings,
      youtubeOutputFormat,
      setYoutubeOutputFormat,
      youtubeCookiesPath,
      setYoutubeCookiesPath,
      youtubeCookiesBrowser,
      setYoutubeCookiesBrowser,
      youtubeCookiesHeader,
      setYoutubeCookiesHeader,
      saveYoutubeSettings,
      youtubeSaveStatus,
      youtubeStatus,
      updateStatus,
      updateCheckStatus,
      updateCheckError,
      checkForUpdates,
      plexStatus,
      plexBaseUrl,
      setPlexBaseUrl,
      plexToken,
      setPlexToken,
      plexSectionId,
      setPlexSectionId,
      savePlexSettings,
      refreshPlex,
      scanPlex
    },
    nowPlayingWidgetProps: {
      currentPlayback,
      playbackQueue,
      playbackIndex,
      setPlaybackIndex,
      draggedPlaylistIndex,
      setDraggedPlaylistIndex,
      reorderPlaybackQueue,
      removeFromQueue,
      currentPlaybackInfoStatus,
      currentPlaybackInfo,
      playerRef,
      playerPosition,
      playerMode,
      isDraggingPlayer,
      handlePlayerPointerDown,
      shuffleEnabled,
      toggleShuffle,
      playPrev,
      playNext,
      dockPlayer,
      expandPlayer,
      popOutPlayer,
      stopPlayback,
      getTrackStreamUrl: (trackId: number) =>
        withAuthQuery(`${apiBaseUrl}/api/tracks/${trackId}/stream`)
    },
    youtubeOptionsModalProps: {
      context: youtubeSearchContext,
      onClose: closeYoutubeSearchModal,
      youtubeSearchQuery,
      setYoutubeSearchQuery,
      onSearch: searchYoutubeResults,
      loading: youtubeSearchLoading,
      error: youtubeSearchError,
      results: youtubeSearchResults,
      youtubeSearchQuality,
      setYoutubeSearchQuality,
      downloadYoutubeResult
    },
    deleteArtistModalProps: {
      modal: deleteArtistModal,
      onClose: closeDeleteArtistModal,
      onConfirm: confirmDeleteArtistModal
    },
    importArtistModalProps: {
      artist: pendingImportArtist,
      onClose: () => setPendingImportArtist(null),
      importMode,
      setImportMode,
      importQuality,
      setImportQuality,
      importAutoDownload,
      setImportAutoDownload,
      isImportingArtist,
      onImport: importArtist
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StorageBrowserModal
        open={storageBrowserVisible}
        currentPath={storageBrowserPath}
        parentPath={storageBrowserParent}
        entries={storageBrowserEntries}
        loading={storageBrowserLoading}
        error={storageBrowserError}
        onClose={() => setStorageBrowserVisible(false)}
        onNavigate={loadStorageBrowser}
        onUseThisFolder={applyStorageSelection}
      />
      <LoadingScreen show={rawShowLoading} />
      {setupStatus === "error" && (
        <SetupErrorScreen setupError={setupError} onRetry={loadSetupStatus} />
      )}
      {showSetup && (
        <InitialSetupScreen
          setupMediaRoot={setupMediaRoot}
          setSetupMediaRoot={setSetupMediaRoot}
          setupDomain={setupDomain}
          setSetupDomain={setSetupDomain}
          setupPublicApiBaseUrl={setupPublicApiBaseUrl}
          setSetupPublicApiBaseUrl={setSetupPublicApiBaseUrl}
          setupAdminUsername={setupAdminUsername}
          setSetupAdminUsername={setSetupAdminUsername}
          setupAdminPassword={setupAdminPassword}
          setSetupAdminPassword={setSetupAdminPassword}
          setupAdminPasswordConfirm={setupAdminPasswordConfirm}
          setSetupAdminPasswordConfirm={setSetupAdminPasswordConfirm}
          setupStreamEnabled={setupStreamEnabled}
          setSetupStreamEnabled={setSetupStreamEnabled}
          setupError={setupError}
          setupSaving={setupSaving}
          onBrowseStorage={() => openStorageBrowser("setup")}
          onCompleteSetup={completeSetup}
        />
      )}
      {showLogin && (
        <LoginScreen
          loginUsername={loginUsername}
          setLoginUsername={setLoginUsername}
          loginPassword={loginPassword}
          setLoginPassword={setLoginPassword}
          authError={authError}
          onSubmit={submitLogin}
        />
      )}
      {!showSetup &&
        !showLogin &&
        setupStatus === "complete" &&
        authStatus === "authenticated" && (
        <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar
          visibleTabs={visibleTabs}
          activeTab={activeTab}
          isStreamCreateRoute={isStreamCreateRoute}
          activeStreamsCount={activeStreamsCount}
          activeSettingsTab={activeSettingsTab}
          settingsTabs={settingsTabs}
          artistImportJobs={artistImportJobs}
          tabLabel={tabLabel}
          tabIcon={tabIcon}
          onChangeTab={changeTab}
          onChangeSettingsTab={changeSettingsTab}
          onOpenStreamCreate={() => navigate(streamCreateRoute)}
        />

        <AppMain {...appMainProps} />
      </div>
      )}
    </div>
  );
}
