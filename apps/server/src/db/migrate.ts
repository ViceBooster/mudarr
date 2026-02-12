import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "./pool.js";

// Load .env from project root (two levels up from this file)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", "..", "..", "..", ".env");
config({ path: envPath });

const migrations = [
  { name: "init_schema", file: "schema.sql" },
  { name: "audiodb_fields", file: "migrations/002_audiodb.sql" },
  { name: "artist_preferences", file: "migrations/003_artist_preferences.sql" },
  { name: "artist_images", file: "migrations/004_artist_images.sql" },
  { name: "download_progress", file: "migrations/005_download_progress.sql" },
  { name: "download_job_links", file: "migrations/006_download_job_links.sql" },
  { name: "genre_import_settings", file: "migrations/007_genre_import_settings.sql" },
  { name: "genre_import_jobs", file: "migrations/008_genre_import_jobs.sql" },
  { name: "fix_genre_import_enabled", file: "migrations/009_fix_genre_import_enabled.sql" },
  { name: "download_job_progress_stage", file: "migrations/010_download_job_progress_stage.sql" },
  { name: "streams", file: "migrations/011_streams.sql" },
  { name: "stream_settings", file: "migrations/012_stream_settings.sql" },
  { name: "artist_import_jobs", file: "migrations/013_artist_import_jobs.sql" },
  { name: "download_job_display_title", file: "migrations/014_download_job_display_title.sql" },
  { name: "stream_icon", file: "migrations/015_stream_icon.sql" },
  { name: "stream_enabled", file: "migrations/016_stream_enabled.sql" },
  { name: "stats_samples", file: "migrations/017_stats_samples.sql" },
  { name: "admin_users", file: "migrations/018_admin_users.sql" },
  { name: "search_settings", file: "migrations/019_search_settings.sql" },
  { name: "dashboard_stats_samples", file: "migrations/020_dashboard_stats_samples.sql" }
];

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    const moduleDir = path.dirname(new URL(import.meta.url).pathname);
    let appliedCount = 0;
    
    for (const migration of migrations) {
    const existing = await client.query("SELECT id FROM migrations WHERE name = $1", [
        migration.name
    ]);
      if (existing.rows.length > 0) {
        continue;
      }

      const bundledPath = path.join(moduleDir, migration.file);
      const sourcePath = path.join(moduleDir, "..", "..", "src", "db", migration.file);
      const migrationPath = fs.existsSync(bundledPath) ? bundledPath : sourcePath;
      const migrationSql = fs.readFileSync(migrationPath, "utf8");

      try {
      await client.query(migrationSql);
      await client.query("INSERT INTO migrations (name) VALUES ($1)", [migration.name]);
      console.log("Applied migration", migration.name);
        appliedCount++;
      } catch (migrationError: any) {
        // If it's a duplicate sequence error and the table exists, just mark as applied
        if (migrationError?.code === '23505' && migrationError?.constraint === 'pg_class_relname_nsp_index') {
          console.log(`Migration ${migration.name} partially applied, marking as complete`);
          await client.query("INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [migration.name]);
        } else {
          throw migrationError;
        }
      }
    }
    
    await client.query("COMMIT");
    
    if (appliedCount > 0) {
      console.log(`✅ Applied ${appliedCount} migration(s)`);
    }
    
    return appliedCount;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed", error);
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  console.log("Connecting to database:", {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || '<not set>',
    user: process.env.POSTGRES_USER || '<not set>'
  });
  
  try {
    await runMigrations();
    await pool.end();
  } catch (error) {
    await pool.end();
    process.exitCode = 1;
  }
}

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
run();
}
