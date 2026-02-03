import React from "react";

type StorageBrowseEntry = {
  path: string;
  name: string;
};

type StorageBrowserModalProps = {
  open: boolean;
  currentPath: string | null;
  parentPath: string | null;
  entries: StorageBrowseEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onUseThisFolder: () => void;
};

export const StorageBrowserModal = ({
  open,
  currentPath,
  parentPath,
  entries,
  loading,
  error,
  onClose,
  onNavigate,
  onUseThisFolder
}: StorageBrowserModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">Select a folder</div>
            <div className="text-xs text-slate-500">{currentPath ?? "Loading..."}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => parentPath && onNavigate(parentPath)}
            disabled={!parentPath}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Up one level
          </button>
          <button
            onClick={onUseThisFolder}
            disabled={!currentPath}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use this folder
          </button>
        </div>
        {error && <div className="mt-3 text-xs text-rose-600">{error}</div>}
        <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-100">
          {loading && <div className="px-4 py-3 text-sm text-slate-500">Loading folders...</div>}
          {!loading &&
            entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => onNavigate(entry.path)}
                className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
              >
                <span className="text-slate-400">📁</span>
                {entry.name}
              </button>
            ))}
          {!loading && entries.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500">No folders found.</div>
          )}
        </div>
      </div>
    </div>
  );
};

