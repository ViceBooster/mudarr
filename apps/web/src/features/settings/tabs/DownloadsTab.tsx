import React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type DownloadSettings = {
  concurrency?: number | null;
};

type DownloadsTabProps = {
  downloadConcurrency: number;
  setDownloadConcurrency: React.Dispatch<React.SetStateAction<number>>;
  saveDownloadSettings: () => void;
  downloadSaveStatus: SaveStatus;
  downloadSettings: DownloadSettings | null;
};

export const DownloadsTab = ({
  downloadConcurrency,
  setDownloadConcurrency,
  saveDownloadSettings,
  downloadSaveStatus,
  downloadSettings
}: DownloadsTabProps) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-700">Downloads</h3>
    <p className="mt-1 text-xs text-slate-500">
      Control how many downloads run at once. Max 10. Changes apply after the worker restarts.
    </p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <input
        type="number"
        min={1}
        max={10}
        step={1}
        value={downloadConcurrency}
        onChange={(event) => setDownloadConcurrency(Number(event.currentTarget.value) || 1)}
        className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <button
        onClick={saveDownloadSettings}
        disabled={downloadSaveStatus === "saving"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        {downloadSaveStatus === "saving" ? "Saving..." : "Save downloads"}
      </button>
      {downloadSaveStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
      {downloadSaveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
      {downloadSettings && (
        <span className="text-xs text-slate-500">Current: {downloadSettings.concurrency ?? 2}</span>
      )}
    </div>
  </div>
);

