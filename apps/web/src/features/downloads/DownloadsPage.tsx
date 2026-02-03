import React from "react";

type DownloadJob = {
  id: number;
  status: string;
  query: string;
  display_title?: string | null;
  quality?: string | null;
  progress_percent?: number | null;
  progress_stage?: string | null;
  progress_detail?: string | null;
  error: string | null;
};

type DownloadsPageProps = {
  activeDownloadCounts: { total: number };
  clearActiveDownloads: () => void;
  downloadsPageItems: DownloadJob[];
  downloadsForDisplayCount: number;
  cancelDownload: (jobId: number, displayTitle: string) => void;
  downloadsPage: number;
  downloadsPageCount: number;
  setDownloadsPage: React.Dispatch<React.SetStateAction<number>>;
};

export const DownloadsPage = ({
  activeDownloadCounts,
  clearActiveDownloads,
  downloadsPageItems,
  downloadsForDisplayCount,
  cancelDownload,
  downloadsPage,
  downloadsPageCount,
  setDownloadsPage
}: DownloadsPageProps) => (
  <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Downloads</h2>
      <button
        onClick={clearActiveDownloads}
        disabled={activeDownloadCounts.total === 0}
        className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Clear active
      </button>
    </div>
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <ul className="space-y-2 text-sm">
        {downloadsPageItems.map((job) => {
          const sanitizedDetail =
            job.progress_detail && !/^(NA|N\/A)$/i.test(job.progress_detail)
              ? job.progress_detail
              : null;
          const stageLabel =
            job.progress_stage === "processing"
              ? sanitizedDetail ?? "Converting"
              : job.progress_stage === "finalizing"
                ? "Finalizing"
                : job.progress_stage === "download"
                  ? "Downloading"
                  : job.status;
          const hasPercent =
            typeof job.progress_percent === "number" && Number.isFinite(job.progress_percent);
          const displayPercent = hasPercent ? job.progress_percent : null;
          const displayTitle = job.display_title?.trim() || job.query;
          return (
            <li
              key={job.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-100 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-semibold text-slate-900">{displayTitle}</div>
                <div className="text-xs text-slate-500">
                  Status: {job.status}
                  {job.quality ? ` · ${job.quality}` : ""}
                  {job.status === "downloading" ? ` · ${stageLabel}` : ""}
                </div>
                {job.status === "downloading" && (
                  <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full bg-indigo-500 ${
                        !hasPercent ? "animate-pulse w-1/3" : ""
                      }`}
                      style={
                        !hasPercent ? undefined : { width: `${Math.max(displayPercent ?? 0, 1)}%` }
                      }
                    />
                  </div>
                )}
                {job.status === "downloading" && hasPercent && (
                  <div className="text-xs text-slate-500">{displayPercent}% complete</div>
                )}
                {job.status === "downloading" && !hasPercent && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {job.progress_stage === "processing" && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    )}
                    <span>{stageLabel}…</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => cancelDownload(job.id, displayTitle)}
                  className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Remove
                </button>
                {job.error && <div className="text-xs text-rose-600">{job.error}</div>}
              </div>
            </li>
          );
        })}
        {downloadsPageItems.length === 0 && (
          <li className="text-sm text-slate-500">No downloads are queued or in progress.</li>
        )}
      </ul>
      {downloadsForDisplayCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing {downloadsPageItems.length} of {downloadsForDisplayCount}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDownloadsPage((prev) => Math.max(1, prev - 1))}
              disabled={downloadsPage <= 1}
              className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prev
            </button>
            <span>
              Page {downloadsPage} of {downloadsPageCount}
            </span>
            <button
              onClick={() => setDownloadsPage((prev) => Math.min(downloadsPageCount, prev + 1))}
              disabled={downloadsPage >= downloadsPageCount}
              className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  </section>
);

