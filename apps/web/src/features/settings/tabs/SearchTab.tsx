import React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SearchSettings = {
  skipNonOfficialMusicVideos: boolean;
};

type SearchTabProps = {
  skipNonOfficialMusicVideos: boolean;
  setSkipNonOfficialMusicVideos: React.Dispatch<React.SetStateAction<boolean>>;
  saveSearchSettings: () => void | Promise<unknown>;
  searchSaveStatus: SaveStatus;
  searchSettings: SearchSettings | null;
};

export const SearchTab = ({
  skipNonOfficialMusicVideos,
  setSkipNonOfficialMusicVideos,
  saveSearchSettings,
  searchSaveStatus,
  searchSettings
}: SearchTabProps) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-700">Search options</h3>
    <p className="mt-1 text-xs text-slate-500">
      Fine-tune how auto downloads match YouTube results.
    </p>
    <div className="mt-4">
      <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={skipNonOfficialMusicVideos}
          onChange={(event) => setSkipNonOfficialMusicVideos(event.currentTarget.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="block font-semibold text-slate-700">Skip non-official music videos</span>
          <span className="mt-1 block text-xs text-slate-500">
            When enabled, monitored/auto downloads are skipped unless the YouTube title includes
            &quot;Official Music Video&quot;. Manual downloads are not affected.
          </span>
        </span>
      </label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        onClick={saveSearchSettings}
        disabled={searchSaveStatus === "saving"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        {searchSaveStatus === "saving" ? "Saving..." : "Save search options"}
      </button>
      {searchSaveStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
      {searchSaveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
      {searchSettings && (
        <span className="text-xs text-slate-500">
          Current: {searchSettings.skipNonOfficialMusicVideos ? "On" : "Off"}
        </span>
      )}
    </div>
  </div>
);

