import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db, queryOne, queryAll, nowIso } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { MarketplaceListing, PricingMode, PurchaseResult } from "@automate/shared";
import { getPlanInfo } from "../planLimits";

export const marketplaceRouter = Router();

interface ListingRow {
  id: string;
  seller_id: string;
  seller_email: string;
  source_automation_id: string;
  name: string;
  description: string;
  pricing_mode: PricingMode;
  price: number;
  created_at: string;
}

function rowToListing(row: ListingRow): MarketplaceListing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerEmail: row.seller_email,
    sourceAutomationId: row.source_automation_id,
    name: row.name,
    description: row.description,
    pricingMode: row.pricing_mode,
    price: row.price,
    createdAt: row.created_at,
  };
}

// Platform's cut shrinks as the sale gets bigger - rewards sellers who build
// popular, high-value automations, per the original pricing plan. Pro/Enterprise
// sellers get an additional discount on top ("lower platform fees" perk).
function platformFeeFor(price: number, sellerPlan: "free" | "builder" | "pro" | "enterprise"): number {
  const baseRate = price < 500 ? 0.2 : price < 2000 ? 0.15 : price < 10000 ? 0.1 : 0.07;
  const discounted = sellerPlan === "pro" || sellerPlan === "enterprise";
  const rate = discounted ? baseRate * 0.5 : baseRate;
  return Math.round(price * rate);
}

marketplaceRouter.use(requireAuth);

marketplaceRouter.post("/listings", (req: AuthedRequest, res) => {
  const { sourceAutomationId, name, description, pricingMode, price } = req.body ?? {};

  if (
    typeof sourceAutomationId !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    !["single", "bulk100", "subscription"].includes(pricingMode) ||
    typeof price !== "number" ||
    price <= 0
  ) {
    return res.status(400).json({ error: "sourceAutomationId, name, description, pricingMode and price are required" });
  }

  const source = queryOne<{ owner_id: string; session_cookies_encrypted: string | null }>(
    "SELECT owner_id, session_cookies_encrypted FROM automations WHERE id = ?",
    sourceAutomationId
  );
  if (!source || source.owner_id !== req.userId) {
    return res.status(404).json({ error: "Automation not found" });
  }
  // A connected login session grants ambient access to the seller's account -
  // cloning it to a buyer would leak that access, same reasoning as never
  // listing email automations (which would leak the Gmail App Password).
  if (source.session_cookies_encrypted) {
    return res.status(400).json({
      error: "This automation has a connected login session and can't be listed - disconnect the session first.",
    });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO marketplace_listings (id, seller_id, source_automation_id, name, description, pricing_mode, price, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.userId as string, sourceAutomationId, name, description, pricingMode, Math.round(price), nowIso());

  res.status(201).json({ id });
});

marketplaceRouter.get("/listings", (_req: AuthedRequest, res) => {
  const rows = queryAll<ListingRow>(
    `SELECT ml.*, u.email as seller_email FROM marketplace_listings ml
     JOIN users u ON u.id = ml.seller_id
     ORDER BY ml.created_at DESC`
  );
  res.json(rows.map(rowToListing));
});

marketplaceRouter.get("/listings/:id", (req: AuthedRequest, res) => {
  const row = queryOne<ListingRow>(
    `SELECT ml.*, u.email as seller_email FROM marketplace_listings ml
     JOIN users u ON u.id = ml.seller_id
     WHERE ml.id = ?`,
    req.params.id
  );
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(rowToListing(row));
});

marketplaceRouter.delete("/listings/:id", (req: AuthedRequest, res) => {
  const row = queryOne<{ seller_id: string }>("SELECT seller_id FROM marketplace_listings WHERE id = ?", req.params.id);
  if (!row || row.seller_id !== req.userId) return res.status(404).json({ error: "Not found" });

  db.prepare("DELETE FROM marketplace_listings WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

marketplaceRouter.post("/listings/:id/purchase", (req: AuthedRequest, res) => {
  const listing = queryOne<ListingRow>("SELECT * FROM marketplace_listings WHERE id = ?", req.params.id);
  if (!listing) return res.status(404).json({ error: "Not found" });
  if (listing.seller_id === req.userId) {
    return res.status(400).json({ error: "You can't buy your own listing" });
  }

  const source = queryOne<{
    start_url: string;
    steps_json: string;
    parameters_json: string;
    output_enabled: number;
    output_fields_json: string;
  }>("SELECT * FROM automations WHERE id = ?", listing.source_automation_id);
  if (!source) return res.status(404).json({ error: "The listed automation no longer exists" });

  const price = listing.price;
  const sellerPlan = getPlanInfo(listing.seller_id).plan;
  const platformFee = platformFeeFor(price, sellerPlan);
  const sellerPayout = price - platformFee;

  const licenseMode = listing.pricing_mode;
  const usesRemaining = licenseMode === "single" ? 1 : licenseMode === "bulk100" ? 100 : null;
  const subscriptionExpiresAt =
    licenseMode === "subscription" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

  const automationId = uuid();
  db.prepare(
    `INSERT INTO automations
      (id, owner_id, name, start_url, steps_json, parameters_json, output_enabled, output_fields_json, created_at,
       license_mode, uses_remaining, subscription_expires_at, purchased_from_listing_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    automationId,
    req.userId as string,
    listing.name,
    source.start_url,
    source.steps_json,
    source.parameters_json,
    source.output_enabled,
    source.output_fields_json,
    nowIso(),
    licenseMode,
    usesRemaining,
    subscriptionExpiresAt,
    listing.id
  );

  db.prepare(
    `INSERT INTO marketplace_purchases
      (id, listing_id, buyer_id, copied_automation_id, pricing_mode, price_paid, platform_fee, seller_payout, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), listing.id, req.userId as string, automationId, licenseMode, price, platformFee, sellerPayout, nowIso());

  const result: PurchaseResult = { automationId, pricePaid: price, platformFee, sellerPayout };
  res.status(201).json(result);
});
