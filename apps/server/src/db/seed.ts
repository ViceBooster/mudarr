import pool from "./pool.js";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id FROM genres LIMIT 1");
    if (existing.rows.length === 0) {
      await client.query("INSERT INTO genres (name) VALUES ($1), ($2), ($3)", [
        "Rock",
        "Pop",
        "Hip Hop"
      ]);
    }
    await client.query("COMMIT");
    console.log("Seed complete");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
