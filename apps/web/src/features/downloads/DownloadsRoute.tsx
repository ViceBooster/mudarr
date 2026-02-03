import React, { useEffect } from "react";

import { DownloadsPage } from "./DownloadsPage";

export function DownloadsRoute({
  downloadsPageCount,
  setDownloadsPage,
  downloadsPageProps
}: {
  downloadsPageCount: number;
  setDownloadsPage: React.Dispatch<React.SetStateAction<number>>;
  downloadsPageProps: React.ComponentProps<typeof DownloadsPage>;
}) {
  useEffect(() => {
    setDownloadsPage((prev) => {
      const next = Math.min(Math.max(prev, 1), downloadsPageCount);
      return prev === next ? prev : next;
    });
  }, [downloadsPageCount, setDownloadsPage]);

  return <DownloadsPage {...downloadsPageProps} />;
}

