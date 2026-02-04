import React from "react";

import {
  AudioIcon,
  CloseIcon,
  ClockIcon,
  ConnectionsIcon,
  DownloadIcon,
  EditIcon,
  FormatIcon,
  MenuIcon,
  PlayIcon,
  RefreshIcon,
  ResolutionIcon,
  SearchIcon,
  StopIcon,
  StreamIcon,
  TracksIcon,
  TrashIcon,
  VideoIcon
} from "../../components/icons";
import {
  formatBitrate,
  formatBytes,
  formatDuration,
  formatResolution
} from "../../utils/format";

type StreamAction = "start" | "stop" | "reboot";

type BivariantHandler<T> = { bivarianceHack: (value: T) => string }["bivarianceHack"];

type StreamClientBase = {
  ip: string;
  userAgent?: string | null;
  activeConnections: number;
  lastSeen: string;
};

type StreamItemBase = {
  id: number;
  title: string;
  artist_name: string | null;
  album_title: string | null;
  available: boolean;
  bytes: number | null;
  duration: number | null;
  video_width: number | null;
  video_height: number | null;
  bit_rate: number | null;
  video_codec: string | null;
  audio_codec: string | null;
};

type StreamsListStreamBase<TClient extends StreamClientBase, TItem extends StreamItemBase> = {
  id: number;
  name: string;
  icon?: string | null;
  missingCount: number;
  encoding: string;
  itemCount: number;
  totalDuration: number | null;
  totalBytes: number;
  status: "active" | "stopped" | string;
  onlineSeconds: number | null;
  connections: number;
  clients: TClient[];
  items: TItem[];
  videoCodecs: string[];
  audioCodecs: string[];
};

type StreamsListProps<
  TClient extends StreamClientBase,
  TItem extends StreamItemBase,
  TStream extends StreamsListStreamBase<TClient, TItem>
> = {
  streams: TStream[];
  visibleStreams: TStream[];
  streamsLoading: boolean;

  expandedStreamIds: number[];
  toggleStreamExpanded: (streamId: number) => void;

  streamMenuId: number | null;
  setStreamMenuId: React.Dispatch<React.SetStateAction<number | null>>;
  streamMenuRef: React.RefObject<HTMLDivElement>;
  toggleStreamMenu: (streamId: number) => void;

  editingStreamId: number | null;
  beginEditStream: (stream: TStream) => void;
  cancelEditStream: () => void;

  restartingStreamIds: number[];
  rescanningStreamIds: number[];

  streamLiveUrl: (streamId: number) => string;
  shareableStreamUrl: (streamId: number) => string;
  getResolutionSummary: BivariantHandler<TItem[]>;

  openStreamPlayer: (streamId: number) => void;
  runStreamAction: (streamId: number, action: StreamAction) => void | Promise<unknown>;
  rescanStream: (streamId: number) => void | Promise<unknown>;
  deleteStream: (streamId: number, streamName: string) => void;

  setConnectionsModalStreamId: React.Dispatch<React.SetStateAction<number | null>>;
};

export function StreamsList<
  TClient extends StreamClientBase,
  TItem extends StreamItemBase,
  TStream extends StreamsListStreamBase<TClient, TItem>
