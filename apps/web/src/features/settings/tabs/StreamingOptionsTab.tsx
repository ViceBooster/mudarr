import React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type StreamingOptionsTabProps = {
  streamEnabled: boolean;
  setStreamEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  streamToken: string;
  setStreamToken: React.Dispatch<React.SetStateAction<string>>;
  streamTokenStatus: SaveStatus;
  saveStreamToken: () => void;
  regenerateStreamToken: () => void;
};

export const StreamingOptionsTab = ({
  streamEnabled,
  setStreamEnabled,
  streamToken,
  setStreamToken,
  streamTokenStatus,
  saveStreamToken,
  regenerateStreamToken
}: StreamingOptionsTabProps) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-700">Streaming</h3>
    <p className="mt-1 text-xs text-slate-500">Configure streaming availability and access credentials.</p>
    <div className="mt-4 space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Streaming availability
        </div>
        <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={streamEnabled}
            onChange={(event) => setStreamEnabled(event.currentTarget.checked)}
            className="h-4 w-4"
          />
          Enable streaming features
        </label>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Stream access token
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Required for stream URLs. Rotate if you suspect unauthorized access.
        </p>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={streamToken}
            onChange={(event) => setStreamToken(event.currentTarget.value)}
            placeholder="Stream token"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={saveStreamToken}
            disabled={streamTokenStatus === "saving"}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {streamTokenStatus === "saving" ? "Saving..." : "Save settings"}
          </button>
          <button
            onClick={regenerateStreamToken}
            disabled={streamTokenStatus === "saving"}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Regenerate
          </button>
          {streamTokenStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
          {streamTokenStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
        </div>
        <div className="mt-2 text-xs text-slate-500">Applies to Streams playlists and item endpoints.</div>
      </div>
    </div>
  </div>
);

