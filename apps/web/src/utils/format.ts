export const formatVersionLabel = (value: string | null | undefined) => {
  if (!value) return "Version unknown";
  const trimmed = value.trim();
  if (!trimmed) return "Version unknown";
  return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed : `v${trimmed}`;
};

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

export const formatBandwidth = (bytesPerSecond: number | null | undefined) => {
  const value =
    typeof bytesPerSecond === "number" && Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
      ? bytesPerSecond
      : 0;
  const bitsPerSecond = value * 8;
  if (bitsPerSecond <= 0) return "0 bps";
  const units = ["bps", "kbps", "Mbps", "Gbps", "Tbps"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bitsPerSecond) / Math.log(1000)));
  const display = bitsPerSecond / Math.pow(1000, index);
  const rounded = display.toFixed(display >= 10 || index === 0 ? 0 : 1);
  return `${rounded} ${units[index]}`;
};

export const formatDuration = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return "Unknown";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

export const formatElapsed = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined || seconds < 0) {
    return "0:00:00";
  }
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export const formatBitrate = (bitRate: number | null | undefined) => {
  if (!Number.isFinite(bitRate) || !bitRate || bitRate <= 0) return "Unknown";
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bitRate) / Math.log(1000)));
  const value = bitRate / Math.pow(1000, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

export const formatResolution = (width?: number | null, height?: number | null) => {
  if (width && height) {
    return `${width}×${height}`;
  }
  if (height) {
    return `${height}p`;
  }
  return "Unknown";
};

