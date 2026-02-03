import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./routes/index.js";
import { runMigrations } from "./db/migrate.js";
import { startStatsSampler } from "./services/statsSampler.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();

// If running behind a reverse proxy (nginx/traefik/cloudflare), enable this so
// req.protocol / req.ip behave correctly based on X-Forwarded-* headers.
const trustProxyRaw = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
if (trustProxyRaw === "1" || trustProxyRaw === "true" || trustProxyRaw === "yes") {
  app.set("trust proxy", true);
}

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86_400
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", requireAuth, apiRoutes);

const port = Number(process.env.API_PORT ?? 3002);

// Run migrations on startup
async function startServer() {
  try {
    console.log("Running database migrations...");
    const appliedCount = await runMigrations();
    if (appliedCount === 0) {
      console.log("✅ Database is up to date");
    }
    startStatsSampler();
  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.log("Server will start anyway, but some features may not work.");
  }

app.listen(port, () => {
  console.log(`Mudarr API listening on ${port}`);
});
}

startServer();
