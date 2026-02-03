import { useEffect, useRef } from "react";
import Hls from "hls.js";

import type { StreamSummary } from "../../app/types";

type Args = {
  playingStreamId: number | null;
  playingStream: StreamSummary | null;
  streamPlayerRef: React.RefObject<HTMLVideoElement>;
  streamHlsUrl: (streamId: number) => string | null;
  reloadKey: string | null;
  setStreamPlayerNotice: (notice: string | null) => void;
};

export function useStreamHlsPlayback({
  playingStreamId,
  playingStream,
  streamPlayerRef,
  streamHlsUrl,
  reloadKey,
  setStreamPlayerNotice
}: Args) {
  const hlsRef = useRef<InstanceType<typeof Hls> | null>(null);

  useEffect(() => {
    if (!playingStreamId) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const video = streamPlayerRef.current;
    if (!video) {
      return;
    }
    const stream = playingStream;
    if (!stream) {
      return;
    }
    const hlsUrl = streamHlsUrl(stream.id);
    if (!hlsUrl) {
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean }) => {
        if (data.fatal) {
          hls.destroy();
          hlsRef.current = null;
          setStreamPlayerNotice("HLS playback error. Please try refreshing.");
        }
      });
    } else {
      const canPlay =
        video.canPlayType("application/vnd.apple.mpegurl") ||
        video.canPlayType("application/x-mpegURL");
      if (canPlay) {
        video.src = hlsUrl;
        video.load();
      } else {
        setStreamPlayerNotice("HLS not supported in this browser.");
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // reloadKey is an intentional dependency (token/status/encoding changes)
  }, [playingStreamId, reloadKey]);
}

