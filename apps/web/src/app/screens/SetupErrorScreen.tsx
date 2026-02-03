import React from "react";

type SetupErrorScreenProps = {
  setupError: string | null;
  onRetry: () => void;
};

export const SetupErrorScreen = ({ setupError, onRetry }: SetupErrorScreenProps) => (
  <div className="flex min-h-screen items-center justify-center px-4 py-10">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="text-lg font-semibold text-slate-800">Setup error</div>
      <p className="mt-2 text-sm text-slate-600">
        {setupError ?? "Unable to load initial setup status."}
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        Retry
      </button>
    </div>
  </div>
);