>({
  streams,
  visibleStreams,
  streamsLoading,
  expandedStreamIds,
  toggleStreamExpanded,
  streamMenuId,
  setStreamMenuId,
  streamMenuRef,
  toggleStreamMenu,
  editingStreamId,
  beginEditStream,
  cancelEditStream,
  restartingStreamIds,
  rescanningStreamIds,
  streamLiveUrl,
  shareableStreamUrl,
  getResolutionSummary,
  openStreamPlayer,
  runStreamAction,
  rescanStream,
  deleteStream,
  setConnectionsModalStreamId
}: StreamsListProps<TClient, TItem, TStream>) {
  return (
    <div className="w-full rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Existing streams</h3>
        {streamsLoading && <span className="text-xs text-slate-500">Loading...</span>}
      </div>
      <ul className="mt-4 w-full space-y-3 text-sm">
        {visibleStreams.map((stream) => {
          const isExpanded = expandedStreamIds.includes(stream.id);
          const liveUrl = streamLiveUrl(stream.id);
          const shareUrl = shareableStreamUrl(stream.id);
          const isEditing = editingStreamId === stream.id;
          const resolutionSummary = getResolutionSummary(stream.items);
          const isRestarting = restartingStreamIds.includes(stream.id);
          const isRescanning = rescanningStreamIds.includes(stream.id);
          const isMenuOpen = streamMenuId === stream.id;
          const iconValue = stream.icon?.trim();
          const isIconUrl = iconValue ? /^https?:\/\//i.test(iconValue) : false;
          return (
            <li
              key={stream.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm"
            >
              <div className="grid gap-3 md:grid-cols-12 md:items-start md:gap-4">
                <div className="flex items-start gap-3 md:col-span-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    {iconValue ? (
                      isIconUrl ? (
                        <img
                          src={iconValue}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-base">{iconValue}</span>
                      )
                    ) : (
                      <StreamIcon />
                    )}
                  </div>
                </div>
                <div className="min-w-0 md:col-span-3">
                  <div className="text-sm font-semibold text-slate-900">{stream.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    {stream.missingCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                        {stream.missingCount} missing
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <FormatIcon />
                      {stream.encoding}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <TracksIcon />
                      {stream.itemCount} tracks
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <ClockIcon />
                      {formatDuration(stream.totalDuration)}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <DownloadIcon />
                      {formatBytes(stream.totalBytes)}
                    </span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Uptime
                  </div>
                  {stream.status === "active" && stream.onlineSeconds !== null ? (
                    <div className="mt-1 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      Online {formatDuration(stream.onlineSeconds)}
                    </div>
                  ) : (
                    <div className="mt-1 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                      Offline
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Connections
                  </div>
                  {stream.connections > 0 ? (
                    <button
                      type="button"
                      onClick={() => setConnectionsModalStreamId(stream.id)}
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-200"
                    >
                      <ConnectionsIcon />
                      {stream.connections}
                    </button>
                  ) : (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      <ConnectionsIcon />
                      {stream.connections}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1.5 text-[10px] text-slate-600 md:col-span-2 md:items-start">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Controls
                  </div>
                  <div className="relative" ref={isMenuOpen ? streamMenuRef : undefined}>
                    <button
                      onClick={() => toggleStreamMenu(stream.id)}
                      title="Stream controls"
                      aria-label="Stream controls"
                      aria-expanded={isMenuOpen}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold transition ${
                        isMenuOpen
                          ? "border-slate-200 bg-slate-900 text-white hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <MenuIcon />
                    </button>
                    {isMenuOpen && (
                      <div className="absolute right-0 z-10 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            openStreamPlayer(stream.id);
                          }}
                          disabled={!liveUrl || stream.status !== "active"}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <PlayIcon />
                          Play stream
                        </button>
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            void runStreamAction(
                              stream.id,
                              stream.status === "active" ? "stop" : "start"
                            );
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {stream.status === "active" ? <StopIcon /> : <PlayIcon />}
                          {stream.status === "active" ? "Stop stream" : "Start stream"}
                        </button>
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            void runStreamAction(stream.id, "reboot");
                          }}
                          disabled={isRestarting}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className={isRestarting ? "animate-spin" : ""}>
                            <RefreshIcon />
                          </span>
                          Restart stream
                        </button>
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            void rescanStream(stream.id);
                          }}
                          disabled={isRescanning}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <SearchIcon />
                          {isRescanning ? "Rescanning..." : "Rescan tracks"}
                        </button>
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            isEditing ? cancelEditStream() : beginEditStream(stream);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {isEditing ? <CloseIcon /> : <EditIcon />}
                          {isEditing ? "Cancel edit" : "Edit stream"}
                        </button>
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            toggleStreamExpanded(stream.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <TracksIcon />
                          {isExpanded ? "Hide tracks" : "Show tracks"}
                        </button>
                        <button
                          onClick={() => {
                            setStreamMenuId(null);
                            deleteStream(stream.id, stream.name);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <TrashIcon />
                          Delete stream
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-[10px] text-slate-600 md:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Stream info
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <ResolutionIcon />
                      {resolutionSummary}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <VideoIcon />
                      {stream.videoCodecs.length > 0 ? stream.videoCodecs.join(", ") : "Video unknown"}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                      <AudioIcon />
                      {stream.audioCodecs.length > 0 ? stream.audioCodecs.join(", ") : "Audio unknown"}
                    </span>
                  </div>
                </div>
              </div>
              {shareUrl ? (
                <div className="mt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Stream URL (HLS Radio)
                  </div>
                  <input
                    value={shareUrl}
                    readOnly
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                  />
                </div>
              ) : (
                <div className="mt-1.5 text-xs text-slate-500">
                  Load the stream token in Settings to generate shareable URLs.
                </div>
              )}
              {isExpanded && (
                <>
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Connections
                    </div>
                    {stream.clients.length === 0 ? (
                      <div className="mt-2 text-xs text-slate-500">No active clients.</div>
                    ) : (
                      <ul className="mt-2 space-y-2 text-[10px] text-slate-600">
                        {stream.clients.map((client) => {
                          const lastSeenMs = Date.parse(client.lastSeen);
                          const seenSeconds = Number.isFinite(lastSeenMs)
                            ? Math.max(1, Math.floor((Date.now() - lastSeenMs) / 1000))
                            : null;
                          return (
                            <li
                              key={`${client.ip}-${client.userAgent ?? "unknown"}`}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-700">{client.ip}</span>
                                {client.activeConnections > 0 && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                                    active
                                  </span>
                                )}
                                {seenSeconds !== null && (
                                  <span className="text-slate-500">
                                    seen {formatDuration(seenSeconds)} ago
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-slate-500">
                                {client.userAgent ?? "Unknown user agent"}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2 text-xs">
                    {stream.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-100 bg-white px-3 py-2"
                      >
                        <div className="font-semibold text-slate-800">
                          {item.artist_name ?? "Unknown Artist"} - {item.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          {item.album_title && (
                            <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                              {item.album_title}
                            </span>
                          )}
                          {item.available ? (
                            <>
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                {item.bytes ? formatBytes(item.bytes) : "Size unknown"}
                              </span>
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                {formatDuration(item.duration)}
                              </span>
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                {formatResolution(item.video_width, item.video_height)}
                              </span>
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                {formatBitrate(item.bit_rate)}
                              </span>
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                {item.video_codec ?? "Video unknown"}
                              </span>
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                                {item.audio_codec ?? "Audio unknown"}
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                              Missing file
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                    {stream.items.length === 0 && (
                      <li className="text-xs text-slate-500">No tracks added yet.</li>
                    )}
                  </ul>
                </>
              )}
            </li>
          );
        })}
        {visibleStreams.length === 0 && !streamsLoading && (
          <li className="col-span-full text-sm text-slate-500">
            {streams.length === 0 ? "No streams yet." : "No streams match your filters."}
          </li>
        )}
      </ul>
    </div>
  );
}

