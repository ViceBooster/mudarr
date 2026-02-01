type BandwidthSample = {
  timestamp: number;
  bytes: number;
};

const bandwidthSamples: BandwidthSample[] = [];
const bandwidthWindowMs = 15000;
const minBandwidthWindowMs = 1000;

const pruneBandwidthSamples = (now: number) => {
  const cutoff = now - bandwidthWindowMs;
  while (bandwidthSamples.length > 0 && bandwidthSamples[0]!.timestamp < cutoff) {
    bandwidthSamples.shift();
  }
};

export const recordStreamBandwidth = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const now = Date.now();
  bandwidthSamples.push({ timestamp: now, bytes });
  pruneBandwidthSamples(now);
};

export const getStreamBandwidthBps = () => {
  const now = Date.now();
  pruneBandwidthSamples(now);
  if (bandwidthSamples.length === 0) return 0;
  const totalBytes = bandwidthSamples.reduce((sum, sample) => sum + sample.bytes, 0);
  const oldestTimestamp = bandwidthSamples[0]!.timestamp;
  const windowMs = Math.max(minBandwidthWindowMs, now - oldestTimestamp);
  return Math.max(0, totalBytes / (windowMs / 1000));
};
