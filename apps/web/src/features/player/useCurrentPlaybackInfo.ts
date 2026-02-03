import { useEffect, useState } from "react";

import type { TrackMediaInfo } from "../../app/types";

type ApiGet = <T>(path: string) => Promise<T>;

export function useCurrentPlaybackInfo({
  apiGet,
  trackId
}: {
  apiGet: ApiGet;
  trackId: number | null;
}) {
  const [currentPlaybackInfo, setCurrentPlaybackInfo] = useState<TrackMediaInfo | null>(null);
  const [currentPlaybackInfoStatus, setCurrentPlaybackInfoStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");

  useEffect(() => {
    if (!trackId) {
      setCurrentPlaybackInfo(null);
      setCurrentPlaybackInfoStatus("idle");
    }
  }, [trackId]);

  useEffect(() => {
    if (!trackId) {
      return;
    }
    let active = true;
    setCurrentPlaybackInfoStatus("loading");
    apiGet<TrackMediaInfo>(`/api/tracks/${trackId}/media-info`)
      .then((info) => {
        if (!active) return;
        setCurrentPlaybackInfo(info);
        setCurrentPlaybackInfoStatus("idle");
      })
      .catch(() => {
        if (!active) return;
        setCurrentPlaybackInfo(null);
        setCurrentPlaybackInfoStatus("error");
      });
    return () => {
      active = false;
    };
  }, [apiGet, trackId]);

  return { currentPlaybackInfo, currentPlaybackInfoStatus };
}

