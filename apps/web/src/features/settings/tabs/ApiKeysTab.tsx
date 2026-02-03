import React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type IntegrationsStatus = {
  audiodbConfigured: boolean;
  audiodbApiKey?: string | null;
  lastfmConfigured: boolean;
  lastfmApiKey?: string | null;
};

type ApiKeysTabProps = {
  audiodbApiKey: string;
  setAudiodbApiKey: React.Dispatch<React.SetStateAction<string>>;
  showAudiodbKey: boolean;
  setShowAudiodbKey: React.Dispatch<React.SetStateAction<boolean>>;

  lastfmApiKey: string;
  setLastfmApiKey: React.Dispatch<React.SetStateAction<string>>;
  showLastfmKey: boolean;
  setShowLastfmKey: React.Dispatch<React.SetStateAction<boolean>>;

  integrationsStatus: IntegrationsStatus | null;
  integrationsSaveStatus: SaveStatus;
  saveIntegrationSettings: () => void;
};

export const ApiKeysTab = ({
  audiodbApiKey,
  setAudiodbApiKey,
  showAudiodbKey,
  setShowAudiodbKey,
  lastfmApiKey,
  setLastfmApiKey,
  showLastfmKey,
  setShowLastfmKey,
  integrationsStatus,
  integrationsSaveStatus,
  saveIntegrationSettings
}: ApiKeysTabProps) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-700">API keys</h3>
    <p className="mt-1 text-xs text-slate-500">Used for AudioDB metadata and Last.fm genre imports.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          AudioDB API key
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type={showAudiodbKey ? "text" : "password"}
            value={audiodbApiKey}
            onChange={(event) => setAudiodbApiKey(event.currentTarget.value)}
            placeholder="AudioDB API key"
            className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowAudiodbKey((prev) => !prev)}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {showAudiodbKey ? "Hide" : "Show"}
          </button>
        </div>
        {integrationsStatus && (
          <div className="mt-1 text-[10px] text-slate-500">
            {integrationsStatus.audiodbConfigured
              ? integrationsStatus.audiodbApiKey
                ? "Configured (settings)"
                : "Configured (.env)"
              : "Not configured"}
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Last.fm API key
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type={showLastfmKey ? "text" : "password"}
            value={lastfmApiKey}
            onChange={(event) => setLastfmApiKey(event.currentTarget.value)}
            placeholder="Last.fm API key"
            className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowLastfmKey((prev) => !prev)}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {showLastfmKey ? "Hide" : "Show"}
          </button>
        </div>
        {integrationsStatus && (
          <div className="mt-1 text-[10px] text-slate-500">
            {integrationsStatus.lastfmConfigured
              ? integrationsStatus.lastfmApiKey
                ? "Configured (settings)"
                : "Configured (.env)"
              : "Not configured"}
          </div>
        )}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        onClick={saveIntegrationSettings}
        disabled={integrationsSaveStatus === "saving"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        {integrationsSaveStatus === "saving" ? "Saving..." : "Save API keys"}
      </button>
      {integrationsSaveStatus === "saved" && (
        <span className="text-xs text-emerald-600">Saved</span>
      )}
      {integrationsSaveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
    </div>
    <div className="mt-2 text-xs text-slate-500">Leave blank to keep using `.env` values.</div>
  </div>
);

