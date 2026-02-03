import React from "react";

type ArtistGenre = { id: number; name: string };

export type HeaderLocalArtist = {
  id: number;
  name: string;
  image_url?: string | null;
  genres: ArtistGenre[];
};

export type HeaderExternalArtistBase = {
  id: string;
  name: string;
  thumb?: string | null;
  source?: string | null;
  genre?: string | null;
  style?: string | null;
};

type AppHeaderProps<TExternal extends HeaderExternalArtistBase> = {
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
  onAddExternalArtist: (artist: TExternal) => void;
  versionLabel: string;
  updateAvailable: boolean;
  onOpenUpdates: () => void;
};

export function AppHeader<TExternal extends HeaderExternalArtistBase>({
  searchTerm,
  onSearchTermChange,
  searchPlaceholder,
  showSearchPanel,
  searchLoading,
  localSearchMatches,
  externalSearchResults,
  hasSearchResults,
  searchSourcesLabel,
  getExistingArtistId,
  onViewArtist,
  onAddExternalArtist,
  versionLabel,
  updateAvailable,
  onOpenUpdates
}: AppHeaderProps<TExternal>) {
  return (
  <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
    <div className="flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div className="relative z-40 w-full md:max-w-lg">
        <input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.currentTarget.value)}
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
              <div key={artist.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
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
                  onClick={() => onViewArtist(artist.id)}
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
                const existingArtistId = getExistingArtistId(result.name);
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
                    {existingArtistId !== null ? (
                      <button
                        onClick={() => onViewArtist(existingArtistId)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </button>
                    ) : (
                      <button
                        onClick={() => onAddExternalArtist(result)}
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
          {versionLabel}
        </span>
        {updateAvailable && (
          <button
            onClick={onOpenUpdates}
            className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-200"
          >
            Update available
          </button>
        )}
      </div>
    </div>
  </header>
  );
}

