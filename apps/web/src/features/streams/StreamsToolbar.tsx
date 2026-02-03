import React from "react";

export type StreamOnlineFilter = "all" | "online" | "offline";
export type StreamSort = "name-asc" | "name-desc" | "uptime-desc" | "uptime-asc";

type StreamsToolbarProps = {
  streamSearchQuery: string;
  setStreamSearchQuery: React.Dispatch<React.SetStateAction<string>>;

  streamOnlineFilter: StreamOnlineFilter;
  setStreamOnlineFilter: React.Dispatch<React.SetStateAction<StreamOnlineFilter>>;

  streamSort: StreamSort;
  setStreamSort: React.Dispatch<React.SetStateAction<StreamSort>>;

  canDownloadM3u: boolean;
  onDownloadM3u: () => void;
  onRefresh: () => void;
};

export const StreamsToolbar = ({
  streamSearchQuery,
  setStreamSearchQuery,
  streamOnlineFilter,
  setStreamOnlineFilter,
  streamSort,
  setStreamSort,
  canDownloadM3u,
  onDownloadM3u,
  onRefresh
}: StreamsToolbarProps) => (
  <div className="flex flex-col gap-3">
    <h2 className="text-lg font-semibold">Streams</h2>
    <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
      <input
        value={streamSearchQuery}
        onChange={(event) => setStreamSearchQuery(event.currentTarget.value)}
        placeholder="Search streams"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <select
        value={streamOnlineFilter}
        onChange={(event) => setStreamOnlineFilter(event.currentTarget.value as StreamOnlineFilter)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-auto"
      >
        <option value="all">All statuses</option>
        <option value="online">Online only</option>
        <option value="offline">Offline only</option>
      </select>
      <select
        value={streamSort}
        onChange={(event) => setStreamSort(event.currentTarget.value as StreamSort)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-auto"
      >
        <option value="name-asc">Sort: name (A → Z)</option>
        <option value="name-desc">Sort: name (Z → A)</option>
        <option value="uptime-desc">Sort: uptime (high → low)</option>
        <option value="uptime-asc">Sort: uptime (low → high)</option>
      </select>
      <button
        onClick={onDownloadM3u}
        disabled={!canDownloadM3u}
        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        Download M3U
      </button>
      <button
        onClick={onRefresh}
        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:w-auto"
      >
        Refresh
      </button>
    </div>
  </div>
);

