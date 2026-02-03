import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import type { TabId } from "../routes";
import { AppHeader, type HeaderExternalArtistBase, type HeaderLocalArtist } from "./AppHeader";
import { DashboardRoute } from "../../features/dashboard/DashboardRoute";
import { ArtistsRoute } from "../../features/artists/ArtistsRoute";
import { DownloadsRoute } from "../../features/downloads/DownloadsRoute";
import { ListsPage } from "../../features/lists/ListsPage";
import { LogsPage } from "../../features/logs/LogsPage";
import { StreamsPage } from "../../features/streams/StreamsPage";
import { SettingsRoute } from "../../features/settings/SettingsRoute";
import { NowPlayingWidget } from "../../features/player/NowPlayingWidget";
import { YoutubeOptionsModal } from "../../features/youtube/YoutubeOptionsModal";
import { DeleteArtistModal } from "../../features/artists/DeleteArtistModal";
import { ImportArtistModal } from "../../features/artists/ImportArtistModal";

type BivariantHandler<T> = { bivarianceHack(value: T): void | Promise<unknown> }["bivarianceHack"];

type AppMainHeaderProps<TExternal extends HeaderExternalArtistBase> = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder: string;
  showSearchPanel: boolean;
  searchLoading: boolean;
  localSearchMatches: readonly HeaderLocalArtist[];
  externalSearchResults: readonly TExternal[];
  hasSearchResults: boolean;
  searchSourcesLabel: string;
  getExistingArtistId: (name: string) => number | null;
  onViewArtist: (artistId: number) => void;
  onAddExternalArtist: BivariantHandler<TExternal>;
  versionLabel: string;
  updateAvailable: boolean;
  onOpenUpdates: () => void;
};

type ArtistsPageProps = React.ComponentProps<typeof ArtistsRoute>["artistsPageProps"];
type YoutubeOptionsModalProps = React.ComponentProps<typeof YoutubeOptionsModal>;
type ImportArtistModalProps = React.ComponentProps<typeof ImportArtistModal>;

export type AppMainProps<TExternal extends HeaderExternalArtistBase> = {
  header: AppMainHeaderProps<TExternal>;
  activeTab: TabId;
  streamsEnabled: boolean;
  error: string | null;

  dashboardRouteProps: Omit<React.ComponentProps<typeof DashboardRoute>, "dashboardPageProps">;
  dashboardPageProps: React.ComponentProps<typeof DashboardRoute>["dashboardPageProps"];
  artistsRouteProps: Omit<React.ComponentProps<typeof ArtistsRoute>, "artistsPageProps">;
  artistsPageProps: ArtistsPageProps;
  downloadsRouteProps: Omit<React.ComponentProps<typeof DownloadsRoute>, "downloadsPageProps">;
  downloadsPageProps: React.ComponentProps<typeof DownloadsRoute>["downloadsPageProps"];
  listsPageProps: React.ComponentProps<typeof ListsPage>;
  streamsPageProps: React.ComponentProps<typeof StreamsPage>;
  logsPageProps: React.ComponentProps<typeof LogsPage>;
  settingsRouteProps: Omit<React.ComponentProps<typeof SettingsRoute>, "settingsPageProps">;
  settingsPageProps: React.ComponentProps<typeof SettingsRoute>["settingsPageProps"];

  nowPlayingWidgetProps: React.ComponentProps<typeof NowPlayingWidget>;
  youtubeOptionsModalProps: YoutubeOptionsModalProps;
  deleteArtistModalProps: React.ComponentProps<typeof DeleteArtistModal>;
  importArtistModalProps: ImportArtistModalProps;
};

export function AppMain<TExternal extends HeaderExternalArtistBase>({
  header,
  activeTab,
  streamsEnabled,
  error,
  dashboardRouteProps,
  dashboardPageProps,
  artistsRouteProps,
  artistsPageProps,
  downloadsRouteProps,
  downloadsPageProps,
  listsPageProps,
  streamsPageProps,
  logsPageProps,
  settingsRouteProps,
  settingsPageProps,
  nowPlayingWidgetProps,
  youtubeOptionsModalProps,
  deleteArtistModalProps,
  importArtistModalProps
}: AppMainProps<TExternal>) {
  return (
    <main className="flex-1">
      <AppHeader<TExternal>
        searchTerm={header.searchTerm}
        onSearchTermChange={header.onSearchTermChange}
        searchPlaceholder={header.searchPlaceholder}
        showSearchPanel={header.showSearchPanel}
        searchLoading={header.searchLoading}
        localSearchMatches={header.localSearchMatches}
        externalSearchResults={header.externalSearchResults}
        hasSearchResults={header.hasSearchResults}
        searchSourcesLabel={header.searchSourcesLabel}
        getExistingArtistId={header.getExistingArtistId}
        onViewArtist={header.onViewArtist}
        onAddExternalArtist={header.onAddExternalArtist}
        versionLabel={header.versionLabel}
        updateAvailable={header.updateAvailable}
        onOpenUpdates={header.onOpenUpdates}
      />

      <div className="px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg bg-rose-100 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={<DashboardRoute {...dashboardRouteProps} dashboardPageProps={dashboardPageProps} />}
          />
          <Route
            path="/artists"
            element={<ArtistsRoute {...artistsRouteProps} artistsPageProps={artistsPageProps} />}
          />
          <Route
            path="/artists/:artistId"
            element={<ArtistsRoute {...artistsRouteProps} artistsPageProps={artistsPageProps} />}
          />
          <Route
            path="/downloads"
            element={<DownloadsRoute {...downloadsRouteProps} downloadsPageProps={downloadsPageProps} />}
          />
          <Route path="/lists" element={<ListsPage {...listsPageProps} />} />
          <Route
            path="/streams"
            element={
              streamsEnabled ? <StreamsPage {...streamsPageProps} /> : <Navigate to="/dashboard" replace />
            }
          />
          <Route
            path="/streams/create"
            element={
              streamsEnabled ? <StreamsPage {...streamsPageProps} /> : <Navigate to="/dashboard" replace />
            }
          />
          <Route path="/logs" element={<LogsPage {...logsPageProps} />} />
          <Route
            path="/settings"
            element={<SettingsRoute {...settingsRouteProps} settingsPageProps={settingsPageProps} />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>

      <NowPlayingWidget {...nowPlayingWidgetProps} />
      <YoutubeOptionsModal {...youtubeOptionsModalProps} />
      <DeleteArtistModal {...deleteArtistModalProps} />
      <ImportArtistModal {...importArtistModalProps} />
    </main>
  );
}

