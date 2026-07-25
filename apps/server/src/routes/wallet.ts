import { Router } from "express";
import { db, queryOne } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { WalletInfo } from "@automate/shared";

export const walletRouter = Router();

walletRouter.use(requireAuth);

// No real payment processor to defer to for limits, so pick bounds that are
// generous for testing but catch NaN/negative/garbage input - same reasoning
// as the small-whole-number ceiling in paramValidation.ts.
const MIN_TOPUP = 1;
const MAX_TOPUP = 1_000_000;

function getBalance(userId: string): number {
  const row = queryOne<{ balance: number }>("SELECT balance FROM users WHERE id = ?", userId);
  return row?.balance ?? 0;
}

walletRouter.post("/topup", (req: AuthedRequest, res) => {
  const { amount } = req.body ?? {};
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return res.status(400).json({ error: `Enter a whole number between ${MIN_TOPUP} and ${MAX_TOPUP} BDT.` });
  }

  db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amount, req.userId as string);
  const result: WalletInfo = { balance: getBalance(req.userId as string) };
  res.status(201).json(result);
});
