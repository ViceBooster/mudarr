import pool from "../db/pool.js";
import { getStreamBandwidthBps } from "./streamMetrics.js";
import { getActiveConnectionsCount } from "../routes/streams.js";

const SAMPLE_INTERVAL_MS = 5000;
const RETENTION_INTERVAL_SQL = "4 hours";

let interval: NodeJS.Timeout | null = null;
let sampling = false;

const recordStatsSample = async () => {
  if (sampling) return;
  sampling = true;
  try {
    const activeConnections = getActiveConnectionsCount();
    const bandwidthBps = Math.round(getStreamBandwidthBps());
    await pool.query(
      "INSERT INTO stats_samples (sampled_at, active_connections, bandwidth_bps) VALUES (NOW(), $1, $2)",
      [activeConnections, bandwidthBps]
    );
    await pool.query(
      `DELETE FROM stats_samples WHERE sampled_at < NOW() - INTERVAL '${RETENTION_INTERVAL_SQL}'`
    );
  } catch (error) {
    console.error("Failed to record stats sample", error);
  } finally {
    sampling = false;
  }
};

export const startStatsSampler = () => {
  if (interval) return;
  void recordStatsSample();
  interval = setInterval(() => {
    void recordStatsSample();
  }, SAMPLE_INTERVAL_MS);
};
