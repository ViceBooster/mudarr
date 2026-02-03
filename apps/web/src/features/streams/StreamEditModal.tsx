import React from "react";

import { CloseIcon, SearchIcon, ShuffleIcon } from "../../components/icons";

export type StreamEditTab = "artists" | "tracks";

type ArtistBase = { id: number; name: string };
type TrackBase = {
  id: number;
  title: string;
  artist_name: string | null;
  album_title: string | null;
};

type StreamEditModalProps<
  TEncoding extends string,
  TStatus extends string,
  TArtist extends ArtistBase,
  TTrack extends TrackBase
> = {
  editingStreamId: number | null;
  streamLabel: string;
  onClose: () => void;

  editingStreamName: string;
  setEditingStreamName: React.Dispatch<React.SetStateAction<string>>;
  editingStreamIcon: string;
  setEditingStreamIcon: React.Dispatch<React.SetStateAction<string>>;
  editingStreamEncoding: TEncoding;
  setEditingStreamEncoding: React.Dispatch<React.SetStateAction<TEncoding>>;
  editingStreamShuffle: boolean;
  setEditingStreamShuffle: React.Dispatch<React.SetStateAction<boolean>>;
  editingStreamRestartOnSave: boolean;
  setEditingStreamRestartOnSave: React.Dispatch<React.SetStateAction<boolean>>;
  editingStreamPrecacheHls: boolean;
  setEditingStreamPrecacheHls: React.Dispatch<React.SetStateAction<boolean>>;
  editingStreamStatus: TStatus;
  setEditingStreamStatus: React.Dispatch<React.SetStateAction<TStatus>>;

  editingStreamTab: StreamEditTab;
  setEditingStreamTab: React.Dispatch<React.SetStateAction<StreamEditTab>>;

  // Artists tab
  editingStreamArtistQuery: string;
  setEditingStreamArtistQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredEditingStreamArtists: TArtist[];
  editingStreamArtistIds: number[];
  editingStreamArtistLoadingIds: number[];
  toggleEditingStreamArtist: (artist: TArtist) => void | Promise<unknown>;

  // Tracks tab
  editingStreamTrackQuery: string;
  setEditingStreamTrackQuery: React.Dispatch<React.SetStateAction<string>>;
  editingStreamTrackLoading: boolean;
  editingStreamTrackResults: TTrack[];
  addEditingStreamTrack: (track: TTrack) => void;
  editingStreamTracks: TTrack[];
  editingStreamSelectedIds: number[];
  handleEditingStreamTrackSelect: (
    event: React.MouseEvent<HTMLLIElement>,
    index: number,
    trackId: number
  ) => void;
  shuffleEditingStreamTracks: () => void;
  moveEditingStreamTrack: (index: number, direction: number, trackId: number) => void;
  moveEditingStreamTracksToEdge: (
    index: number,
    edge: "top" | "bottom",
    trackId: number
  ) => void;
  removeEditingStreamTrack: (trackId: number) => void;

  // Footer
  rescanEditingStream: () => void | Promise<unknown>;
  isRescanningArtists: boolean;
  saveStreamEdits: () => void | Promise<unknown>;
};

export function StreamEditModal<
  TEncoding extends string,
  TStatus extends string,
  TArtist extends ArtistBase,
  TTrack extends TrackBase
>({
  editingStreamId,
  streamLabel,
  onClose,
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
  isRescanningArtists,
  saveStreamEdits
}: StreamEditModalProps<TEncoding, TStatus, TArtist, TTrack>) {
  if (!editingStreamId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl max-h-[85vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Edit stream</div>
            <div className="text-xs text-slate-500">{streamLabel}</div>
          </div>
          <button
            onClick={onClose}
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
              onChange={(event) => setEditingStreamEncoding(event.currentTarget.value as TEncoding)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value={"original" as TEncoding}>Encoding: original (direct)</option>
              <option value={"copy" as TEncoding}>Encoding: copy (remux)</option>
              <option value={"transcode" as TEncoding}>Encoding: transcode</option>
              <option value={"web" as TEncoding}>Encoding: web-friendly</option>
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
              onChange={(event) => setEditingStreamStatus(event.currentTarget.value as TStatus)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value={"active" as TStatus}>Status: active</option>
              <option value={"stopped" as TStatus}>Status: stopped</option>
            </select>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={editingStreamPrecacheHls}
              onChange={(event) => setEditingStreamPrecacheHls(event.currentTarget.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="space-y-0.5">
              <span className="block font-semibold">Pre-encode for HLS Cached</span>
              <span className="block text-[10px] text-slate-500">
                Rebuilds the cached HLS segments for this stream after save/rescan (more reliable than live concat).
              </span>
            </span>
          </label>
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
                            isSelected ? "border-indigo-200 bg-indigo-50/40" : "border-slate-100"
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
                              disabled={!isSelected && index === editingStreamTracks.length - 1}
                              title="Move down"
                              aria-label="Move down"
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => moveEditingStreamTracksToEdge(index, "top", track.id)}
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
          <p className="text-xs text-slate-500">Changes apply immediately to the stream playlist.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void rescanEditingStream()}
              disabled={editingStreamArtistIds.length === 0 || isRescanningArtists}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SearchIcon />
              {isRescanningArtists ? "Rescanning..." : "Rescan artists"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void saveStreamEdits()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

