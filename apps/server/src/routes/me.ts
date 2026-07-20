import { Router } from "express";
import { db, queryOne } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { getPlanInfo } from "../planLimits";

export const meRouter = Router();

meRouter.use(requireAuth);

const MAX_AVATAR_LENGTH = 3_000_000; // ~2MB image as a base64 data URL

meRouter.get("/", (req: AuthedRequest, res) => {
  const user = queryOne<{ email: string; created_at: string; avatar: string | null; name: string | null }>(
    "SELECT email, created_at, avatar, name FROM users WHERE id = ?",
    req.userId as string
  );
  if (!user) return res.status(404).json({ error: "Not found" });

  // Counts both browser and email automations - the Dashboard shows this as
  // one "automations created" figure, and both types count against the same
  // daily creation quota, so splitting them here would make the number look
  // wrong to anyone who's only ever made email automations.
  const { count } = queryOne<{ count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM automations WHERE owner_id = ?) +
       (SELECT COUNT(*) FROM email_automations WHERE owner_id = ?) as count`,
    req.userId as string,
    req.userId as string
  ) as { count: number };

  res.json({
    email: user.email,
    name: user.name,
    createdAt: user.created_at,
    avatar: user.avatar,
    automationCount: count,
    ...getPlanInfo(req.userId as string),
  });
});

meRouter.put("/avatar", (req: AuthedRequest, res) => {
  const { avatar } = req.body ?? {};
  if (typeof avatar !== "string" || !avatar.startsWith("data:image/")) {
    return res.status(400).json({ error: "avatar must be an image data URL" });
  }
  if (avatar.length > MAX_AVATAR_LENGTH) {
    return res.status(400).json({ error: "Image is too large - please use something smaller than ~2MB" });
  }

  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, req.userId as string);
  res.json({ avatar });
});

meRouter.delete("/", (req: AuthedRequest, res) => {
  const userId = req.userId as string;

  // Deletion order matters for the FOREIGN KEY constraints in db.ts:
  // purchases (which reference listings) before listings, listings (which
  // reference automations) before automations, then everything else that
  // references the user directly.
  db.prepare(
    "DELETE FROM marketplace_purchases WHERE buyer_id = ? OR listing_id IN (SELECT id FROM marketplace_listings WHERE seller_id = ?)"
  ).run(userId, userId);
  db.prepare("DELETE FROM marketplace_listings WHERE seller_id = ?").run(userId);
  db.prepare("DELETE FROM runs WHERE automation_id IN (SELECT id FROM automations WHERE owner_id = ?)").run(userId);
  db.prepare("DELETE FROM automations WHERE owner_id = ?").run(userId);
  db.prepare("DELETE FROM email_automations WHERE owner_id = ?").run(userId);
  db.prepare("DELETE FROM subscription_purchases WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);

  res.status(204).end();
});
