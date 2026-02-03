export const buildDownloadProgress = (downloaded: number, monitored: number) => {
  const safeMonitored = Number.isFinite(monitored) ? Math.max(0, Math.floor(monitored)) : 0;
  const safeDownloaded = Number.isFinite(downloaded) ? Math.max(0, Math.floor(downloaded)) : 0;
  const percent = safeMonitored > 0 ? Math.round((safeDownloaded / safeMonitored) * 100) : 0;
  return { monitored: safeMonitored, downloaded: safeDownloaded, percent };
};

