import crypto from "node:crypto";
import pool from "../db/pool.js";

type AdminUserRow = {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
};

const hashPassword = (password: string, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
};

const safeEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export const getAdminUser = async (): Promise<AdminUserRow | null> => {
  const result = await pool.query(
    "SELECT id, username, password_hash, password_salt FROM admin_users ORDER BY id ASC LIMIT 1"
  );
  return (result.rows[0] as AdminUserRow | undefined) ?? null;
};

export const setAdminUser = async (username: string, password: string) => {
  const normalizedUsername = username.trim();
  const { hash, salt } = hashPassword(password);
  const existing = await getAdminUser();
  if (existing) {
    await pool.query(
      "UPDATE admin_users SET username = $1, password_hash = $2, password_salt = $3, updated_at = NOW() WHERE id = $4",
      [normalizedUsername, hash, salt, existing.id]
    );
    return { id: existing.id, username: normalizedUsername };
  }
  const result = await pool.query(
    "INSERT INTO admin_users (username, password_hash, password_salt) VALUES ($1, $2, $3) RETURNING id",
    [normalizedUsername, hash, salt]
  );
  return { id: result.rows[0].id as number, username: normalizedUsername };
};

export const updateAdminUser = async (params: { username?: string; password?: string }) => {
  const existing = await getAdminUser();
  if (!existing) return null;
  const nextUsername = params.username?.trim() || existing.username;
  let nextHash = existing.password_hash;
  let nextSalt = existing.password_salt;
  if (params.password) {
    const next = hashPassword(params.password);
    nextHash = next.hash;
    nextSalt = next.salt;
  }
  await pool.query(
    "UPDATE admin_users SET username = $1, password_hash = $2, password_salt = $3, updated_at = NOW() WHERE id = $4",
    [nextUsername, nextHash, nextSalt, existing.id]
  );
  return { id: existing.id, username: nextUsername };
};

export const verifyAdminCredentials = async (username: string, password: string) => {
  const user = await getAdminUser();
  if (!user) return null;
  if (user.username !== username.trim()) return null;
  const derived = crypto.scryptSync(password, user.password_salt, 64).toString("hex");
  if (!safeEqual(derived, user.password_hash)) return null;
  return { id: user.id, username: user.username };
};
