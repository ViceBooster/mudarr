import { useEffect, useMemo, useState } from "react";

import type { StreamSummary } from "../../app/types";

type ApiGet = <T>(path: string, options?: RequestInit) => Promise<T>;

type Args = {
  canUseApi: boolean;
  streamsEnabled: boolean;
  apiGet: ApiGet;
  pollIntervalMs?: number;
};

export function useActiveStreamsCount({
  canUseApi,
  streamsEnabled,
  apiGet,
  pollIntervalMs
}: Args) {
  const [activeStreamsCount, setActiveStreamsCount] = useState(0);

  const intervalMs = useMemo(() => {
    const raw = typeof pollIntervalMs === "number" ? pollIntervalMs : 7500;
    if (!Number.isFinite(raw)) return 7500;
    const clamped = Math.floor(raw);
    return clamped >= 2000 ? clamped : 2000;
  }, [pollIntervalMs]);

  useEffect(() => {
    if (!streamsEnabled) {
      setActiveStreamsCount(0);
      return;
    }
    if (!canUseApi) {
      setActiveStreamsCount(0);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiGet<StreamSummary[]>("/api/streams");
        if (cancelled) return;
        const count = data.filter((stream) => stream.status === "active" && stream.onlineSeconds !== null).length;
        setActiveStreamsCount(count);
      } catch {
        // Keep last known count; avoid spamming global error UI for a nav badge.
      }
    };

    void load();
    const interval = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiGet, canUseApi, intervalMs, streamsEnabled]);

  return { activeStreamsCount };
}

