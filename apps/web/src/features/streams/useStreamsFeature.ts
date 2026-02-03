import React, { useEffect, useMemo, useRef, useState } from "react";

import type { TabId } from "../../app/routes";
import type {
  Artist,
  ArtistDetail,
  ArtistPreference,
  Genre,
  StreamEncoding,
  StreamHlsPrecacheStatus,
  StreamSettings,
  StreamStatus,
  StreamSummary,
  StreamTrackOption
} from "../../app/types";
import { matchesArtistQuery } from "../../utils/text";
import { isSameTrackOrder, shuffleTracksForEdit } from "./utils";
import { useStreamHlsPlayback } from "./useStreamHlsPlayback";

type ApiGet = <T>(path: string, options?: RequestInit) => Promise<T>;
type ApiPost = <T>(path: string, body: unknown) => Promise<T>;
type ApiPut = <T>(path: string, body: unknown) => Promise<T>;
type ApiPatch = <T>(path: string, body: unknown) => Promise<T>;
type ApiDelete = (path: string) => Promise<void>;

type StreamOnlineFilter = "all" | "online" | "offline";
type StreamSort = "name-asc" | "name-desc" | "uptime-desc" | "uptime-asc";
type StreamSource = "manual" | "artists" | "genres";

type Args = {
  canUseApi: boolean;
  streamsEnabled: boolean;
  activeTab: TabId;
  isStreamCreateRoute: boolean;
  pathname: string;
  navigate: (path: string) => void;

  apiBaseUrl: string;
  generalDomain: string;
  generalPublicApiBaseUrl: string;
  streamSettings: StreamSettings | null;
  streamToken: string;

  apiGet: ApiGet;
  apiPost: ApiPost;
  apiPut: ApiPut;
  apiPatch: ApiPatch;
  apiDelete: ApiDelete;

  artists: Artist[];
  genres: Genre[];

  setError: (message: string | null) => void;
};

