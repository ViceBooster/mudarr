import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, type, external_id, name, enabled, last_sync_at, created_at FROM list_sources ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

const createSchema = z.object({
  type: z.enum(["spotify", "lastfm"]),
  externalId: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().optional()
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { type, externalId, name, enabled } = parsed.data;
  const result = await pool.query(
    "INSERT INTO list_sources (type, external_id, name, enabled) VALUES ($1, $2, $3, $4) RETURNING *",
    [type, externalId, name, enabled ?? true]
  );
  res.status(201).json(result.rows[0]);
});

export default router;
