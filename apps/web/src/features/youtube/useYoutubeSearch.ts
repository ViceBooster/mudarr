import { useCallback, useState } from "react";

import type {
  AlbumDetail,
  ArtistDetail,
  ArtistPreference,
  TrackDetail,
  YoutubeSearchContext,
  YoutubeSearchResult
} from "../../app/types";

type ApiGet = <T>(path: string) => Promise<T>;
type ApiPost = <T = unknown>(path: string, body: unknown) => Promise<T>;

type UseYoutubeSearchArgs = {
  apiGet: ApiGet;
  apiPost: ApiPost;
  artistDetail: ArtistDetail | null;
  importQuality: ArtistPreference["quality"];
  loadAll: () => Promise<void>;
  loadArtistDetail: (artistId: number) => Promise<void>;
  setMonitorNotice: (value: string | null) => void;
};

export function useYoutubeSearch({
  apiGet,
  apiPost,
  artistDetail,
  importQuality,
  loadAll,
  loadArtistDetail,
  setMonitorNotice
}: UseYoutubeSearchArgs) {
  const [youtubeSearchContext, setYoutubeSearchContext] = useState<YoutubeSearchContext | null>(null);
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState("");
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<YoutubeSearchResult[]>([]);
  const [youtubeSearchLoading, setYoutubeSearchLoading] = useState(false);
  const [youtubeSearchError, setYoutubeSearchError] = useState<string | null>(null);
  const [youtubeSearchQuality, setYoutubeSearchQuality] = useState<Record<string, string>>({});

  const closeYoutubeSearchModal = useCallback(() => {
    setYoutubeSearchContext(null);
    setYoutubeSearchResults([]);
    setYoutubeSearchQuality({});
    setYoutubeSearchError(null);
    setYoutubeSearchQuery("");
  }, []);

  const resolveDefaultQuality = useCallback(
    (qualities: string[]) => {
      if (qualities.includes(importQuality)) {
        return importQuality;
      }
      return qualities[0] ?? "";
    },
    [importQuality]
  );

  const searchYoutubeResults = useCallback(
    async (queryOverride?: string) => {
      const query = (queryOverride ?? youtubeSearchQuery).trim();
      if (!query) {
        setYoutubeSearchResults([]);
        setYoutubeSearchLoading(false);
        return;
      }
      setYoutubeSearchResults([]);
      setYoutubeSearchLoading(true);
      setYoutubeSearchError(null);
      try {
        const results = await apiGet<YoutubeSearchResult[]>(
          `/api/youtube/search?query=${encodeURIComponent(query)}`
        );
        setYoutubeSearchResults(results);
        setYoutubeSearchQuality((prev) => {
          const next = { ...prev };
          for (const result of results) {
            if (!next[result.id]) {
              next[result.id] = resolveDefaultQuality(result.qualities);
            }
          }
          return next;
        });
      } catch (err) {
        setYoutubeSearchError(err instanceof Error ? err.message : "Failed to search YouTube");
      } finally {
        setYoutubeSearchLoading(false);
      }
    },
    [apiGet, resolveDefaultQuality, youtubeSearchQuery]
  );

  const openYoutubeSearchModal = useCallback(
    (track: TrackDetail, album: AlbumDetail) => {
      if (!artistDetail) return;
      const query = `${artistDetail.artist.name} - ${track.title}`;
      setYoutubeSearchContext({
        trackId: track.id,
        trackTitle: track.title,
        albumId: album.id,
        albumTitle: album.title,
        artistName: artistDetail.artist.name
      });
      setYoutubeSearchQuery(query);
      setYoutubeSearchResults([]);
      setYoutubeSearchQuality({});
      setYoutubeSearchError(null);
      void searchYoutubeResults(query);
    },
    [artistDetail, searchYoutubeResults]
  );

  const downloadYoutubeResult = useCallback(
    async (result: YoutubeSearchResult) => {
      if (!youtubeSearchContext) return;
      const selectedQuality = youtubeSearchQuality[result.id];
      const query = result.webpageUrl ?? `https://www.youtube.com/watch?v=${result.id}`;
      await apiPost("/api/downloads", {
        query,
        displayTitle: result.title,
        source: "youtube",
        quality: selectedQuality || undefined,
        artistName: youtubeSearchContext.artistName,
        albumTitle: youtubeSearchContext.albumTitle,
        trackId: youtubeSearchContext.trackId,
        albumId: youtubeSearchContext.albumId
      });
      await loadAll();
      if (artistDetail) {
        await loadArtistDetail(artistDetail.artist.id);
      }
      setMonitorNotice(`Queued download for ${youtubeSearchContext.trackTitle}.`);
      closeYoutubeSearchModal();
    },
    [
      apiPost,
      artistDetail,
      closeYoutubeSearchModal,
      loadAll,
      loadArtistDetail,
      setMonitorNotice,
      youtubeSearchContext,
      youtubeSearchQuality
    ]
  );

  return {
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
  };
}

