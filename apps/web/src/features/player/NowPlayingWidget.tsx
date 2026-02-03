import React from "react";

import { formatBitrate, formatResolution } from "../../utils/format";

type PlayerMode = "full" | "compact";

type PlayerPosition = { x: number; y: number };

type PlaybackItem = {
  trackId: number;
  title: string;
  albumTitle?: string | null;
};

type PlaybackInfoStatus = "idle" | "loading" | "error" | "success";

type PlaybackInfo = {
  videoWidth?: number | null;
  videoHeight?: number | null;
  bitRate?: number | null;
  videoCodec?: string | null;
};

type NowPlayingWidgetProps = {
  currentPlayback: PlaybackItem | null;
  playbackQueue: PlaybackItem[];
  playbackIndex: number;
  setPlaybackIndex: (index: number) => void;
  draggedPlaylistIndex: number | null;
  setDraggedPlaylistIndex: (index: number | null) => void;
  reorderPlaybackQueue: (from: number, to: number) => void;
  removeFromQueue: (index: number) => void;

  currentPlaybackInfoStatus: PlaybackInfoStatus;
  currentPlaybackInfo: PlaybackInfo | null;

  playerRef: React.RefObject<HTMLDivElement>;
  playerPosition: PlayerPosition | null;
  playerMode: PlayerMode;
  isDraggingPlayer: boolean;
  handlePlayerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;

  shuffleEnabled: boolean;
  toggleShuffle: () => void;
  playPrev: () => void;
  playNext: () => void;
  dockPlayer: () => void;
  expandPlayer: () => void;
  popOutPlayer: () => void;
  stopPlayback: () => void;

  getTrackStreamUrl: (trackId: number) => string;
};

export const NowPlayingWidget = ({
  currentPlayback,
  playbackQueue,
  playbackIndex,
  setPlaybackIndex,
  draggedPlaylistIndex,
  setDraggedPlaylistIndex,
  reorderPlaybackQueue,
  removeFromQueue,
  currentPlaybackInfoStatus,
  currentPlaybackInfo,
  playerRef,
  playerPosition,
  playerMode,
  isDraggingPlayer,
  handlePlayerPointerDown,
  shuffleEnabled,
  toggleShuffle,
  playPrev,
  playNext,
  dockPlayer,
  expandPlayer,
  popOutPlayer,
  stopPlayback,
  getTrackStreamUrl
}: NowPlayingWidgetProps) => {
  if (!currentPlayback) return null;

  return (
    <div
      ref={playerRef}
      style={playerPosition ? { left: playerPosition.x, top: playerPosition.y } : undefined}
      className={`fixed z-40 overflow-auto max-w-[90vw] max-h-[90vh] ${
        playerMode === "compact"
          ? "w-[220px] h-[180px] min-w-[200px] min-h-[160px] resize-none"
          : "w-[520px] h-[260px] min-w-[320px] min-h-[200px] resize"
      }`}
    >
      <div className="flex h-full w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div
          onPointerDown={handlePlayerPointerDown}
          className={`flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 ${
            playerMode === "compact"
              ? "cursor-default"
              : isDraggingPlayer
                ? "cursor-grabbing"
                : "cursor-grab"
          }`}
        >
          <span>
            Now playing: <span className="font-semibold text-slate-700">{currentPlayback.title}</span>
            {currentPlayback.albumTitle ? ` · ${currentPlayback.albumTitle}` : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            {currentPlaybackInfoStatus === "loading" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">
                Loading media…
              </span>
            )}
            {currentPlaybackInfoStatus === "error" && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600">
                Media info unavailable
              </span>
            )}
            {currentPlaybackInfo && currentPlaybackInfoStatus !== "loading" && (
              <>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                  {formatResolution(currentPlaybackInfo.videoWidth, currentPlaybackInfo.videoHeight)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                  {formatBitrate(currentPlaybackInfo.bitRate)}
                </span>
                {currentPlaybackInfo.videoCodec && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                    {currentPlaybackInfo.videoCodec.toUpperCase()}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={playPrev}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {playerMode === "compact" ? "⏮" : "Prev"}
            </button>
            <button
              onClick={playNext}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {playerMode === "compact" ? "⏭" : "Next"}
            </button>
            <button
              onClick={toggleShuffle}
              className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                shuffleEnabled
                  ? "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {playerMode === "compact" ? "🔀" : "Shuffle"}
            </button>
            <button
              onClick={playerMode === "compact" ? expandPlayer : dockPlayer}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {playerMode === "compact" ? "⤢" : "Dock"}
            </button>
            {playerMode !== "compact" && (
              <button
                onClick={popOutPlayer}
                className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Pop out
              </button>
            )}
            <button
              onClick={stopPlayback}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {playerMode === "compact" ? "✕" : "Close"}
            </button>
          </div>
        </div>
        <div className={`flex h-full min-h-0 flex-col gap-3 ${playerMode === "compact" ? "" : "md:flex-row"}`}>
          <div className="flex min-h-0 flex-1 flex-col">
            <video
              key={currentPlayback.trackId}
              src={getTrackStreamUrl(currentPlayback.trackId)}
              crossOrigin="anonymous"
              controls
              autoPlay
              onEnded={playNext}
              className="h-full w-full flex-1 rounded-lg bg-slate-900"
            />
          </div>
          {playerMode !== "compact" && (
            <div className="flex min-h-0 w-full flex-col md:w-56">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Playlist</div>
              {playbackQueue.length > 0 ? (
                <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                  {playbackQueue.map((item, index) => (
                    <div
                      key={`${item.trackId}-${index}`}
                      draggable
                      onDragStart={() => setDraggedPlaylistIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedPlaylistIndex === null) return;
                        reorderPlaybackQueue(draggedPlaylistIndex, index);
                        setDraggedPlaylistIndex(null);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 ${
                        index === playbackIndex ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-100"
                      }`}
                    >
                      <button
                        onClick={() => setPlaybackIndex(index)}
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        <span className="text-[10px] text-slate-400">⋮⋮</span>
                        <span className="truncate">
                          {item.title}
                          {item.albumTitle ? ` · ${item.albumTitle}` : ""}
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">
                          {index + 1}/{playbackQueue.length}
                        </span>
                        <button
                          onClick={() => removeFromQueue(index)}
                          className="rounded-full border border-slate-200 px-1 text-[10px] text-slate-500 hover:bg-slate-100"
                          title="Remove from queue"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">Queue is empty.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

