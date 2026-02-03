import React from "react";

import { Sparkline } from "../../components/charts/Sparkline";
import { CheckIcon, EditIcon, ListIcon, PlayIcon, SearchIcon, TrashIcon } from "../../components/icons";
import { formatBandwidth, formatBytes } from "../../utils/format";
import { buildDownloadProgress } from "../../utils/progress";

export type ImportMode = "discography" | "new" | "custom";
export type Quality =
  | "144p"
  | "240p"
  | "360p"
  | "480p"
  | "720p"
  | "1080p"
  | "1440p"
  | "2160p"
  | "4320p";

type DashboardStats = {
  mediaBytes: number;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  mediaFiles: number;
  missingFiles: number;
  artists: number;
  activeConnections: number;
  bandwidthBps: number;
};

type StreamingSample = {
  activeConnections?: number | null;
  bandwidthBps?: number | null;
};

type DashboardArtist = {
  id: number;
  name: string;
  image_url?: string | null;
  created_at: string;
  has_downloads?: boolean;
  monitored_count?: number | null;
  downloaded_count?: number | null;
};

type DashboardPageProps = {
  streamsEnabled: boolean;
  dashboardStats: DashboardStats | null;
  artistsCount: number;
  latestStreamingSample: StreamingSample | null;
  activeConnectionsSeries: number[];
  bandwidthSeries: number[];

  artistSortKey: "name" | "created_at";
  artistSortDirection: "asc" | "desc";
  toggleArtistSort: (key: "name" | "created_at") => void;

  dashboardView: "posters" | "list";
  setDashboardView: (view: "posters" | "list") => void;
  dashboardSelectMode: boolean;
  toggleDashboardSelectMode: () => void;

  selectedArtistIds: number[];
  clearArtistSelection: () => void;

  bulkImportMode: ImportMode;
  setBulkImportMode: (mode: ImportMode) => void;
  bulkQuality: Quality;
  setBulkQuality: (quality: Quality) => void;
  bulkAutoDownload: boolean;
  setBulkAutoDownload: (value: boolean) => void;
  applyBulkPreferences: () => void;
  deleteSelectedArtists: () => void;

  dashboardArtists: DashboardArtist[];
  toggleSelectAllArtists: () => void;
  toggleArtistSelection: (artistId: number) => void;

  openArtistPage: (artistId: number) => void | Promise<void>;
  playArtistFromDashboard: (artistId: number) => void;
  enqueueArtistFromDashboard: (artistId: number) => void;
  hasActivePlayback: boolean;
  deleteArtist: (artistId: number, artistName: string) => void;
};

export const DashboardPage = ({
  streamsEnabled,
  dashboardStats,
  artistsCount,
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
  openArtistPage,
  playArtistFromDashboard,
  enqueueArtistFromDashboard,
  hasActivePlayback,
  deleteArtist
}: DashboardPageProps) => (
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
                          Math.round((dashboardStats.mediaBytes / dashboardStats.diskTotalBytes) * 100)
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
              {dashboardStats.missingFiles > 0 ? ` · ${dashboardStats.missingFiles} missing` : ""}
            </div>
          </>
        )}
      </div>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="text-xs text-slate-500">Artists saved</div>
        <div className="text-2xl font-semibold text-slate-900">
          {dashboardStats?.artists ?? artistsCount}
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
            <span className="font-semibold">{selectedArtistIds.length} selected</span>
            <button
              onClick={clearArtistSelection}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-100"
            >
              Clear
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkImportMode}
                onChange={(event) => setBulkImportMode(event.currentTarget.value as ImportMode)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1"
              >
                <option value="discography">Monitor all</option>
                <option value="new">Monitor none</option>
                <option value="custom">Custom</option>
              </select>
              <select
                value={bulkQuality}
                onChange={(event) => setBulkQuality(event.currentTarget.value as Quality)}
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
                  onChange={(event) => setBulkAutoDownload(event.currentTarget.checked)}
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
                          dashboardSelectMode ? toggleArtistSelection(artist.id) : openArtistPage(artist.id)
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
                      <div className="h-full bg-emerald-500" style={{ width: `${progress.percent}%` }} />
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                        {progress.downloaded}/{progress.monitored}
                      </div>
                    </div>
                    <div className="px-3 py-3">
                      <div className="text-sm font-semibold text-slate-900">{artist.name}</div>
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
);

