import React from "react";

import type { YoutubeSearchContext, YoutubeSearchResult } from "../../app/types";
import { formatDuration } from "../../utils/format";

type YoutubeOptionsModalProps = {
  context: YoutubeSearchContext | null;
  onClose: () => void;

  youtubeSearchQuery: string;
  setYoutubeSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  onSearch: () => void | Promise<unknown>;
  loading: boolean;
  error: string | null;

  results: YoutubeSearchResult[];
  youtubeSearchQuality: Record<string, string>;
  setYoutubeSearchQuality: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  downloadYoutubeResult: (result: YoutubeSearchResult) => void | Promise<unknown>;
};

export function YoutubeOptionsModal({
  context,
  onClose,
  youtubeSearchQuery,
  setYoutubeSearchQuery,
  onSearch,
  loading,
  error,
  results,
  youtubeSearchQuality,
  setYoutubeSearchQuality,
  downloadYoutubeResult
}: YoutubeOptionsModalProps) {
  if (!context) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4 py-6">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">YouTube options</div>
            <div className="mt-1 text-xs text-slate-500">
              {context.artistName} · {context.trackTitle}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={youtubeSearchQuery}
            onChange={(event) => setYoutubeSearchQuery(event.currentTarget.value)}
            placeholder="Search YouTube..."
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={() => void onSearch()}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
          {loading && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                </span>
                Searching YouTube...
              </div>
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <div className="h-16 w-28 rounded-lg bg-slate-100 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
                      <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No results yet. Try a different search phrase.
            </div>
          )}
          {results.map((result) => (
            <div
              key={result.id}
              className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/30 p-4 shadow-sm md:flex-row md:items-center"
            >
              <div className="h-20 w-32 overflow-hidden rounded-xl bg-slate-200">
                {result.thumbnail ? (
                  <img
                    src={result.thumbnail}
                    alt={result.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                    No preview
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-sm font-semibold text-slate-900">{result.title}</div>
                <div className="text-xs text-slate-500">
                  {result.channel || "Unknown channel"} · {formatDuration(result.duration)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.qualities.length > 0 ? (
                    result.qualities.map((quality) => (
                      <span
                        key={quality}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500"
                      >
                        {quality}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-400">Qualities unknown</span>
                  )}
                </div>
              </div>
              <div className="flex flex-row items-center gap-2 md:flex-col md:items-end">
                <select
                  value={youtubeSearchQuality[result.id] ?? ""}
                  onChange={(event) =>
                    setYoutubeSearchQuality((prev) => ({
                      ...prev,
                      [result.id]: event.currentTarget.value
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                >
                  <option value="">Auto (best)</option>
                  {result.qualities.map((quality) => (
                    <option key={quality} value={quality}>
                      {quality}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void downloadYoutubeResult(result)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

