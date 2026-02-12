import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { getStreamBandwidthBps } from "../services/streamMetrics.js";
import { getActiveConnectionsCount } from "./streams.js";
import pool from "../db/pool.js";
import { getMemoryUsagePercent, sampleCpuUsagePercent, type CpuSnapshot } from "../services/systemStats.js";

const router = Router();
let lastCpuSnapshot: CpuSnapshot | null = null;

router.get("/history", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (EXTRACT(EPOCH FROM sampled_at) * 1000)::bigint AS timestamp,
        active_connections,
        bandwidth_bps,
        cpu_usage_percent,
        memory_usage_percent
      FROM stats_samples
      WHERE sampled_at >= NOW() - INTERVAL '4 hours'
      ORDER BY sampled_at ASC
    `);
    const samples = result.rows.map((row) => ({
      timestamp: Number(row.timestamp),
      activeConnections: Number(row.active_connections ?? 0),
      bandwidthBps: Number(row.bandwidth_bps ?? 0),
      cpuUsagePercent: Number(row.cpu_usage_percent ?? 0),
      memoryUsagePercent: Number(row.memory_usage_percent ?? 0)
    }));
    res.json(samples);
  } catch (error: any) {
    if (error?.code === "42P01") {
      return res.json([]);
    }
    console.error("Failed to load stats history", error);
    res.status(500).json({ error: "Failed to load stats history" });
  }
});

router.get("/", async (_req, res) => {
  const artistResult = await pool.query("SELECT COUNT(*)::int AS count FROM artists");
  const artists = artistResult.rows[0]?.count ?? 0;

  const filesResult = await pool.query(
    "SELECT file_path FROM videos WHERE status = 'completed' AND file_path IS NOT NULL"
  );
  const seen = new Set<string>();
  let totalBytes = 0;
  let missingFiles = 0;

  let samplePath: string | null = null;
  for (const row of filesResult.rows as Array<{ file_path: string | null }>) {
    const filePath = row.file_path;
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    if (!samplePath) {
      samplePath = filePath;
    }
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        totalBytes += stats.size;
      }
    } catch {
      missingFiles += 1;
    }
  }

  let diskTotalBytes: number | null = null;
  let diskFreeBytes: number | null = null;
  if (samplePath) {
    try {
      const stats = await fs.statfs(path.dirname(samplePath));
      diskTotalBytes = stats.bsize * stats.blocks;
      diskFreeBytes = stats.bsize * stats.bavail;
    } catch {
      diskTotalBytes = null;
      diskFreeBytes = null;
    }
  }

  res.json({
    artists,
    mediaBytes: totalBytes,
    mediaFiles: seen.size,
    missingFiles,
    diskTotalBytes,
    diskFreeBytes,
    activeConnections: getActiveConnectionsCount(),
    bandwidthBps: getStreamBandwidthBps(),
    cpuUsagePercent: (() => {
      const cpuSample = sampleCpuUsagePercent(lastCpuSnapshot);
      lastCpuSnapshot = cpuSample.snapshot;
      return cpuSample.percent;
    })(),
    memoryUsagePercent: getMemoryUsagePercent()
  });
});

export default router;
