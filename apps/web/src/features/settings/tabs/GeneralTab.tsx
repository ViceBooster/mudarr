import React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type GeneralTabProps = {
  generalMediaRoot: string;
  setGeneralMediaRoot: React.Dispatch<React.SetStateAction<string>>;
  generalDomain: string;
  setGeneralDomain: React.Dispatch<React.SetStateAction<string>>;
  generalPublicApiBaseUrl: string;
  setGeneralPublicApiBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  generalSaveStatus: SaveStatus;
  saveGeneralSettings: () => void;
  onBrowseStorage: () => void;

  adminUsername: string;
  setAdminUsername: React.Dispatch<React.SetStateAction<string>>;
  adminPassword: string;
  setAdminPassword: React.Dispatch<React.SetStateAction<string>>;
  adminPasswordConfirm: string;
  setAdminPasswordConfirm: React.Dispatch<React.SetStateAction<string>>;
  adminSaveStatus: SaveStatus;
  saveAdminSettings: () => void;
};

export const GeneralTab = ({
  generalMediaRoot,
  setGeneralMediaRoot,
  generalDomain,
  setGeneralDomain,
  generalPublicApiBaseUrl,
  setGeneralPublicApiBaseUrl,
  generalSaveStatus,
  saveGeneralSettings,
  onBrowseStorage,
  adminUsername,
  setAdminUsername,
  adminPassword,
  setAdminPassword,
  adminPasswordConfirm,
  setAdminPasswordConfirm,
  adminSaveStatus,
  saveAdminSettings
}: GeneralTabProps) => (
  <div className="space-y-4">
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">General</h3>
      <p className="mt-1 text-xs text-slate-500">Storage and domain settings for this server.</p>
      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Media storage destination
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={generalMediaRoot}
              onChange={(event) => setGeneralMediaRoot(event.currentTarget.value)}
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
          <p className="mt-2 text-xs text-slate-500">Downloads land here. Restart the worker to apply changes.</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            App domain (frontend)
          </div>
          <input
            value={generalDomain}
            onChange={(event) => setGeneralDomain(event.currentTarget.value)}
            placeholder="https://mudarr.example.com"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">Optional. Used for links in the UI or docs you share.</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Public API base URL
          </div>
          <input
            value={generalPublicApiBaseUrl}
            onChange={(event) => setGeneralPublicApiBaseUrl(event.currentTarget.value)}
            placeholder="https://api.mudarr.example.com"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">
            Optional. Used for shareable stream URLs. Leave blank in dev.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={saveGeneralSettings}
          disabled={generalSaveStatus === "saving"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {generalSaveStatus === "saving" ? "Saving..." : "Save general"}
        </button>
        {generalSaveStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
        {generalSaveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
      </div>
    </div>

    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">Admin access</h3>
      <p className="mt-1 text-xs text-slate-500">Update the admin username or rotate the password.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Admin username
          </div>
          <input
            value={adminUsername}
            onChange={(event) => setAdminUsername(event.currentTarget.value)}
            placeholder="admin"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            New password
          </div>
          <input
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.currentTarget.value)}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Confirm password
          </div>
          <input
            type="password"
            value={adminPasswordConfirm}
            onChange={(event) => setAdminPasswordConfirm(event.currentTarget.value)}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Changing the username requires setting a new password.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={saveAdminSettings}
          disabled={adminSaveStatus === "saving"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {adminSaveStatus === "saving" ? "Saving..." : "Save admin"}
        </button>
        {adminSaveStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
        {adminSaveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
      </div>
    </div>
  </div>
);

