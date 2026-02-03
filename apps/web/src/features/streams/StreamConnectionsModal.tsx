import React from "react";

import { CloseIcon } from "../../components/icons";
import { formatElapsed } from "../../utils/format";

type StreamClient = {
  ip: string;
  userAgent?: string | null;
  activeConnections: number;
  connectedSince: string;
  lastPath?: string | null;
};

type ConnectionsStream = {
  name: string;
  connections: number;
  clients: StreamClient[];
};

type StreamConnectionsModalProps<TStream extends ConnectionsStream> = {
  stream: TStream | null;
  onClose: () => void;
};

export function StreamConnectionsModal<TStream extends ConnectionsStream>({
  stream,
  onClose
}: StreamConnectionsModalProps<TStream>) {
  if (!stream) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Stream clients</div>
            <div className="text-xs text-slate-500">
              {stream.name} · {stream.connections} active
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Close connections"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {stream.clients.length === 0 ? (
            <div className="text-sm text-slate-500">No active clients.</div>
          ) : (
            <ul className="space-y-3 text-sm">
              {stream.clients.map((client) => {
                const connectedMs = Date.parse(client.connectedSince);
                const connectedSeconds = Number.isFinite(connectedMs)
                  ? Math.max(1, Math.floor((Date.now() - connectedMs) / 1000))
                  : null;
                return (
                  <li
                    key={`${client.ip}-${client.userAgent ?? "unknown"}`}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{client.ip}</span>
                      {client.activeConnections > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          active
                        </span>
                      )}
                      {connectedSeconds !== null && (
                        <span className="text-xs text-slate-500">
                          online for {formatElapsed(connectedSeconds)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {client.userAgent ?? "Unknown user agent"}
                    </div>
                    {client.lastPath && (
                      <div className="mt-1 text-xs text-slate-400">{client.lastPath}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

