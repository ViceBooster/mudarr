import React from "react";

import { BookmarkIcon, EditIcon, PlayIcon, SearchIcon, TrashIcon } from "../../components/icons";

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

type ArtistGenre = { id: number; name: string };

type ArtistSummaryBase = {
  id: number;
  name: string;
  image_url?: string | null;
  genres: ArtistGenre[];
  has_downloads?: boolean;
};

type TrackBase = {
  id: number;
  track_no: number | null;
  title: string;
  monitored: boolean;
  downloaded?: boolean;
  download_status?: string | null;
  progress_percent?: number | null;
  download_error?: string | null;
};

type AlbumBase<TTrack extends TrackBase> = {
  id: number;
  title: string;
  year: number | null;
  monitored: boolean;
  tracks: TTrack[];
};

type ArtistDetailBase<TAlbum extends AlbumBase<any>> = {
  artist: {
    id: number;
    name: string;
    image_url?: string | null;
  };
  albums: TAlbum[];
};

type DownloadProgress = {
  percent: number;
  downloaded: number;
  monitored: number;
};

type ArtistsPageProps<
  TArtistSummary extends ArtistSummaryBase,
  TTrack extends TrackBase,
  TAlbum extends AlbumBase<TTrack>,
  TArtistDetail extends ArtistDetailBase<TAlbum>
> = {
  isArtistDetailRoute: boolean;
  artistDetail: TArtistDetail | null;
  monitorNotice: string | null;

  selectedAlbumIds: number[];
  setSelectedAlbumIds: React.Dispatch<React.SetStateAction<number[]>>;
  toggleSelectAllAlbums: () => void;
  toggleAlbumSelection: (albumId: number) => void;
  applyAlbumMonitoring: (monitored: boolean) => void;

  expandedAlbumIds: number[];
  toggleAlbumExpanded: (albumId: number) => void;

  updateAlbumMonitored: (albumId: number, monitored: boolean) => void;
  updateTrackMonitored: (trackId: number, monitored: boolean) => void;

  changeTabToArtists: () => void;

  artistHasDownloads: boolean;
  artistDownloadProgress: DownloadProgress;

  artistSettingsRef: React.RefObject<HTMLDivElement>;
  artistTracksRef: React.RefObject<HTMLDivElement>;
  scrollToArtistSettings: () => void;
  scrollToArtistTracks: () => void;

  playArtistFromDashboard: (artistId: number) => void;
  enqueueArtistFromDashboard: (artistId: number) => void;
  hasActivePlayback: boolean;
  deleteArtist: (artistId: number, artistName: string) => void;

  downloadArtistM3u: () => void;
  resyncArtist: () => void;
  isResyncing: boolean;

  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  importQuality: Quality;
  setImportQuality: (quality: Quality) => void;
  importAutoDownload: boolean;
  setImportAutoDownload: (value: boolean) => void;
  saveArtistPreferences: () => void;

  playAlbum: (album: TAlbum) => void;
  enqueueAlbum: (album: TAlbum) => void;
  downloadAlbumM3u: (albumId: number) => void;

  playTrack: (track: TTrack, album: TAlbum) => void;
  enqueueTrack: (track: TTrack, album: TAlbum) => void;
  remuxTrackMedia: (trackId: number, title: string) => void;
  deleteTrackMedia: (trackId: number) => void;
  queueTrackDownload: (trackId: number, title: string, albumTitle: string, albumId: number) => void;
  openYoutubeSearchModal: (track: TTrack, album: TAlbum) => void;

  filteredArtists: TArtistSummary[];
  openArtistPage: (artistId: number) => void | Promise<void>;
};

export function ArtistsPage<
  TArtistSummary extends ArtistSummaryBase,
  TTrack extends TrackBase,
  TAlbum extends AlbumBase<TTrack>,
  TArtistDetail extends ArtistDetailBase<TAlbum>
>({
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
  changeTabToArtists,
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
  openArtistPage
}: ArtistsPageProps<TArtistSummary, TTrack, TAlbum, TArtistDetail>) {
  return (
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
              <span className="text-xs text-slate-400">{selectedAlbumIds.length} selected</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={changeTabToArtists}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              ← Back to artists
            </button>
            <div className="text-xs text-slate-500">{artistDetail.albums.length} albums</div>
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
                          onClick={() => deleteArtist(artistDetail.artist.id, artistDetail.artist.name)}
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
                      {artistDownloadProgress.downloaded}/{artistDownloadProgress.monitored}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-900">{artistDetail.artist.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {artistDetail.albums.length} albums ·{" "}
                    {artistDetail.albums.reduce((total, album) => total + album.tracks.length, 0)}{" "}
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
                  onClick={() => deleteArtist(artistDetail.artist.id, artistDetail.artist.name)}
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
                  onChange={(event) => setImportMode(event.currentTarget.value as ImportMode)}
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
                  onChange={(event) => setImportQuality(event.currentTarget.value as Quality)}
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
                    onChange={(event) => setImportAutoDownload(event.currentTarget.checked)}
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
                Custom mode enabled. Use the bookmark toggles on albums and tracks to monitor what
                you want downloaded.
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
              const queuedTracks = album.tracks.filter((track) => track.download_status === "queued");
              const totalProgress = downloadingTracks.reduce(
                (total, track) => total + (track.progress_percent ?? 0),
                0
              );
              const averageProgress =
                downloadingTracks.length > 0 ? Math.floor(totalProgress / downloadingTracks.length) : null;
              const albumHasDownload = album.tracks.some((track) => track.downloaded);

              return (
                <div key={album.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{album.title}</div>
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
                        <span className="sr-only">{album.monitored ? "Monitored" : "Unmonitored"}</span>
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
                        <div className="text-xs text-slate-500">{averageProgress}% complete</div>
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
                          track.monitored && isFailed && skipMessage.toLowerCase().startsWith("skipped");
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
                                    queueTrackDownload(track.id, track.title, album.title, album.id)
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
                                onClick={() => updateTrackMonitored(track.id, !track.monitored)}
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
            <div className="py-6 text-center text-sm text-slate-500">No artists yet.</div>
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
                    <div className="text-sm font-semibold text-slate-900">{artist.name}</div>
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
  );
}

