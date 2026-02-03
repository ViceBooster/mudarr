import React from "react";

import type {
  DownloadSettings,
  PlexStatus,
  SearchSettings,
  UpdateStatus,
  YoutubeOutputFormat
} from "../../app/types";
import type { SettingsTabId } from "../../app/routes";
import { ApiKeysTab } from "./tabs/ApiKeysTab";
import { DownloadsTab } from "./tabs/DownloadsTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { PlexTab } from "./tabs/PlexTab";
import { SearchTab } from "./tabs/SearchTab";
import { StreamingOptionsTab } from "./tabs/StreamingOptionsTab";
import { UpdatesTab } from "./tabs/UpdatesTab";
import { YoutubeTab } from "./tabs/YoutubeTab";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SettingsTab = { id: SettingsTabId; label: string };

type SettingsPageProps = {
  apiBaseUrl: string;
  settingsTabs: readonly SettingsTab[];
  activeSettingsTab: SettingsTabId;
  changeSettingsTab: (tab: SettingsTabId) => void;

  showSettingsNotice: boolean;
  dismissSettingsNotice: () => void;

  // General tab
  generalMediaRoot: string;
  setGeneralMediaRoot: React.Dispatch<React.SetStateAction<string>>;
  generalDomain: string;
  setGeneralDomain: React.Dispatch<React.SetStateAction<string>>;
  generalPublicApiBaseUrl: string;
  setGeneralPublicApiBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  generalSaveStatus: SaveStatus;
  saveGeneralSettings: () => void | Promise<unknown>;
  openStorageBrowser: () => void;

  adminUsername: string;
  setAdminUsername: React.Dispatch<React.SetStateAction<string>>;
  adminPassword: string;
  setAdminPassword: React.Dispatch<React.SetStateAction<string>>;
  adminPasswordConfirm: string;
  setAdminPasswordConfirm: React.Dispatch<React.SetStateAction<string>>;
  adminSaveStatus: SaveStatus;
  saveAdminSettings: () => void | Promise<unknown>;

  // API keys tab
  audiodbApiKey: string;
  setAudiodbApiKey: React.Dispatch<React.SetStateAction<string>>;
  showAudiodbKey: boolean;
  setShowAudiodbKey: React.Dispatch<React.SetStateAction<boolean>>;
  lastfmApiKey: string;
  setLastfmApiKey: React.Dispatch<React.SetStateAction<string>>;
  showLastfmKey: boolean;
  setShowLastfmKey: React.Dispatch<React.SetStateAction<boolean>>;
  integrationsStatus: {
    audiodbConfigured: boolean;
    audiodbApiKey?: string | null;
    lastfmConfigured: boolean;
    lastfmApiKey?: string | null;
  } | null;
  integrationsSaveStatus: SaveStatus;
  saveIntegrationSettings: () => void | Promise<unknown>;

  // Streaming options tab
  streamEnabled: boolean;
  setStreamEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  streamToken: string;
  setStreamToken: React.Dispatch<React.SetStateAction<string>>;
  streamTokenStatus: SaveStatus;
  saveStreamToken: () => void | Promise<unknown>;
  regenerateStreamToken: () => void | Promise<unknown>;

  // Downloads tab
  downloadConcurrency: number;
  setDownloadConcurrency: React.Dispatch<React.SetStateAction<number>>;
  saveDownloadSettings: () => void | Promise<unknown>;
  downloadSaveStatus: SaveStatus;
  downloadSettings: DownloadSettings | null;

  // Search tab
  skipNonOfficialMusicVideos: boolean;
  setSkipNonOfficialMusicVideos: React.Dispatch<React.SetStateAction<boolean>>;
  saveSearchSettings: () => void | Promise<unknown>;
  searchSaveStatus: SaveStatus;
  searchSettings: SearchSettings | null;

  // YouTube tab
  youtubeOutputFormat: YoutubeOutputFormat;
  setYoutubeOutputFormat: React.Dispatch<React.SetStateAction<YoutubeOutputFormat>>;
  youtubeCookiesPath: string;
  setYoutubeCookiesPath: React.Dispatch<React.SetStateAction<string>>;
  youtubeCookiesBrowser: string;
  setYoutubeCookiesBrowser: React.Dispatch<React.SetStateAction<string>>;
  youtubeCookiesHeader: string;
  setYoutubeCookiesHeader: React.Dispatch<React.SetStateAction<string>>;
  saveYoutubeSettings: () => void | Promise<unknown>;
  youtubeSaveStatus: SaveStatus;
  youtubeStatus: { cookiesPath?: string | null; cookiesFromBrowser?: string | null; cookiesHeader?: string | null; outputFormat?: string | null } | null;

  // Updates tab
  updateStatus: UpdateStatus | null;
  updateCheckStatus: "idle" | "loading" | "error";
  updateCheckError: string | null;
  checkForUpdates: (force: boolean) => void | Promise<unknown>;

  // Plex tab
  plexStatus: PlexStatus | null;
  plexBaseUrl: string;
  setPlexBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  plexToken: string;
  setPlexToken: React.Dispatch<React.SetStateAction<string>>;
  plexSectionId: string;
  setPlexSectionId: React.Dispatch<React.SetStateAction<string>>;
  savePlexSettings: () => void | Promise<unknown>;
  refreshPlex: () => void | Promise<unknown>;
  scanPlex: () => void | Promise<unknown>;
};

