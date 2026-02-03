import React from "react";

type UpdateCheckStatus = "idle" | "loading" | "error" | "success";

type UpdateStatus = {
  currentVersion?: string | null;
  latestVersion?: string | null;
  checkedAt?: string | null;
  message?: string | null;
  updateAvailable?: boolean | null;
  releaseUrl?: string | null;
};

type UpdatesTabProps = {
  updateStatus: UpdateStatus | null;
  updateCheckStatus: UpdateCheckStatus;
  updateCheckError: string | null;
  checkForUpdates: (force: boolean) => void | Promise<unknown>;
};

export const UpdatesTab = ({
  updateStatus,
  updateCheckStatus,
  updateCheckError,
  checkForUpdates
}: UpdatesTabProps) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-700">Updates</h3>
    <p className="mt-1 text-xs text-slate-500">
      Check for new releases and review your current version.
    </p>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-slate-100 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Current version
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-700">
          {updateStatus?.currentVersion ?? "Unknown"}
        </div>
      </div>
      <div className="rounded-lg border border-slate-100 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Latest version
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-700">
          {updateStatus?.latestVersion ?? "Unknown"}
        </div>
      </div>
    </div>
    {updateStatus?.message && <div className="mt-3 text-xs text-slate-500">{updateStatus.message}</div>}
    {updateStatus?.updateAvailable === true && (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-600">
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold">Update available</span>
        {updateStatus.releaseUrl && (
          <a
            href={updateStatus.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-amber-700 hover:underline"
          >
            View release
          </a>
        )}
      </div>
    )}
    {updateStatus?.updateAvailable === false && (
      <div className="mt-3 text-xs text-emerald-600">You&apos;re up to date.</div>
    )}
    {updateStatus?.updateAvailable === null && updateStatus && (
      <div className="mt-3 text-xs text-slate-500">
        Status unknown. Configure update checks to compare versions.
      </div>
    )}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        onClick={() => void checkForUpdates(true)}
        disabled={updateCheckStatus === "loading"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {updateCheckStatus === "loading" ? "Checking..." : "Check for updates"}
      </button>
      {updateCheckStatus === "error" && (
        <span className="text-xs text-rose-600">{updateCheckError ?? "Check failed"}</span>
      )}
      {updateStatus?.checkedAt && (
        <span className="text-xs text-slate-500">
          Last checked: {new Date(updateStatus.checkedAt).toLocaleString()}
        </span>
      )}
    </div>
  </div>
);