export function useStreamsFeature({
  canUseApi,
  streamsEnabled,
  activeTab,
  isStreamCreateRoute,
  pathname,
  navigate,
  apiBaseUrl,
  generalDomain,
  generalPublicApiBaseUrl,
  streamSettings,
  streamToken,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  artists,
  genres,
  setError
}: Args) {
  const [streams, setStreams] = useState<StreamSummary[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);

  const [streamName, setStreamName] = useState("");
  const [streamIcon, setStreamIcon] = useState("");
  const [streamSearchQuery, setStreamSearchQuery] = useState("");
  const [streamOnlineFilter, setStreamOnlineFilter] = useState<StreamOnlineFilter>("all");
  const [streamSort, setStreamSort] = useState<StreamSort>("name-asc");
  const [streamSource, setStreamSource] = useState<StreamSource>("manual");
  const [streamShuffle, setStreamShuffle] = useState(false);
  const [streamEncoding, setStreamEncoding] = useState<StreamEncoding>("original");
  const [streamPrecacheHls, setStreamPrecacheHls] = useState(true);
  const [streamArtistQuery, setStreamArtistQuery] = useState("");
  const [streamGenreQuery, setStreamGenreQuery] = useState("");
  const [streamArtistIds, setStreamArtistIds] = useState<number[]>([]);
  const [streamGenreIds, setStreamGenreIds] = useState<number[]>([]);
  const [streamTrackQuery, setStreamTrackQuery] = useState("");
  const [streamTrackResults, setStreamTrackResults] = useState<StreamTrackOption[]>([]);
  const [streamTrackLoading, setStreamTrackLoading] = useState(false);
  const [selectedStreamTracks, setSelectedStreamTracks] = useState<StreamTrackOption[]>([]);
  const [isCreatingStream, setIsCreatingStream] = useState(false);
  const [expandedStreamIds, setExpandedStreamIds] = useState<number[]>([]);
  const [streamHlsPrecacheStatus, setStreamHlsPrecacheStatus] = useState<
    Record<number, StreamHlsPrecacheStatus>
  >({});
  const [cancellingStreamHlsPrecacheIds, setCancellingStreamHlsPrecacheIds] = useState<number[]>([]);
  const [streamMenuId, setStreamMenuId] = useState<number | null>(null);
  const streamMenuRef = useRef<HTMLDivElement>(null);

  const [editingStreamId, setEditingStreamId] = useState<number | null>(null);
  const [editingStreamName, setEditingStreamName] = useState("");
  const [editingStreamIcon, setEditingStreamIcon] = useState("");
  const [editingStreamEncoding, setEditingStreamEncoding] = useState<StreamEncoding>("original");
  const [editingStreamShuffle, setEditingStreamShuffle] = useState(false);
  const [editingStreamStatus, setEditingStreamStatus] = useState<StreamStatus>("active");
  const [editingStreamRestartOnSave, setEditingStreamRestartOnSave] = useState(true);
  const [editingStreamPrecacheHls, setEditingStreamPrecacheHls] = useState(false);
  const [editingStreamTab, setEditingStreamTab] = useState<"artists" | "tracks">("artists");
  const [editingStreamTracks, setEditingStreamTracks] = useState<StreamTrackOption[]>([]);
  const [editingStreamSelectedIds, setEditingStreamSelectedIds] = useState<number[]>([]);
  const editingStreamSelectionAnchor = useRef<number | null>(null);
  const [editingStreamArtistQuery, setEditingStreamArtistQuery] = useState("");
  const [editingStreamArtistIds, setEditingStreamArtistIds] = useState<number[]>([]);
  const [editingStreamArtistLoadingIds, setEditingStreamArtistLoadingIds] = useState<number[]>([]);
  const [editingStreamTrackQuery, setEditingStreamTrackQuery] = useState("");
  const [editingStreamTrackResults, setEditingStreamTrackResults] = useState<StreamTrackOption[]>([]);
  const [editingStreamTrackLoading, setEditingStreamTrackLoading] = useState(false);

  const [connectionsModalStreamId, setConnectionsModalStreamId] = useState<number | null>(null);
  const [restartingStreamIds, setRestartingStreamIds] = useState<number[]>([]);
  const [rescanningStreamIds, setRescanningStreamIds] = useState<number[]>([]);
  const [playingStreamId, setPlayingStreamId] = useState<number | null>(null);
  const [streamPlayerNotice, setStreamPlayerNotice] = useState<string | null>(null);
  const streamPlayerRef = useRef<HTMLVideoElement>(null);

  const visibleStreams = useMemo(() => {
    const normalized = streamSearchQuery.trim().toLowerCase();
    const filtered = streams.filter((stream) => {
      if (normalized && !stream.name.toLowerCase().includes(normalized)) {
        return false;
      }
      if (streamOnlineFilter !== "all") {
        const isOnline = stream.status === "active" && stream.onlineSeconds !== null;
        if (streamOnlineFilter === "online" && !isOnline) return false;
        if (streamOnlineFilter === "offline" && isOnline) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (streamSort.startsWith("name")) {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        return streamSort === "name-asc" ? cmp : -cmp;
      }
      const aUptime = a.onlineSeconds ?? 0;
      const bUptime = b.onlineSeconds ?? 0;
      const diff = aUptime - bUptime;
      return streamSort === "uptime-asc" ? diff : -diff;
    });
    return sorted;
  }, [streamSearchQuery, streamOnlineFilter, streamSort, streams]);

  useEffect(() => {
    if (!streamMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (streamMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setStreamMenuId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [streamMenuId]);

  const loadStreams = async (): Promise<StreamSummary[] | null> => {
    if (!canUseApi) return null;
    setStreamsLoading(true);
    try {
      const data = await apiGet<StreamSummary[]>("/api/streams");
      setStreams(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load streams");
    } finally {
      setStreamsLoading(false);
    }
    return null;
  };

  useEffect(() => {
    if (!canUseApi) return;
    if (streamsEnabled && pathname.startsWith("/streams")) {
      void loadStreams();
    }
  }, [canUseApi, pathname, streamsEnabled]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!streamsEnabled || activeTab !== "Streams" || isStreamCreateRoute) return;
    if (!streams.some((stream) => stream.status === "active")) return;
    const interval = window.setInterval(() => {
      void loadStreams();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeTab, canUseApi, isStreamCreateRoute, streams, streamsEnabled]);

  const searchStreamTracks = async (query: string) => {
    if (!canUseApi) return;
    setStreamTrackLoading(true);
    try {
      const result = await apiGet<StreamTrackOption[]>(
        `/api/streams/tracks?query=${encodeURIComponent(query)}`
      );
      setStreamTrackResults(result);
    } catch (err) {
      setStreamTrackResults([]);
      setError(err instanceof Error ? err.message : "Failed to search tracks");
    } finally {
      setStreamTrackLoading(false);
    }
  };

  const searchEditingStreamTracks = async (query: string) => {
    if (!canUseApi) return;
    setEditingStreamTrackLoading(true);
    try {
      const result = await apiGet<StreamTrackOption[]>(
        `/api/streams/tracks?query=${encodeURIComponent(query)}`
      );
      setEditingStreamTrackResults(result);
    } catch (err) {
      setEditingStreamTrackResults([]);
      setError(err instanceof Error ? err.message : "Failed to search tracks");
    } finally {
      setEditingStreamTrackLoading(false);
    }
  };

  useEffect(() => {
    if (!canUseApi) return;
    if (!streamsEnabled || activeTab !== "Streams" || streamSource !== "manual") return;
    const trimmed = streamTrackQuery.trim();
    if (!trimmed) {
      setStreamTrackResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchStreamTracks(trimmed);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTab, canUseApi, streamSource, streamTrackQuery, streamsEnabled]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!editingStreamId) return;
    const trimmed = editingStreamTrackQuery.trim();
    if (!trimmed) {
      setEditingStreamTrackResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchEditingStreamTracks(trimmed);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [canUseApi, editingStreamId, editingStreamTrackQuery]);

  const addStreamTrack = (track: StreamTrackOption) => {
    setSelectedStreamTracks((prev) => {
      if (prev.some((item) => item.id === track.id)) {
        return prev;
      }
      return [...prev, track];
    });
  };

  const removeStreamTrack = (trackId: number) => {
    setSelectedStreamTracks((prev) => prev.filter((item) => item.id !== trackId));
  };

  const moveStreamTrack = (index: number, direction: number) => {
    setSelectedStreamTracks((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const toggleStreamArtist = (artistId: number) => {
    setStreamArtistIds((prev) =>
      prev.includes(artistId) ? prev.filter((id) => id !== artistId) : [...prev, artistId]
    );
  };

  const toggleStreamGenre = (genreId: number) => {
    setStreamGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const mergeEditingStreamTracks = (tracks: StreamTrackOption[]) => {
    if (tracks.length === 0) return;
    setEditingStreamTracks((prev) => {
      const existing = new Set(prev.map((item) => item.id));
      const next = [...prev];
      for (const track of tracks) {
        if (existing.has(track.id)) continue;
        existing.add(track.id);
        next.push(track);
      }
      return next;
    });
  };

  const toggleEditingStreamArtist = async (artist: { id: number; name: string }) => {
    const isSelected = editingStreamArtistIds.includes(artist.id);
    if (isSelected) {
      const matchName = artist.name.toLowerCase();
      setEditingStreamArtistIds((prev) => prev.filter((id) => id !== artist.id));
      setEditingStreamTracks((prev) =>
        prev.filter((track) => (track.artist_name ?? "").toLowerCase() !== matchName)
      );
      return;
    }
    setEditingStreamArtistIds((prev) => [...prev, artist.id]);
    setEditingStreamArtistLoadingIds((prev) => [...prev, artist.id]);
    try {
      const detail = await apiGet<ArtistDetail>(`/api/artists/${artist.id}`);
      const artistTracks: StreamTrackOption[] = [];
      for (const album of detail.albums) {
        for (const track of album.tracks) {
          if (!track.downloaded) continue;
          artistTracks.push({
            id: track.id,
            title: track.title,
            album_title: album.title,
            artist_name: detail.artist.name
          });
        }
      }
      if (artistTracks.length === 0) {
        setError(`No downloaded tracks for ${detail.artist.name}.`);
        setEditingStreamArtistIds((prev) => prev.filter((id) => id !== artist.id));
        return;
      }
      mergeEditingStreamTracks(artistTracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artist tracks");
      setEditingStreamArtistIds((prev) => prev.filter((id) => id !== artist.id));
    } finally {
      setEditingStreamArtistLoadingIds((prev) => prev.filter((id) => id !== artist.id));
    }
  };

  const addEditingStreamTrack = (track: StreamTrackOption) => {
    setEditingStreamTracks((prev) => {
      if (prev.some((item) => item.id === track.id)) {
        return prev;
      }
      return [...prev, track];
    });
  };

  const getOrderedEditingStreamSelection = (tracks: StreamTrackOption[], selectedIds: number[]) => {
    const selected = new Set(selectedIds);
    return tracks.filter((track) => selected.has(track.id)).map((track) => track.id);
  };

  const handleEditingStreamTrackSelect = (
    event: React.MouseEvent<HTMLLIElement>,
    index: number,
    trackId: number
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    if (event.shiftKey && editingStreamSelectionAnchor.current !== null) {
      const start = Math.min(editingStreamSelectionAnchor.current, index);
      const end = Math.max(editingStreamSelectionAnchor.current, index);
      const rangeIds = editingStreamTracks.slice(start, end + 1).map((track) => track.id);
      setEditingStreamSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return getOrderedEditingStreamSelection(editingStreamTracks, Array.from(next));
      });
    } else {
      setEditingStreamSelectedIds([trackId]);
    }
    editingStreamSelectionAnchor.current = index;
  };

  const ensureEditingStreamSelection = (trackId: number, index: number) => {
    if (editingStreamSelectedIds.includes(trackId)) {
      return editingStreamSelectedIds;
    }
    const next = [trackId];
    setEditingStreamSelectedIds(next);
    editingStreamSelectionAnchor.current = index;
    return next;
  };

  const removeEditingStreamTrack = (trackId: number) => {
    setEditingStreamTracks((prev) => prev.filter((item) => item.id !== trackId));
    setEditingStreamSelectedIds((prev) => prev.filter((id) => id !== trackId));
  };

  const moveEditingStreamTrack = (index: number, direction: number, trackId: number) => {
    const selection = ensureEditingStreamSelection(trackId, index);
    setEditingStreamTracks((prev) => {
      if (prev.length <= 1) return prev;
      const selected = new Set(selection);
      const next = [...prev];
      if (direction < 0) {
        for (let i = 1; i < next.length; i += 1) {
          if (selected.has(next[i].id) && !selected.has(next[i - 1].id)) {
            [next[i - 1], next[i]] = [next[i], next[i - 1]];
          }
        }
      } else {
        for (let i = next.length - 2; i >= 0; i -= 1) {
          if (selected.has(next[i].id) && !selected.has(next[i + 1].id)) {
            [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        }
      }
      return next;
    });
  };

  const moveEditingStreamTracksToEdge = (index: number, edge: "top" | "bottom", trackId: number) => {
    const selection = ensureEditingStreamSelection(trackId, index);
    setEditingStreamTracks((prev) => {
      if (prev.length <= 1) return prev;
      const orderedSelection = getOrderedEditingStreamSelection(prev, selection);
      const selected = new Set(orderedSelection);
      const picked = prev.filter((item) => selected.has(item.id));
      const remaining = prev.filter((item) => !selected.has(item.id));
      return edge === "top" ? [...picked, ...remaining] : [...remaining, ...picked];
    });
  };

  useEffect(() => {
    setEditingStreamSelectedIds((prev) => {
      if (prev.length === 0) return prev;
      const ordered = getOrderedEditingStreamSelection(editingStreamTracks, prev);
      if (ordered.length === prev.length && ordered.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return ordered;
    });
  }, [editingStreamTracks]);

  const shuffleEditingStreamTracks = () => {
    setEditingStreamTracks((prev) => {
      if (prev.length <= 1) return prev;
      let next = shuffleTracksForEdit(prev);
      let attempts = 0;
      while (isSameTrackOrder(next, prev) && attempts < 5) {
        next = shuffleTracksForEdit(prev);
        attempts += 1;
      }
      return next;
    });
  };

  const toggleStreamExpanded = (streamId: number) => {
    setExpandedStreamIds((prev) =>
      prev.includes(streamId) ? prev.filter((id) => id !== streamId) : [...prev, streamId]
    );
  };

  const fetchStreamHlsPrecacheStatus = async (streamId: number) => {
    if (!canUseApi) return;
    try {
      const status = await apiGet<StreamHlsPrecacheStatus>(`/api/streams/${streamId}/hls/precache`);
      setStreamHlsPrecacheStatus((prev) => ({ ...prev, [streamId]: status }));
    } catch {
      // ignore background status fetch failures
    }
  };

  useEffect(() => {
    if (!canUseApi) return;
    if (expandedStreamIds.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      await Promise.all(
        expandedStreamIds.map(async (streamId) => {
          if (cancelled) return;
          await fetchStreamHlsPrecacheStatus(streamId);
        })
      );
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiGet, canUseApi, expandedStreamIds]);

  const toggleStreamMenu = (streamId: number) => {
    setStreamMenuId((prev) => (prev === streamId ? null : streamId));
  };

  type StreamHlsUrlMode = "live" | "cached";

  const buildStreamHlsUrl = (
    streamId: number,
    baseUrl: string,
    mode: StreamHlsUrlMode = "live"
  ) => {
    const token = streamSettings?.token || streamToken;
    if (!token) return "";
    const playlistPath = mode === "live" ? "live.m3u8" : "playlist.m3u8";
    return `${baseUrl}/api/streams/${streamId}/hls/${playlistPath}?token=${encodeURIComponent(token)}`;
  };

  const streamLiveUrl = (streamId: number) => buildStreamHlsUrl(streamId, apiBaseUrl, "live");
  const streamCachedUrl = (streamId: number) => buildStreamHlsUrl(streamId, apiBaseUrl, "cached");

  const shareableStreamUrl = (streamId: number) => {
    const base = generalPublicApiBaseUrl.trim() || generalDomain.trim() || apiBaseUrl;
    return buildStreamHlsUrl(streamId, base, "live");
  };

  const escapeM3uValue = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/\"/g, "'").trim();

  const downloadStreamsM3u = () => {
    const token = streamSettings?.token || streamToken;
    if (!token) {
      setError("Load the stream token in Settings to generate shareable URLs.");
      return;
    }
    if (streams.length === 0) {
      setError("No streams available to export.");
      return;
    }
    const base = generalPublicApiBaseUrl.trim() || generalDomain.trim() || apiBaseUrl;
    const sortedStreams = [...streams].sort((a, b) => {
      const aName = a.name?.trim() || `Stream ${a.id}`;
      const bName = b.name?.trim() || `Stream ${b.id}`;
      return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" });
    });
    const lines = sortedStreams
      .map((stream) => {
        const url = buildStreamHlsUrl(stream.id, base, "live");
        if (!url) return null;
        const safeName = escapeM3uValue(stream.name || `Stream ${stream.id}`);
        const tags = [
          `tvg-id="stream-${stream.id}"`,
          `tvg-name="${safeName}"`,
          `group-title="Streams"`
        ];
        const iconValue = stream.icon?.trim();
        if (iconValue && /^https?:\/\//i.test(iconValue)) {
          tags.push(`tvg-logo="${escapeM3uValue(iconValue)}"`);
        }
        return `#EXTINF:-1 ${tags.join(" ")},${safeName}\n${url}`;
      })
      .filter((line): line is string => Boolean(line));
    if (lines.length === 0) {
      setError("No streams with shareable URLs available.");
      return;
    }
    const content = ["#EXTM3U", ...lines].join("\n");
    const blob = new Blob([content], { type: "audio/x-mpegurl;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "streams.m3u";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const precacheStreamHls = async (streamId: number, options?: { force?: boolean }) => {
    if (!canUseApi) return;
    setError(null);
    try {
      await apiPost<{ streamId: number; queued: number; force: boolean }>(
        `/api/streams/${streamId}/hls/precache`,
        {
          force: options?.force ?? true
        }
      );
      void fetchStreamHlsPrecacheStatus(streamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pre-encode HLS cache");
    }
  };

  const cancelStreamHlsPrecache = async (streamId: number, options?: { abortActive?: boolean }) => {
    if (!canUseApi) return;
    if (cancellingStreamHlsPrecacheIds.includes(streamId)) return;
    setCancellingStreamHlsPrecacheIds((prev) => [...prev, streamId]);
    setError(null);
    try {
      await apiPost<{ streamId: number; tracks: number; removed: number; abortActive: boolean }>(
        `/api/streams/${streamId}/hls/precache/cancel`,
        { abortActive: options?.abortActive ?? true }
      );
      void fetchStreamHlsPrecacheStatus(streamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel HLS cache encoding");
    } finally {
      setCancellingStreamHlsPrecacheIds((prev) => prev.filter((id) => id !== streamId));
    }
  };

  const createStream = async () => {
    const trimmedName = streamName.trim();
    if (!trimmedName) {
      setError("Stream name is required");
      return;
    }
    setIsCreatingStream(true);
    setError(null);
    try {
      const trimmedIcon = streamIcon.trim();
      const payload: {
        name: string;
        shuffle: boolean;
        encoding: StreamEncoding;
        icon?: string;
        trackIds?: number[];
        artistIds?: number[];
        genreIds?: number[];
      } = {
        name: trimmedName,
        shuffle: streamShuffle,
        encoding: streamEncoding
      };
      if (trimmedIcon) {
        payload.icon = trimmedIcon;
      }

      if (streamSource === "manual") {
        if (selectedStreamTracks.length === 0) {
          setError("Pick at least one track");
          setIsCreatingStream(false);
          return;
        }
        payload.trackIds = selectedStreamTracks.map((track) => track.id);
      } else if (streamSource === "artists") {
        if (streamArtistIds.length === 0) {
          setError("Pick at least one artist");
          setIsCreatingStream(false);
          return;
        }
        payload.artistIds = streamArtistIds;
      } else {
        if (streamGenreIds.length === 0) {
          setError("Pick at least one genre");
          setIsCreatingStream(false);
          return;
        }
        payload.genreIds = streamGenreIds;
      }

      const created = await apiPost<StreamSummary>("/api/streams", {
        ...payload
      });
      if (streamPrecacheHls) {
        // Run in the background; it can take a while on large streams.
        void precacheStreamHls(created.id, { force: true });
      }
      setStreamName("");
      setStreamIcon("");
      setStreamShuffle(false);
      setStreamEncoding("original");
      setStreamPrecacheHls(true);
      setStreamArtistIds([]);
      setStreamGenreIds([]);
      setStreamArtistQuery("");
      setStreamGenreQuery("");
      setStreamTrackQuery("");
      setStreamTrackResults([]);
      setSelectedStreamTracks([]);
      await loadStreams();
      navigate("/streams");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stream");
    } finally {
      setIsCreatingStream(false);
    }
  };

  const beginEditStream = (stream: StreamSummary) => {
    setEditingStreamId(stream.id);
    setEditingStreamName(stream.name);
    setEditingStreamIcon(stream.icon ?? "");
    setEditingStreamEncoding(stream.encoding);
    setEditingStreamShuffle(stream.shuffle);
    setEditingStreamStatus(stream.status);
    setEditingStreamRestartOnSave(stream.status === "active");
    setEditingStreamPrecacheHls(false);
    const artistIds = new Set<number>();
    for (const item of stream.items) {
      if (!item.artist_name) continue;
      const match = artists.find(
        (artist) => artist.name.toLowerCase() === item.artist_name?.toLowerCase()
      );
      if (match) {
        artistIds.add(match.id);
      }
    }
    setEditingStreamArtistIds([...artistIds]);
    setEditingStreamArtistQuery("");
    setEditingStreamArtistLoadingIds([]);
    setEditingStreamTracks(
      stream.items.map((item) => ({
        id: item.track_id,
        title: item.title,
        album_title: item.album_title,
        artist_name: item.artist_name
      }))
    );
    setEditingStreamSelectedIds([]);
    editingStreamSelectionAnchor.current = null;
    setEditingStreamTrackQuery("");
    setEditingStreamTrackResults([]);
  };

  const cancelEditStream = () => {
    setEditingStreamId(null);
    setEditingStreamName("");
    setEditingStreamIcon("");
    setEditingStreamEncoding("original");
    setEditingStreamShuffle(false);
    setEditingStreamStatus("active");
    setEditingStreamRestartOnSave(true);
    setEditingStreamPrecacheHls(false);
    setEditingStreamTab("artists");
    setEditingStreamTracks([]);
    setEditingStreamSelectedIds([]);
    editingStreamSelectionAnchor.current = null;
    setEditingStreamArtistQuery("");
    setEditingStreamArtistIds([]);
    setEditingStreamArtistLoadingIds([]);
    setEditingStreamTrackQuery("");
    setEditingStreamTrackResults([]);
  };

  const saveStreamEdits = async () => {
    if (!editingStreamId) {
      return;
    }
    const streamId = editingStreamId;
    const trimmedName = editingStreamName.trim();
    if (!trimmedName) {
      setError("Stream name is required");
      return;
    }
    if (editingStreamTracks.length === 0) {
      setError("Pick at least one track");
      return;
    }
    setError(null);
    try {
      await apiPatch<StreamSummary>(`/api/streams/${streamId}`, {
        name: trimmedName,
        icon: editingStreamIcon.trim(),
        shuffle: editingStreamShuffle,
        encoding: editingStreamEncoding,
        status: editingStreamStatus
      });
      await apiPut<StreamSummary>(`/api/streams/${streamId}/items`, {
        trackIds: editingStreamTracks.map((track) => track.id)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stream");
      return;
    }

    const shouldRestart = editingStreamRestartOnSave;
    if (shouldRestart) {
      const action = editingStreamStatus === "active" ? "reboot" : "start";
      try {
        await apiPost<StreamSummary>(`/api/streams/${streamId}/actions`, { action });
      } catch (err) {
        const actionLabel = action === "reboot" ? "restart" : "start";
        const message =
          err instanceof Error
            ? `Stream saved, but ${actionLabel} failed: ${err.message}`
            : `Stream saved, but ${actionLabel} failed`;
        setError(message);
      }
    }
    if (editingStreamPrecacheHls) {
      void precacheStreamHls(streamId, { force: true });
    }
    await loadStreams();
    cancelEditStream();
  };

  const updateEditingStreamTracks = (stream: StreamSummary) => {
    if (editingStreamId !== stream.id) return;
    setEditingStreamTracks(
      stream.items.map((item) => ({
        id: item.track_id,
        title: item.title,
        album_title: item.album_title,
        artist_name: item.artist_name
      }))
    );
    setEditingStreamSelectedIds([]);
    editingStreamSelectionAnchor.current = null;
    setEditingStreamStatus(stream.status);
  };

  const rescanStream = async (streamId: number, artistIds?: number[]) => {
    setError(null);
    setRescanningStreamIds((prev) => (prev.includes(streamId) ? prev : [...prev, streamId]));
    try {
      const payload = artistIds && artistIds.length > 0 ? { artistIds } : {};
      const result = await apiPost<StreamSummary>(`/api/streams/${streamId}/rescan`, payload);
      updateEditingStreamTracks(result);
      await loadStreams();
      if (editingStreamId === streamId && editingStreamPrecacheHls) {
        void precacheStreamHls(streamId, { force: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rescan stream");
    } finally {
      setRescanningStreamIds((prev) => prev.filter((id) => id !== streamId));
    }
  };

  const rescanEditingStream = async () => {
    if (!editingStreamId) return;
    if (editingStreamArtistIds.length === 0) {
      setError("Select at least one artist to rescan.");
      return;
    }
    await rescanStream(editingStreamId, editingStreamArtistIds);
  };

  const runStreamAction = async (streamId: number, action: "start" | "stop" | "reboot") => {
    setError(null);
    if (action === "reboot") {
      setRestartingStreamIds((prev) => (prev.includes(streamId) ? prev : [...prev, streamId]));
    }
    try {
      const result = await apiPost<StreamSummary>(`/api/streams/${streamId}/actions`, { action });
      const updated = await loadStreams();
      if (action === "reboot") {
        const latest = updated?.find((stream) => stream.id === streamId) ?? result;
        if (latest?.status === "active") {
          setRestartingStreamIds((prev) => prev.filter((id) => id !== streamId));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stream status");
      if (action === "reboot") {
        setRestartingStreamIds((prev) => prev.filter((id) => id !== streamId));
      }
    }
  };

  const openStreamPlayer = (streamId: number) => {
    setPlayingStreamId(streamId);
    setStreamPlayerNotice(null);
  };

  const closeStreamPlayer = () => {
    setPlayingStreamId(null);
    setStreamPlayerNotice(null);
  };

  const playingStream = useMemo(
    () => streams.find((item) => item.id === playingStreamId) ?? null,
    [playingStreamId, streams]
  );

  const connectionsModalStream = useMemo(
    () => streams.find((item) => item.id === connectionsModalStreamId) ?? null,
    [connectionsModalStreamId, streams]
  );

  const playingStreamReloadKey = useMemo(() => {
    if (!playingStream) return null;
    const token = streamSettings?.token || streamToken || "";
    return `${playingStream.id}:${playingStream.status}:${playingStream.encoding}:${token}`;
  }, [playingStream, streamSettings?.token, streamToken]);

  useStreamHlsPlayback({
    playingStreamId,
    playingStream,
    streamPlayerRef,
    streamLiveUrl,
    reloadKey: playingStreamReloadKey,
    setStreamPlayerNotice
  });

  const deleteStream = async (streamId: number, streamName: string) => {
    const confirmed = window.confirm(`Delete stream "${streamName}"?`);
    if (!confirmed) return;
    setError(null);
    try {
      await apiDelete(`/api/streams/${streamId}`);
      setStreams((prev) => prev.filter((stream) => stream.id !== streamId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete stream");
    }
  };

  const filteredStreamArtists = useMemo(() => {
    const query = streamArtistQuery.trim().toLowerCase();
    if (!query) return artists;
    return artists.filter((artist) => matchesArtistQuery(artist.name, query));
  }, [artists, streamArtistQuery]);

  const filteredEditingStreamArtists = useMemo(() => {
    const query = editingStreamArtistQuery.trim().toLowerCase();
    if (!query) return artists;
    return artists.filter((artist) => matchesArtistQuery(artist.name, query));
  }, [artists, editingStreamArtistQuery]);

  const filteredStreamGenres = useMemo(() => {
    const query = streamGenreQuery.trim().toLowerCase();
    if (!query) return genres;
    return genres.filter((genre) => genre.name.toLowerCase().includes(query));
  }, [genres, streamGenreQuery]);

  return {
    streams,
    streamsLoading,
    visibleStreams,

    // Toolbar
    streamSearchQuery,
    setStreamSearchQuery,
    streamOnlineFilter,
    setStreamOnlineFilter,
    streamSort,
    setStreamSort,
    downloadStreamsM3u,
    loadStreams,

    // Create
    streamName,
    setStreamName,
    streamIcon,
    setStreamIcon,
    streamEncoding,
    setStreamEncoding,
    streamShuffle,
    setStreamShuffle,
    streamPrecacheHls,
    setStreamPrecacheHls,
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
    createStream,

    // List
    expandedStreamIds,
    toggleStreamExpanded,
    streamHlsPrecacheStatus,
    cancellingStreamHlsPrecacheIds,
    streamMenuId,
    setStreamMenuId,
    streamMenuRef,
    toggleStreamMenu,

    // Edit
    editingStreamId,
    beginEditStream,
    cancelEditStream,
    restartingStreamIds,
    rescanningStreamIds,
    streamLiveUrl,
    streamCachedUrl,
    shareableStreamUrl,
    runStreamAction,
    rescanStream,
    cancelStreamHlsPrecache,
    deleteStream,
    setConnectionsModalStreamId,
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
    saveStreamEdits,
    precacheStreamHls,
    connectionsModalStream,

    // Player
    openStreamPlayer,
    playingStreamId,
    streamPlayerNotice,
    setStreamPlayerNotice,
    streamPlayerRef,
    closeStreamPlayer
  };
}

