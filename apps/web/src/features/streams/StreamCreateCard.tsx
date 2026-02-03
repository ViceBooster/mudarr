import React from "react";

export type StreamSource = "manual" | "artists" | "genres";

type StreamTrack = {
  id: number;
  title: string;
  artist_name: string | null;
  album_title: string | null;
};

type PickItem = { id: number; name: string };

type StreamCreateCardProps<TEncoding extends string, TTrack extends StreamTrack> = {
  streamName: string;
  setStreamName: React.Dispatch<React.SetStateAction<string>>;
  streamIcon: string;
  setStreamIcon: React.Dispatch<React.SetStateAction<string>>;

  streamEncoding: TEncoding;
  setStreamEncoding: React.Dispatch<React.SetStateAction<TEncoding>>;
  streamShuffle: boolean;
  setStreamShuffle: React.Dispatch<React.SetStateAction<boolean>>;

  streamSource: StreamSource;
  setStreamSource: React.Dispatch<React.SetStateAction<StreamSource>>;

  streamTrackQuery: string;
  setStreamTrackQuery: React.Dispatch<React.SetStateAction<string>>;
  streamTrackLoading: boolean;
  streamTrackResults: TTrack[];
  addStreamTrack: (track: TTrack) => void;

  selectedStreamTracks: TTrack[];
  moveStreamTrack: (index: number, direction: number) => void;
  removeStreamTrack: (trackId: number) => void;

  streamArtistQuery: string;
  setStreamArtistQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredStreamArtists: PickItem[];
  streamArtistIds: number[];
  toggleStreamArtist: (artistId: number) => void;

  streamGenreQuery: string;
  setStreamGenreQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredStreamGenres: PickItem[];
  streamGenreIds: number[];
  toggleStreamGenre: (genreId: number) => void;

  isCreatingStream: boolean;
  createStream: () => void;
};

export function StreamCreateCard<TEncoding extends string, TTrack extends StreamTrack>({
  streamName,
  setStreamName,
  streamIcon,
  setStreamIcon,
  streamEncoding,
  setStreamEncoding,
  streamShuffle,
  setStreamShuffle,
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
  createStream
}: StreamCreateCardProps<TEncoding, TTrack>) {
  return (
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
            onChange={(event) => setStreamEncoding(event.currentTarget.value as TEncoding)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value={"original" as TEncoding}>Encoding: original (direct)</option>
            <option value={"copy" as TEncoding}>Encoding: copy (remux, lighter weight)</option>
            <option value={"transcode" as TEncoding}>Encoding: transcode (re-encode)</option>
            <option value={"web" as TEncoding}>Encoding: web-friendly</option>
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
              {streamTrackLoading && <div className="text-xs text-slate-500">Searching...</div>}
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
              {streamTrackQuery.trim() && !streamTrackLoading && streamTrackResults.length === 0 && (
                <div className="text-xs text-slate-500">No matches found.</div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Selected tracks ({selectedStreamTracks.length})
              </div>
              {selectedStreamTracks.length === 0 ? (
                <div className="mt-2 text-sm text-slate-500">No tracks selected yet.</div>
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
            <div className="text-xs text-slate-500">Selected artists: {streamArtistIds.length}</div>
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
            <div className="text-xs text-slate-500">Selected genres: {streamGenreIds.length}</div>
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
  );
}

