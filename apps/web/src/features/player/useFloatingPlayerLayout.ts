import { useCallback, useEffect, useRef, useState } from "react";

import {
  PLAYER_COMPACT_HEIGHT,
  PLAYER_COMPACT_WIDTH,
  PLAYER_DEFAULT_HEIGHT,
  PLAYER_DEFAULT_WIDTH
} from "../../constants/ui";

type PlayerMode = "full" | "compact";
type PlayerPosition = { x: number; y: number };

export function useFloatingPlayerLayout({ hasPlayback }: { hasPlayback: boolean }) {
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);
  const [playerMode, setPlayerMode] = useState<PlayerMode>("full");
  const [isDraggingPlayer, setIsDraggingPlayer] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const playerDragOffset = useRef<PlayerPosition>({ x: 0, y: 0 });

  const getPlayerSize = useCallback((mode: PlayerMode) => {
    if (mode === "compact") {
      return { width: PLAYER_COMPACT_WIDTH, height: PLAYER_COMPACT_HEIGHT };
    }
    return { width: PLAYER_DEFAULT_WIDTH, height: PLAYER_DEFAULT_HEIGHT };
  }, []);

  const getDefaultPlayerPosition = useCallback(
    (mode: PlayerMode) => {
      if (typeof window === "undefined") {
        return { x: 16, y: 16 };
      }
      const { width, height } = getPlayerSize(mode);
      if (mode === "compact") {
        const inset = window.innerWidth >= 768 ? 24 : 16;
        return {
          x: inset,
          y: Math.max(inset, window.innerHeight - height - inset)
        };
      }
      return {
        x: Math.max(16, Math.round(window.innerWidth / 2 - width / 2)),
        y: Math.max(16, window.innerHeight - height - 16)
      };
    },
    [getPlayerSize]
  );

  const resetPlayerSize = useCallback(
    (mode: PlayerMode) => {
      const { width, height } = getPlayerSize(mode);
      if (playerRef.current) {
        playerRef.current.style.width = `${width}px`;
        playerRef.current.style.height = `${height}px`;
      }
    },
    [getPlayerSize]
  );

  const clampPlayerPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") {
      return { x, y };
    }
    const rect = playerRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 640;
    const height = rect?.height ?? 240;
    const maxX = Math.max(16, window.innerWidth - width - 16);
    const maxY = Math.max(16, window.innerHeight - height - 16);
    return {
      x: Math.min(Math.max(16, x), maxX),
      y: Math.min(Math.max(16, y), maxY)
    };
  }, []);

  useEffect(() => {
    if (!hasPlayback) {
      return;
    }
    setPlayerPosition((prev) => prev ?? getDefaultPlayerPosition(playerMode));
  }, [hasPlayback, getDefaultPlayerPosition, playerMode]);

  useEffect(() => {
    if (!playerPosition) {
      return;
    }
    const handleResize = () => {
      setPlayerPosition((prev) => {
        if (!prev) {
          return prev;
        }
        if (playerMode === "compact") {
          return getDefaultPlayerPosition("compact");
        }
        return clampPlayerPosition(prev.x, prev.y);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [playerPosition, playerMode, clampPlayerPosition, getDefaultPlayerPosition]);

  useEffect(() => {
    if (!isDraggingPlayer) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const next = clampPlayerPosition(
        event.clientX - playerDragOffset.current.x,
        event.clientY - playerDragOffset.current.y
      );
      setPlayerPosition(next);
    };
    const handleUp = () => {
      setIsDraggingPlayer(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDraggingPlayer, clampPlayerPosition]);

  const handlePlayerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (playerMode === "compact") {
        return;
      }
      if (!playerRef.current) {
        return;
      }
      const rect = playerRef.current.getBoundingClientRect();
      playerDragOffset.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      setIsDraggingPlayer(true);
    },
    [playerMode]
  );

  const dockPlayer = useCallback(() => {
    setPlayerMode("compact");
    resetPlayerSize("compact");
    setPlayerPosition(getDefaultPlayerPosition("compact"));
  }, [getDefaultPlayerPosition, resetPlayerSize]);

  const expandPlayer = useCallback(() => {
    setPlayerMode("full");
    resetPlayerSize("full");
    setPlayerPosition(getDefaultPlayerPosition("full"));
  }, [getDefaultPlayerPosition, resetPlayerSize]);

  return {
    playerRef,
    playerPosition,
    playerMode,
    isDraggingPlayer,
    handlePlayerPointerDown,
    dockPlayer,
    expandPlayer
  };
}

