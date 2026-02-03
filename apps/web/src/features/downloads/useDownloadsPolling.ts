import { useEffect, useRef } from "react";

export function useDownloadsPolling({
  activeDownloadCount,
  pathname,
  loadDownloadsOnly,
  loadArtistsOnly
}: {
  activeDownloadCount: number;
  pathname: string;
  loadDownloadsOnly: () => Promise<void> | void;
  loadArtistsOnly: () => Promise<void> | void;
}) {
  // Poll downloads - fast when active, slow when idle
  const downloadsIntervalRef = useRef<number | null>(null);
  const lastDownloadPollMode = useRef<"fast" | "slow" | null>(null);

  useEffect(() => {
    const hasActiveDownloads = activeDownloadCount > 0;
    const shouldPollFast = hasActiveDownloads || pathname === "/downloads";
    const currentMode = shouldPollFast ? "fast" : "slow";

    const pollDownloads = () => {
      void loadDownloadsOnly();
      if (hasActiveDownloads) {
        void loadArtistsOnly();
      }
    };

    // Create or recreate interval when mode changes
    if (downloadsIntervalRef.current === null || currentMode !== lastDownloadPollMode.current) {
      if (downloadsIntervalRef.current !== null) {
        window.clearInterval(downloadsIntervalRef.current);
      }
      const intervalMs = shouldPollFast ? 2000 : 15000;
      downloadsIntervalRef.current = window.setInterval(() => {
        pollDownloads();
      }, intervalMs);
      lastDownloadPollMode.current = currentMode;
    }
    pollDownloads();

    return () => {
      if (downloadsIntervalRef.current !== null) {
        window.clearInterval(downloadsIntervalRef.current);
        downloadsIntervalRef.current = null;
      }
    };
  }, [activeDownloadCount, pathname, loadArtistsOnly, loadDownloadsOnly]);
}

