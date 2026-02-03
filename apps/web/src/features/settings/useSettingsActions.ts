import { useEffect, useRef } from "react";

import type {
  AdminSettings,
  DownloadSettings,
  GeneralSettings,
  IntegrationSettings,
  SearchSettings,
  StreamSettings,
  YoutubeOutputFormat,
  YoutubeSettings
} from "../../app/types";

type ApiPut = <T>(path: string, body: unknown) => Promise<T>;
type ApiPost = <T>(path: string, body: unknown) => Promise<T>;

type Args = {
  apiPut: ApiPut;
  apiPost: ApiPost;
  setError: (message: string | null) => void;

  // General
  generalMediaRoot: string;
  generalDomain: string;
  generalPublicApiBaseUrl: string;
  setGeneralMediaRoot: (value: string) => void;
  setGeneralDomain: (value: string) => void;
  setGeneralPublicApiBaseUrl: (value: string) => void;
  setGeneralSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;

  // Admin
  adminUsername: string;
  currentAdminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  setAdminUsername: (value: string) => void;
  setCurrentAdminUsername: (value: string) => void;
  setAdminPassword: (value: string) => void;
  setAdminPasswordConfirm: (value: string) => void;
  setAdminSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;
  setAuthToken: (token: string | null) => void;

  // Integrations
  audiodbApiKey: string;
  lastfmApiKey: string;
  setIntegrationsStatus: (value: IntegrationSettings | null) => void;
  setAudiodbApiKey: (value: string) => void;
  setLastfmApiKey: (value: string) => void;
  setIntegrationsSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;
  reloadLastfmTags: () => void | Promise<unknown>;

  // Streams
  streamToken: string;
  streamEnabled: boolean;
  setStreamSettings: (value: StreamSettings | null) => void;
  setStreamToken: (value: string) => void;
  setStreamEnabled: (value: boolean) => void;
  setStreamTokenStatus: (status: "idle" | "saving" | "saved" | "error") => void;

  // Downloads
  downloadConcurrency: number;
  setDownloadSettings: (value: DownloadSettings | null) => void;
  setDownloadConcurrency: (value: number) => void;
  setDownloadSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;

  // Search
  skipNonOfficialMusicVideos: boolean;
  setSearchSettings: (value: SearchSettings | null) => void;
  setSkipNonOfficialMusicVideos: (value: boolean) => void;
  setSearchSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;

  // YouTube
  youtubeCookiesPath: string;
  youtubeCookiesBrowser: string;
  youtubeCookiesHeader: string;
  youtubeOutputFormat: YoutubeOutputFormat;
  setYoutubeStatus: (value: YoutubeSettings | null) => void;
  setYoutubeCookiesHeader: (value: string) => void;
  setYoutubeSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;
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

export function useSettingsActions({
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
  reloadLastfmTags,
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
}: Args) {
  const generalSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const integrationsSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const youtubeSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamTokenSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (searchSaveTimeout.current) {
        clearTimeout(searchSaveTimeout.current);
      }
    };
  }, []);

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
      await reloadLastfmTags();
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

  return {
    saveGeneralSettings,
    saveAdminSettings,
    saveIntegrationSettings,
    saveStreamToken,
    regenerateStreamToken,
    saveDownloadSettings,
    saveSearchSettings,
    saveYoutubeSettings
  };
}

