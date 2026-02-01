import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./routes/index.js";
import { runMigrations } from "./db/migrate.js";
import { startStatsSampler } from "./services/statsSampler.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", requireAuth, apiRoutes);

const port = Number(process.env.API_PORT ?? 3001);

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
