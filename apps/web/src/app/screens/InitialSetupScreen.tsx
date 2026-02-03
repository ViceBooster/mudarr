import React from "react";

type InitialSetupScreenProps = {
  setupMediaRoot: string;
  setSetupMediaRoot: React.Dispatch<React.SetStateAction<string>>;
  setupDomain: string;
  setSetupDomain: React.Dispatch<React.SetStateAction<string>>;
  setupPublicApiBaseUrl: string;
  setSetupPublicApiBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  setupAdminUsername: string;
  setSetupAdminUsername: React.Dispatch<React.SetStateAction<string>>;
  setupAdminPassword: string;
  setSetupAdminPassword: React.Dispatch<React.SetStateAction<string>>;
  setupAdminPasswordConfirm: string;
  setSetupAdminPasswordConfirm: React.Dispatch<React.SetStateAction<string>>;
  setupStreamEnabled: boolean;
  setSetupStreamEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setupError: string | null;
  setupSaving: boolean;
  onBrowseStorage: () => void;
  onCompleteSetup: () => void;
};

export const InitialSetupScreen = ({
  setupMediaRoot,
  setSetupMediaRoot,
  setupDomain,
  setSetupDomain,
  setupPublicApiBaseUrl,
  setSetupPublicApiBaseUrl,
  setupAdminUsername,
  setSetupAdminUsername,
  setupAdminPassword,
  setSetupAdminPassword,
  setupAdminPasswordConfirm,
  setSetupAdminPasswordConfirm,
  setupStreamEnabled,
  setSetupStreamEnabled,
  setupError,
  setupSaving,
  onBrowseStorage,
  onCompleteSetup
}: InitialSetupScreenProps) => (
  <div className="flex min-h-screen items-center justify-center px-4 py-10">
    <div className="w-full max-w-3xl space-y-6 rounded-2xl bg-white p-6 shadow-xl">
      <div>
        <div className="text-lg font-semibold text-slate-900">Initial setup</div>
        <p className="mt-1 text-sm text-slate-500">
          Configure storage, access, and streaming before using Mudarr.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Media storage destination
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={setupMediaRoot}
              onChange={(event) => setSetupMediaRoot(event.currentTarget.value)}
              placeholder="/data/music"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={onBrowseStorage}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Browse
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Downloads will be organized by artist and album in this folder.
          </p>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            App domain (frontend)
          </div>
          <input
            value={setupDomain}
            onChange={(event) => setSetupDomain(event.currentTarget.value)}
            placeholder="https://mudarr.example.com"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Optional. Use your frontend URL if you have one.
          </p>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Public API base URL
          </div>
          <input
            value={setupPublicApiBaseUrl}
            onChange={(event) => setSetupPublicApiBaseUrl(event.currentTarget.value)}
            placeholder="https://api.mudarr.example.com"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Optional. Used for shareable stream URLs.
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Admin username
          </div>
          <input
            value={setupAdminUsername}
            onChange={(event) => setSetupAdminUsername(event.currentTarget.value)}
            placeholder="admin"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Admin password
          </div>
          <input
            type="password"
            value={setupAdminPassword}
            onChange={(event) => setSetupAdminPassword(event.currentTarget.value)}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Confirm password
          </div>
          <input
            type="password"
            value={setupAdminPasswordConfirm}
            onChange={(event) => setSetupAdminPasswordConfirm(event.currentTarget.value)}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Streaming
          </div>
          <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={setupStreamEnabled}
              onChange={(event) => setSetupStreamEnabled(event.currentTarget.checked)}
              className="h-4 w-4"
            />
            Enable streaming features
          </label>
        </div>
      </div>
      {setupError && <div className="text-sm text-rose-600">{setupError}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onCompleteSetup}
          disabled={setupSaving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {setupSaving ? "Saving..." : "Complete setup"}
        </button>
      </div>
    </div>
  </div>
);

