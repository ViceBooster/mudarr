import { Router } from "express";
import { z } from "zod";
import { isSetupComplete } from "../services/appSettings.js";
import { verifyAdminCredentials } from "../services/auth.js";

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

router.post("/login", async (req, res) => {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    return res.status(409).json({ error: "Initial setup required" });
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { username, password } = parsed.data;
  const user = await verifyAdminCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = `Basic ${Buffer.from(`${user.username}:${password}`).toString("base64")}`;
  res.json({ token, username: user.username });
});

router.get("/status", async (_req, res) => {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    return res.status(409).json({ error: "Initial setup required" });
  }
  const user = res.locals.user as { username: string } | undefined;
  res.json({ authenticated: true, username: user?.username ?? null });
});

export default router;
