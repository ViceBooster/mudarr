import React, { useEffect } from "react";
import { useParams } from "react-router-dom";

import { ArtistsPage } from "./ArtistsPage";

type ArtistsPageProps = Parameters<typeof ArtistsPage>[0];

export function ArtistsRoute({
  canUseApi,
  selectedArtistId,
  loadArtistDetail,
  resetArtistRoute,
  setExpandedAlbumIds,
  setMonitorNotice,
  artistsPageProps
}: {
  canUseApi: boolean;
  selectedArtistId: number | null;
  loadArtistDetail: (artistId: number) => Promise<void> | void;
  resetArtistRoute: () => void;
  setExpandedAlbumIds: React.Dispatch<React.SetStateAction<number[]>>;
  setMonitorNotice: React.Dispatch<React.SetStateAction<string | null>>;
  artistsPageProps: ArtistsPageProps;
}) {
  const { artistId } = useParams<{ artistId?: string }>();

  // Keep artist detail state in sync with route.
  useEffect(() => {
    if (!canUseApi) return;
    if (artistId) {
      const id = Number(artistId);
      if (Number.isFinite(id) && id !== selectedArtistId) {
        void loadArtistDetail(id);
      }
      return;
    }
    resetArtistRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseApi, artistId, selectedArtistId]);

  // Default expand the most recent album when entering an artist.
  useEffect(() => {
    const artistDetail = artistsPageProps.artistDetail;
    if (!artistDetail || artistDetail.albums.length === 0) {
      setExpandedAlbumIds([]);
      return;
    }
    const albumIds = new Set(artistDetail.albums.map((album) => album.id));
    setExpandedAlbumIds((prev) => {
      const preserved = prev.filter((id) => albumIds.has(id));
      if (preserved.length > 0) {
        return preserved;
      }
      const sorted = [...artistDetail.albums].sort((a, b) => {
        const yearA = a.year ?? 0;
        const yearB = b.year ?? 0;
        if (yearA !== yearB) {
          return yearB - yearA;
        }
        return a.title.localeCompare(b.title);
      });
      return sorted[0] ? [sorted[0].id] : [];
    });
  }, [artistsPageProps.artistDetail, setExpandedAlbumIds]);

  // Auto-clear monitoring notices.
  useEffect(() => {
    if (!artistsPageProps.monitorNotice) return;
    const timer = setTimeout(() => setMonitorNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [artistsPageProps.monitorNotice, setMonitorNotice]);

  // Reset album selection when switching artists.
  useEffect(() => {
    if (!artistsPageProps.artistDetail) {
      artistsPageProps.setSelectedAlbumIds([]);
      return;
    }
    artistsPageProps.setSelectedAlbumIds([]);
  }, [artistsPageProps.artistDetail]);

  // Poll artist detail while downloads are active.
  useEffect(() => {
    const artistDetail = artistsPageProps.artistDetail;
    if (!artistId || !artistDetail) {
      return;
    }
    const hasActiveDownloads = artistDetail.albums.some((album) =>
      album.tracks.some(
        (track) => track.download_status === "queued" || track.download_status === "downloading"
      )
    );
    if (!hasActiveDownloads) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadArtistDetail(artistDetail.artist.id);
    }, 4000);
    return () => {
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, artistsPageProps.artistDetail]);

  return <ArtistsPage {...artistsPageProps} />;
}

