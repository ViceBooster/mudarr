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
  const downloadsInFlight = useRef(false);
  const artistsInFlight = useRef(false);
  const lastArtistsPollAt = useRef(0);

  const shouldPollArtists = (hasActiveDownloads: boolean) => {
    if (pathname === "/artists") return true;
    return hasActiveDownloads;
  };

  useEffect(() => {
    const hasActiveDownloads = activeDownloadCount > 0;
    const shouldPollFast = hasActiveDownloads || pathname === "/downloads";
    const currentMode = shouldPollFast ? "fast" : "slow";
    const artistsPollIntervalMs = pathname === "/artists" ? 5000 : 10000;

    const pollDownloads = async () => {
      if (!downloadsInFlight.current) {
        downloadsInFlight.current = true;
        try {
          await loadDownloadsOnly();
        } finally {
          downloadsInFlight.current = false;
        }
      }
      if (shouldPollArtists(hasActiveDownloads)) {
        const now = Date.now();
        if (now - lastArtistsPollAt.current >= artistsPollIntervalMs && !artistsInFlight.current) {
          artistsInFlight.current = true;
          lastArtistsPollAt.current = now;
          try {
            await loadArtistsOnly();
          } finally {
            artistsInFlight.current = false;
          }
        }
      }
    };

    // Create or recreate interval when mode changes
    if (downloadsIntervalRef.current === null || currentMode !== lastDownloadPollMode.current) {
      if (downloadsIntervalRef.current !== null) {
        window.clearInterval(downloadsIntervalRef.current);
      }
      const intervalMs = shouldPollFast ? 2000 : 15000;
      downloadsIntervalRef.current = window.setInterval(() => {
        void pollDownloads();
      }, intervalMs);
      lastDownloadPollMode.current = currentMode;
    }
    void pollDownloads();

    return () => {
      if (downloadsIntervalRef.current !== null) {
        window.clearInterval(downloadsIntervalRef.current);
        downloadsIntervalRef.current = null;
      }
    };
  }, [activeDownloadCount, pathname, loadArtistsOnly, loadDownloadsOnly]);
}

