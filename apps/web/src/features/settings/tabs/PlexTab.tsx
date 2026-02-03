import React from "react";

type PlexStatus = {
  enabled: boolean;
  configured: boolean;
};

type PlexTabProps = {
  plexStatus: PlexStatus | null;
  plexBaseUrl: string;
  setPlexBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  plexToken: string;
  setPlexToken: React.Dispatch<React.SetStateAction<string>>;
  plexSectionId: string;
  setPlexSectionId: React.Dispatch<React.SetStateAction<string>>;
  savePlexSettings: () => void | Promise<unknown>;
  refreshPlex: () => void | Promise<unknown>;
  scanPlex: () => void | Promise<unknown>;
};

export const PlexTab = ({
  plexStatus,
  plexBaseUrl,
  setPlexBaseUrl,
  plexToken,
  setPlexToken,
  plexSectionId,
  setPlexSectionId,
  savePlexSettings,
  refreshPlex,
  scanPlex
}: PlexTabProps) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-700">Plex</h3>
    {plexStatus ? (
      <p className="mt-1 text-xs text-slate-500">
        Status: {plexStatus.enabled ? "enabled" : "disabled"} /{" "}
        {plexStatus.configured ? "configured" : "not configured"}
      </p>
    ) : (
      <p className="mt-1 text-xs text-slate-500">Loading Plex status...</p>
    )}
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <input
        value={plexBaseUrl}
        onChange={(event) => setPlexBaseUrl(event.currentTarget.value)}
        placeholder="Plex base URL"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={plexToken}
        onChange={(event) => setPlexToken(event.currentTarget.value)}
        placeholder="Plex token"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={plexSectionId}
        onChange={(event) => setPlexSectionId(event.currentTarget.value)}
        placeholder="Library section ID"
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
      <button
        onClick={savePlexSettings}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Save
      </button>
      <button
        onClick={refreshPlex}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Refresh library
      </button>
      <button
        onClick={scanPlex}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Scan library
      </button>
    </div>
  </div>
);

