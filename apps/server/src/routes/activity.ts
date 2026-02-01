import { Router } from "express";
import pool from "../db/pool.js";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, type, message, metadata, created_at FROM activity_events ORDER BY created_at DESC LIMIT 100"
  );
  res.json(result.rows);
});

router.delete("/", async (_req, res) => {
  await pool.query("DELETE FROM activity_events");
  res.status(204).send();
});

export default router;
