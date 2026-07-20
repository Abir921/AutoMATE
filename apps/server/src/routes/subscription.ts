import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db, nowIso } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { SubscribeResult, SubscriptionPlan } from "@formautomator/shared";
import { getPlanInfo, PLAN_PRICES } from "../planLimits";

export const subscriptionRouter = Router();

subscriptionRouter.use(requireAuth);

subscriptionRouter.get("/", (req: AuthedRequest, res) => {
  res.json(getPlanInfo(req.userId as string));
});

// Mock billing - no real money moves. "Payment" would wire up bKash/card/bank
// here later; for now this just activates the plan immediately.
subscriptionRouter.post("/purchase", (req: AuthedRequest, res) => {
  const { plan } = (req.body ?? {}) as { plan?: SubscriptionPlan };
  if (plan !== "builder" && plan !== "pro") {
    return res.status(400).json({ error: "Enterprise plans are custom - contact us instead of self-serve purchase." });
  }

  const price = PLAN_PRICES[plan];
  const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare("UPDATE users SET plan = ?, plan_renews_at = ? WHERE id = ?").run(plan, renewsAt, req.userId as string);
  db.prepare(
    "INSERT INTO subscription_purchases (id, user_id, plan, price_paid, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(uuid(), req.userId as string, plan, price, nowIso());

  const result: SubscribeResult = { plan, pricePaid: price, planRenewsAt: renewsAt };
  res.status(201).json(result);
});