export const SettingsPage = ({
  apiBaseUrl,
  settingsTabs,
  activeSettingsTab,
  changeSettingsTab,
  showSettingsNotice,
  dismissSettingsNotice,
  generalMediaRoot,
  setGeneralMediaRoot,
  generalDomain,
  setGeneralDomain,
  generalPublicApiBaseUrl,
  setGeneralPublicApiBaseUrl,
  generalSaveStatus,
  saveGeneralSettings,
  openStorageBrowser,
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
}: SettingsPageProps) => (
  <section className="space-y-4">
    <h2 className="text-lg font-semibold">Settings</h2>
    {showSettingsNotice && (
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">
              Configure API keys here or in `.env`. Settings values override env on this server.
            </p>
            <p className="mt-2 text-xs text-slate-500">API base: {apiBaseUrl}</p>
          </div>
          <button
            type="button"
            onClick={dismissSettingsNotice}
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
      <GeneralTab
        generalMediaRoot={generalMediaRoot}
        setGeneralMediaRoot={setGeneralMediaRoot}
        generalDomain={generalDomain}
        setGeneralDomain={setGeneralDomain}
        generalPublicApiBaseUrl={generalPublicApiBaseUrl}
        setGeneralPublicApiBaseUrl={setGeneralPublicApiBaseUrl}
        generalSaveStatus={generalSaveStatus}
        saveGeneralSettings={saveGeneralSettings}
        onBrowseStorage={openStorageBrowser}
        adminUsername={adminUsername}
        setAdminUsername={setAdminUsername}
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        adminPasswordConfirm={adminPasswordConfirm}
        setAdminPasswordConfirm={setAdminPasswordConfirm}
        adminSaveStatus={adminSaveStatus}
        saveAdminSettings={saveAdminSettings}
      />
    )}

    {activeSettingsTab === "api-keys" && (
      <ApiKeysTab
        audiodbApiKey={audiodbApiKey}
        setAudiodbApiKey={setAudiodbApiKey}
        showAudiodbKey={showAudiodbKey}
        setShowAudiodbKey={setShowAudiodbKey}
        lastfmApiKey={lastfmApiKey}
        setLastfmApiKey={setLastfmApiKey}
        showLastfmKey={showLastfmKey}
        setShowLastfmKey={setShowLastfmKey}
        integrationsStatus={integrationsStatus}
        integrationsSaveStatus={integrationsSaveStatus}
        saveIntegrationSettings={saveIntegrationSettings}
      />
    )}

    {activeSettingsTab === "streaming-options" && (
      <StreamingOptionsTab
        streamEnabled={streamEnabled}
        setStreamEnabled={setStreamEnabled}
        streamToken={streamToken}
        setStreamToken={setStreamToken}
        streamTokenStatus={streamTokenStatus}
        saveStreamToken={saveStreamToken}
        regenerateStreamToken={regenerateStreamToken}
      />
    )}

    {activeSettingsTab === "downloads" && (
      <DownloadsTab
        downloadConcurrency={downloadConcurrency}
        setDownloadConcurrency={setDownloadConcurrency}
        saveDownloadSettings={saveDownloadSettings}
        downloadSaveStatus={downloadSaveStatus}
        downloadSettings={downloadSettings}
      />
    )}

    {activeSettingsTab === "search" && (
      <SearchTab
        skipNonOfficialMusicVideos={skipNonOfficialMusicVideos}
        setSkipNonOfficialMusicVideos={setSkipNonOfficialMusicVideos}
        saveSearchSettings={saveSearchSettings}
        searchSaveStatus={searchSaveStatus}
        searchSettings={searchSettings}
      />
    )}

    {activeSettingsTab === "youtube" && (
      <YoutubeTab
        youtubeOutputFormat={youtubeOutputFormat}
        setYoutubeOutputFormat={setYoutubeOutputFormat}
        youtubeCookiesPath={youtubeCookiesPath}
        setYoutubeCookiesPath={setYoutubeCookiesPath}
        youtubeCookiesBrowser={youtubeCookiesBrowser}
        setYoutubeCookiesBrowser={setYoutubeCookiesBrowser}
        youtubeCookiesHeader={youtubeCookiesHeader}
        setYoutubeCookiesHeader={setYoutubeCookiesHeader}
        saveYoutubeSettings={saveYoutubeSettings}
        youtubeSaveStatus={youtubeSaveStatus}
        youtubeStatus={youtubeStatus}
      />
    )}

    {activeSettingsTab === "updates" && (
      <UpdatesTab
        updateStatus={updateStatus}
        updateCheckStatus={updateCheckStatus}
        updateCheckError={updateCheckError}
        checkForUpdates={checkForUpdates}
      />
    )}

    {activeSettingsTab === "plex" && (
      <PlexTab
        plexStatus={plexStatus}
        plexBaseUrl={plexBaseUrl}
        setPlexBaseUrl={setPlexBaseUrl}
        plexToken={plexToken}
        setPlexToken={setPlexToken}
        plexSectionId={plexSectionId}
        setPlexSectionId={setPlexSectionId}
        savePlexSettings={savePlexSettings}
        refreshPlex={refreshPlex}
        scanPlex={scanPlex}
      />
    )}
  </section>
);

