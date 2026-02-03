import React, { useEffect, useState } from "react";

import { loadingJokes } from "../../constants/copy";
import { LOADING_MIN_MS } from "../../constants/ui";

type LoadingScreenProps = {
  show: boolean;
};

export const LoadingScreen = ({ show }: LoadingScreenProps) => {
  const [loadingJokeIndex, setLoadingJokeIndex] = useState(0);
  const [loadingHoldUntil, setLoadingHoldUntil] = useState<number | null>(null);

  const isVisible = show || (loadingHoldUntil !== null && Date.now() < loadingHoldUntil);
  const loadingJoke = loadingJokes[loadingJokeIndex % loadingJokes.length] ?? "Loading...";

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    setLoadingJokeIndex(Math.floor(Math.random() * loadingJokes.length));
  }, [isVisible]);

  useEffect(() => {
    if (show) {
      if (loadingHoldUntil === null) {
        setLoadingHoldUntil(Date.now() + LOADING_MIN_MS);
      }
      return;
    }
    if (loadingHoldUntil === null) {
      return;
    }
    const remaining = loadingHoldUntil - Date.now();
    if (remaining <= 0) {
      setLoadingHoldUntil(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setLoadingHoldUntil(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [show, loadingHoldUntil]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-white px-6 py-6 text-center shadow-sm">
        <img
          src="/mudarr_cropped.png"
          alt="Mudarr"
          className="h-auto w-full max-w-xs object-contain"
        />
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <span>Loading Mudarr...</span>
        </div>
        <div className="text-xs text-slate-500">{loadingJoke}</div>
      </div>
    </div>
  );
};

