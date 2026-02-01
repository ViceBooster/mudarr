import { Router } from "express";
import { isEnabled } from "../utils/env.js";

const router = Router();

router.post("/spotify", async (_req, res) => {
  if (!isEnabled(process.env.SPOTIFY_ENABLED)) {
    return res.status(501).json({ status: "disabled", message: "Spotify sync disabled" });
  }
  res.json({ status: "queued" });
});

router.post("/lastfm", async (_req, res) => {
  if (!isEnabled(process.env.LASTFM_ENABLED)) {
    return res.status(501).json({ status: "disabled", message: "Last.fm sync disabled" });
  }
  res.json({ status: "queued" });
});

export default router;
