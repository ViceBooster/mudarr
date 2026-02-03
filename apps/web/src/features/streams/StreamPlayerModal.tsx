import React from "react";

import { CloseIcon } from "../../components/icons";

type StreamPlayerStream = {
  id: number;
  name?: string | null;
  status: string;
};

type StreamPlayerModalProps<TStream extends StreamPlayerStream> = {
  streamId: number | null;
  stream: TStream | null;
  hlsUrl: string;
  notice: string | null;
  setNotice: (value: string | null) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  onClose: () => void;
};

export function StreamPlayerModal<TStream extends StreamPlayerStream>({
  streamId,
  stream,
  hlsUrl,
  notice,
  setNotice,
  videoRef,
  onClose
}: StreamPlayerModalProps<TStream>) {
  if (!streamId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl max-h-[80vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Stream player</div>
            <div className="text-xs text-slate-500">{stream?.name ?? "Live stream"}</div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 bg-slate-950">
          {!stream ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Stream not found.
            </div>
          ) : stream.status !== "active" ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Stream is stopped. Start it to play.
            </div>
          ) : !hlsUrl ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Stream token required to play.
            </div>
          ) : (
            <>
              {notice && (
                <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-xs text-slate-300">
                  <span>{notice}</span>
                </div>
              )}
              <video
                ref={videoRef}
                key={`${stream.id}-hls`}
                // HLS is attached by hls.js in App
                src={undefined}
                controls
                autoPlay
                onError={() => {
                  setNotice("HLS playback error. Please try refreshing.");
                }}
                className="h-full w-full"
              />
            </>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
          <span>Live stream playback</span>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

