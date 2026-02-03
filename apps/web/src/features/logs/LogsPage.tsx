import React from "react";

type ActivityEvent = {
  id: number;
  message: string;
  created_at: string;
};

type ArtistImportJob = {
  id: number;
  artist_name: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress_stage: string | null;
};

type DownloadJob = {
  id: number;
  status: string;
  query: string;
  display_title?: string | null;
  error: string | null;
  created_at: string;
};

type LogsPageProps = {
  downloadFailedLogs: () => void;
  clearLogs: () => void;
  refreshAll: () => void;

  loadArtistImportJobs: () => void;
  artistImportJobs: ArtistImportJob[];
  cancelArtistImport: (jobId: number, artistName: string) => void;

  filteredActivity: ActivityEvent[];

  clearFailedDownloads: () => void;
  downloads: DownloadJob[];
};

export const LogsPage = ({
  downloadFailedLogs,
  clearLogs,
  refreshAll,
  loadArtistImportJobs,
  artistImportJobs,
  cancelArtistImport,
  filteredActivity,
  clearFailedDownloads,
  downloads
}: LogsPageProps) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">Logs</h2>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={downloadFailedLogs}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Download failed logs
        </button>
        <button
          onClick={clearLogs}
          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
        >
          Clear logs
        </button>
        <button
          onClick={refreshAll}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
    </div>
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Artist imports</h3>
        <button
          onClick={loadArtistImportJobs}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {artistImportJobs.map((job) => (
          <li key={job.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-800">{job.artist_name}</div>
                <div className="text-xs text-slate-500">
                  {job.status === "processing"
                    ? job.progress_stage || "Processing"
                    : job.status === "pending"
                      ? "Queued"
                      : job.status}
                </div>
              </div>
              <button
                onClick={() => cancelArtistImport(job.id, job.artist_name)}
                disabled={job.status !== "pending" && job.status !== "processing"}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </li>
        ))}
        {artistImportJobs.length === 0 && <li className="text-sm text-slate-500">No active imports.</li>}
      </ul>
    </div>
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <ul className="space-y-2 text-sm text-slate-700">
        {filteredActivity.map((event) => (
          <li key={event.id} className="rounded-lg border border-slate-100 p-3">
            <div className="font-semibold text-slate-800">{event.message}</div>
            <div className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</div>
          </li>
        ))}
        {filteredActivity.length === 0 && <li className="text-sm text-slate-500">No activity yet.</li>}
      </ul>
    </div>
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Failed downloads</h3>
        <button
          onClick={clearFailedDownloads}
          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
        >
          Clear failed
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {downloads
          .filter((job) => job.status === "failed")
          .map((job) => (
            <li key={job.id} className="rounded-lg border border-slate-100 p-3">
              <div className="font-semibold text-slate-800">{job.display_title?.trim() || job.query}</div>
              <div className="text-xs text-rose-600">{job.error ?? "Unknown error"}</div>
              <div className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString()}</div>
            </li>
          ))}
        {downloads.filter((job) => job.status === "failed").length === 0 && (
          <li className="text-sm text-slate-500">No failed downloads.</li>
        )}
      </ul>
    </div>
  </section>
);

