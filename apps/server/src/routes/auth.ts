import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { v4 as uuid } from "uuid";
import { db, queryOne, nowIso } from "../db";
import { signToken } from "../auth";
import { sendSystemEmail, systemEmailConfigured } from "../systemMailer";

export const authRouter = Router();

const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:5173";
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Emails are matched case-insensitively (mail providers treat them that way
// in practice) - without normalizing here, "a@x.com" and "A@X.com" could
// register as two separate accounts that both think they own that address.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

authRouter.post("/signup", async (req, res) => {
  const { password, name } = req.body ?? {};
  if (typeof req.body?.email !== "string" || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Email and password (min 6 chars) are required" });
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }
  const email = normalizeEmail(req.body.email);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const id = uuid();
  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, name) VALUES (?, ?, ?, ?, ?)"
  ).run(id, email, passwordHash, nowIso(), name.trim());

  res.status(201).json({ token: signToken(id), email });
});

authRouter.post("/login", async (req, res) => {
  const { password } = req.body ?? {};
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  const user = queryOne<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = ?",
    email
  );

  if (!user || !(await bcrypt.compare(password ?? "", user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json({ token: signToken(user.id), email });
});

authRouter.post("/forgot-password", async (req, res) => {
  const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
  if (!email) return res.status(400).json({ error: "Email is required" });

  const user = queryOne<{ id: string }>("SELECT id FROM users WHERE email = ?", email);

  // Always respond the same way whether or not the email is registered -
  // otherwise this endpoint becomes a way to probe which emails have accounts.
  if (!user) return res.json({ ok: true });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  db.prepare(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)"
  ).run(uuid(), user.id, tokenHash, expiresAt, nowIso());

  const resetLink = `${WEB_ORIGIN}/reset-password?token=${rawToken}`;

  if (systemEmailConfigured) {
    try {
      await sendSystemEmail(
        email,
        "Reset your AutoMATE password",
        `Someone requested a password reset for this account. This link expires in 30 minutes:\n\n${resetLink}\n\nIf this wasn't you, you can ignore this email.`
      );
    } catch (err) {
      // Don't fail the request over an SMTP hiccup - just log it. The
      // response shape stays identical either way (see the comment above).
      console.error("Failed to send password reset email:", err);
    }
    return res.json({ ok: true });
  }

  // No platform email is configured (see systemMailer.ts) - there's no way to
  // actually deliver this link, so return it directly instead of silently
  // doing nothing. NOT safe for a real deployment: this lets anyone reset
  // anyone's password without inbox access. Set SYSTEM_SMTP_EMAIL and
  // SYSTEM_SMTP_APP_PASSWORD to send real emails instead.
  res.json({ ok: true, devResetLink: resetLink });
});

authRouter.post("/reset-password", async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== "string" || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "A valid token and password (min 6 chars) are required" });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = queryOne<{ id: string; user_id: string; expires_at: string; used: number }>(
    "SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token_hash = ?",
    tokenHash
  );

  if (!row || row.used || new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired - request a new one." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
  db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(row.id);

  res.json({ ok: true });
});
