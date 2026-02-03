import React from "react";

type LoginScreenProps = {
  loginUsername: string;
  setLoginUsername: React.Dispatch<React.SetStateAction<string>>;
  loginPassword: string;
  setLoginPassword: React.Dispatch<React.SetStateAction<string>>;
  authError: string | null;
  onSubmit: () => void;
};

export const LoginScreen = ({
  loginUsername,
  setLoginUsername,
  loginPassword,
  setLoginPassword,
  authError,
  onSubmit
}: LoginScreenProps) => (
  <div className="flex min-h-screen items-center justify-center px-4 py-10">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="text-lg font-semibold text-slate-900">Sign in</div>
      <p className="mt-1 text-sm text-slate-500">Enter the admin credentials.</p>
      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Username
          </div>
          <input
            value={loginUsername}
            onChange={(event) => setLoginUsername(event.currentTarget.value)}
            placeholder="admin"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Password
          </div>
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.currentTarget.value)}
            placeholder="••••••••"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {authError && <div className="mt-3 text-sm text-rose-600">{authError}</div>}
      <button
        onClick={onSubmit}
        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        Sign in
      </button>
    </div>
  </div>
);

