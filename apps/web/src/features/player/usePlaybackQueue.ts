import { useCallback, useMemo, useState } from "react";

import type { AlbumDetail, ArtistDetail, PlaybackItem, TrackDetail } from "../../app/types";

type ApiGet = <T>(path: string, options?: RequestInit) => Promise<T>;

type Args = {
  apiGet: ApiGet;
  setError: (message: string | null) => void;
};

export function usePlaybackQueue({ apiGet, setError }: Args) {
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackItem[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  const [draggedPlaylistIndex, setDraggedPlaylistIndex] = useState<number | null>(null);

  const currentPlayback = useMemo(() => {
    return playbackQueue[playbackIndex] ?? null;
  }, [playbackQueue, playbackIndex]);

  const hasActivePlayback = playbackQueue.length > 0;

  const buildQueueFromAlbum = useCallback((album?: AlbumDetail | null) => {
    if (!album) {
      return [];
    }
    return album.tracks
      .filter((track) => track.downloaded)
      .map((track) => ({
        trackId: track.id,
        title: track.title,
        albumTitle: album.title
      }));
  }, []);

  const stopPlayback = useCallback(() => {
    setPlaybackQueue([]);
    setPlaybackIndex(0);
    setShuffleHistory([]);
  }, []);

  const enqueueItems = useCallback(
    (items: PlaybackItem[]) => {
      if (items.length === 0) {
        setError("No downloaded tracks available to queue.");
        return;
      }
      setPlaybackQueue((prev) => {
        const existing = new Set(prev.map((item) => item.trackId));
        const toAdd = items.filter((item) => !existing.has(item.trackId));
        if (prev.length === 0) {
          setPlaybackIndex(0);
          setShuffleHistory([]);
          return toAdd;
        }
        return [...prev, ...toAdd];
      });
    },
    [setError]
  );

  const playTrack = useCallback(
    (track: TrackDetail, album?: AlbumDetail | null) => {
      const queue = buildQueueFromAlbum(album);
      if (queue.length > 0) {
        const index = queue.findIndex((item) => item.trackId === track.id);
        setPlaybackQueue(queue);
        setPlaybackIndex(index >= 0 ? index : 0);
        setShuffleHistory([]);
        return;
      }
      setPlaybackQueue([
        {
          trackId: track.id,
          title: track.title,
          albumTitle: album?.title ?? null
        }
      ]);
      setPlaybackIndex(0);
      setShuffleHistory([]);
    },
    [buildQueueFromAlbum]
  );

  const playAlbum = useCallback(
    (album: AlbumDetail) => {
      const queue = buildQueueFromAlbum(album);
      if (queue.length === 0) {
        setError("No downloaded tracks available to play.");
        return;
      }
      setPlaybackQueue(queue);
      setPlaybackIndex(0);
      setShuffleHistory([]);
    },
    [buildQueueFromAlbum, setError]
  );

  const enqueueTrack = useCallback(
    (track: TrackDetail, album?: AlbumDetail | null) => {
      if (!track.downloaded) {
        setError("Track has not been downloaded yet.");
        return;
      }
      enqueueItems([
        {
          trackId: track.id,
          title: track.title,
          albumTitle: album?.title ?? null
        }
      ]);
    },
    [enqueueItems, setError]
  );

  const enqueueAlbum = useCallback(
    (album: AlbumDetail) => {
      const queue = buildQueueFromAlbum(album);
      enqueueItems(queue);
    },
    [buildQueueFromAlbum, enqueueItems]
  );

  const buildArtistQueue = useCallback(
    async (artistId: number) => {
      const detail = await apiGet<ArtistDetail>(`/api/artists/${artistId}`);
      return detail.albums.flatMap((album) =>
        album.tracks
          .filter((track) => track.downloaded)
          .map((track) => ({
            trackId: track.id,
            title: track.title,
            albumTitle: album.title
          }))
      );
    },
    [apiGet]
  );

  const playArtistFromDashboard = useCallback(
    async (artistId: number) => {
      setError(null);
      try {
        const queue = await buildArtistQueue(artistId);
        if (queue.length === 0) {
          setError("No downloaded tracks available for this artist.");
          return;
        }
        setPlaybackQueue(queue);
        setPlaybackIndex(0);
        setShuffleHistory([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artist for playback");
      }
    },
    [buildArtistQueue, setError]
  );

  const enqueueArtistFromDashboard = useCallback(
    async (artistId: number) => {
      setError(null);
      try {
        const queue = await buildArtistQueue(artistId);
        if (queue.length === 0) {
          setError("No downloaded tracks available for this artist.");
          return;
        }
        enqueueItems(queue);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artist for queue");
      }
    },
    [buildArtistQueue, enqueueItems, setError]
  );

  const playNext = useCallback(() => {
    if (playbackQueue.length === 0) return;
    if (shuffleEnabled && playbackQueue.length > 1) {
      const nextIndex = Math.floor(Math.random() * playbackQueue.length);
      setShuffleHistory((prev) => [...prev, playbackIndex]);
      setPlaybackIndex(nextIndex);
      return;
    }
    setPlaybackIndex((prev) => (prev + 1 >= playbackQueue.length ? 0 : prev + 1));
  }, [playbackQueue.length, shuffleEnabled, playbackIndex]);

  const playPrev = useCallback(() => {
    if (playbackQueue.length === 0) return;
    if (shuffleEnabled && shuffleHistory.length > 0) {
      const lastIndex = shuffleHistory[shuffleHistory.length - 1];
      setShuffleHistory((prev) => prev.slice(0, -1));
      setPlaybackIndex(lastIndex);
      return;
    }
    setPlaybackIndex((prev) => (prev - 1 < 0 ? playbackQueue.length - 1 : prev - 1));
  }, [playbackQueue.length, shuffleEnabled, shuffleHistory]);

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((prev) => !prev);
    setShuffleHistory([]);
  }, []);

  const reorderPlaybackQueue = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }
    setPlaybackQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setPlaybackIndex((prev) => {
      if (prev === fromIndex) {
        return toIndex;
      }
      if (fromIndex < prev && prev <= toIndex) {
        return prev - 1;
      }
      if (toIndex <= prev && prev < fromIndex) {
        return prev + 1;
      }
      return prev;
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setPlaybackQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setPlaybackIndex((prev) => {
      if (index < prev) {
        return prev - 1;
      }
      if (index === prev) {
        return Math.max(0, prev - 1);
      }
      return prev;
    });
  }, []);

  const removeTrackFromQueue = useCallback(
    (trackId: number) => {
      if (currentPlayback?.trackId === trackId) {
        stopPlayback();
        return;
      }
      const nextQueue = playbackQueue.filter((item) => item.trackId !== trackId);
      setPlaybackQueue(nextQueue);
      if (nextQueue.length === 0) {
        setPlaybackIndex(0);
      } else if (playbackIndex >= nextQueue.length) {
        setPlaybackIndex(nextQueue.length - 1);
      }
    },
    [currentPlayback?.trackId, playbackIndex, playbackQueue, stopPlayback]
  );

  return {
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
  };
}

