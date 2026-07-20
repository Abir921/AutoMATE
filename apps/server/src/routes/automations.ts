import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db, queryOne, queryAll, nowIso } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { Automation, AutomationDocs, CapturedCookie, OutputField, ParameterDef, RecordedStep } from "@formautomator/shared";
import { replayAutomation } from "../replayEngine";
import { suggestLocations } from "../locationSuggest";
import { checkAndConsumeCreationQuota } from "../planLimits";
import { encrypt, decrypt } from "../crypto";
import { createConnectToken, consumeConnectToken } from "../sessionConnectTokens";
import { withAppliedValue } from "../stepValues";
import { validateRunValues } from "../paramValidation";

export const automationsRouter = Router();

interface AutomationRow {
  id: string;
  owner_id: string;
  name: string;
  start_url: string;
  steps_json: string;
  parameters_json: string;
  output_enabled: number;
  output_fields_json: string;
  created_at: string;
  license_mode: string;
  uses_remaining: number | null;
  subscription_expires_at: string | null;
  purchased_from_listing_id: string | null;
  session_cookies_encrypted: string | null;
  session_captured_at: string | null;
}

export function rowToAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    startUrl: row.start_url,
    steps: JSON.parse(row.steps_json),
    parameters: JSON.parse(row.parameters_json),
    outputEnabled: !!row.output_enabled,
    outputFields: JSON.parse(row.output_fields_json ?? "[]"),
    createdAt: row.created_at,
    licenseMode: (row.license_mode ?? "unlimited") as Automation["licenseMode"],
    usesRemaining: row.uses_remaining,
    subscriptionExpiresAt: row.subscription_expires_at,
    purchasedFromListingId: row.purchased_from_listing_id,
    hasLoginSession: !!row.session_cookies_encrypted,
    sessionCapturedAt: row.session_captured_at,
  };
}

/**
 * Looks up an automation by the :id route param, returning it only if it
 * belongs to the requesting user. A missing row and someone else's row are
 * deliberately the same 404 - revealing "exists but isn't yours" would leak
 * which ids are in use.
 */
function findOwnedAutomation(req: AuthedRequest): AutomationRow | undefined {
  const row = queryOne<AutomationRow>("SELECT * FROM automations WHERE id = ?", req.params.id);
  return row && row.owner_id === req.userId ? row : undefined;
}

// Registered BEFORE `.use(requireAuth)` below (Express matches routes in
// registration order) so it's reachable with no JWT - the extension has no
// login of its own. The connect token itself (short-lived, single-use, minted
// only for the automation's actual owner via /:id/session/connect-token) is
// the credential proving this request is authorized, not a bearer token.
automationsRouter.post("/session/capture", (req, res) => {
  const { connectToken, cookies } = req.body ?? {};
  if (typeof connectToken !== "string" || !Array.isArray(cookies)) {
    return res.status(400).json({ error: "connectToken and cookies[] are required" });
  }

  const entry = consumeConnectToken(connectToken);
  if (!entry) return res.status(400).json({ error: "This connect code has expired or was already used - click Connect again." });

  db.prepare(
    "UPDATE automations SET session_cookies_encrypted = ?, session_captured_at = ? WHERE id = ?"
  ).run(encrypt(JSON.stringify(cookies as CapturedCookie[])), nowIso(), entry.automationId);

  res.json({ ok: true });
});

automationsRouter.use(requireAuth);

automationsRouter.post("/", (req: AuthedRequest, res) => {
  const { draftId, name, parameters, outputEnabled, outputFields, stepOverrides } = req.body ?? {};

  if (typeof draftId !== "string" || typeof name !== "string" || !Array.isArray(parameters)) {
    return res.status(400).json({ error: "draftId, name and parameters[] are required" });
  }

  const draft = queryOne<{ id: string; start_url: string; steps_json: string }>(
    "SELECT * FROM drafts WHERE id = ?",
    draftId
  );
  if (!draft) return res.status(404).json({ error: "Draft not found or already claimed" });

  const quotaError = checkAndConsumeCreationQuota(req.userId as string);
  if (quotaError) return res.status(402).json({ error: quotaError });

  const steps = applyStepOverrides(JSON.parse(draft.steps_json), stepOverrides);
  const id = uuid();

  db.prepare(
    `INSERT INTO automations
      (id, owner_id, name, start_url, steps_json, parameters_json, output_enabled, output_fields_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.userId as string,
    name,
    draft.start_url,
    JSON.stringify(steps),
    JSON.stringify(parameters as ParameterDef[]),
    outputEnabled ? 1 : 0,
    outputEnabled ? JSON.stringify((outputFields ?? []) as OutputField[]) : "[]",
    nowIso()
  );

  db.prepare("DELETE FROM drafts WHERE id = ?").run(draftId);

  res.status(201).json({ id });
});

interface StepOverride {
  stepIndex: number;
  value: string;
  urlParam?: string;
}

// Fields the user chose NOT to make changeable can still have their baked-in
// value edited on the review screen - those edits arrive as step overrides.
function applyStepOverrides(steps: RecordedStep[], overrides: unknown): RecordedStep[] {
  if (!Array.isArray(overrides)) return steps;
  for (const override of overrides as StepOverride[]) {
    const step = steps[override.stepIndex];
    if (!step || typeof override.value !== "string") continue;
    steps[override.stepIndex] = withAppliedValue(step, override.value, override.urlParam);
  }
  return steps;
}

automationsRouter.patch("/:id", (req: AuthedRequest, res) => {
  if (!findOwnedAutomation(req)) return res.status(404).json({ error: "Not found" });

  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  db.prepare("UPDATE automations SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  res.status(204).end();
});

automationsRouter.delete("/:id", (req: AuthedRequest, res) => {
  if (!findOwnedAutomation(req)) return res.status(404).json({ error: "Not found" });

  db.prepare("DELETE FROM runs WHERE automation_id = ?").run(req.params.id);
  db.prepare("DELETE FROM automations WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

automationsRouter.get("/", (req: AuthedRequest, res) => {
  const rows = queryAll<AutomationRow>(
    "SELECT * FROM automations WHERE owner_id = ? ORDER BY created_at DESC",
    req.userId as string
  );
  res.json(rows.map(rowToAutomation));
});

automationsRouter.get("/:id", (req: AuthedRequest, res) => {
  const row = findOwnedAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(rowToAutomation(row));
});

automationsRouter.get("/:id/docs", (req: AuthedRequest, res) => {
  const row = findOwnedAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });

  const automation = rowToAutomation(row);
  const docs: AutomationDocs = {
    id: automation.id,
    name: automation.name,
    endpoint: `/automations/${automation.id}/run`,
    method: "POST",
    inputs: automation.parameters.map((p) => ({
      key: p.key,
      label: p.label,
      type: p.type,
      required: true,
    })),
    output: {
      enabled: automation.outputEnabled,
      fields: automation.outputFields.map((f) => ({ key: f.key, label: f.label })),
      description: automation.outputEnabled
        ? "Returns the extracted fields as { output: { <key>: string, ... } }"
        : "No output - confirms the task ran via { success: true }",
    },
  };
  res.json(docs);
});

automationsRouter.post("/:id/session/connect-token", (req: AuthedRequest, res) => {
  const row = findOwnedAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });

  const connectToken = createConnectToken(req.params.id, req.userId as string);
  res.json({ connectToken, targetUrl: row.start_url });
});

automationsRouter.delete("/:id/session", (req: AuthedRequest, res) => {
  if (!findOwnedAutomation(req)) return res.status(404).json({ error: "Not found" });

  db.prepare(
    "UPDATE automations SET session_cookies_encrypted = NULL, session_captured_at = NULL, session_domain = NULL WHERE id = ?"
  ).run(req.params.id);
  res.status(204).end();
});

automationsRouter.post("/:id/suggest", async (req: AuthedRequest, res) => {
  const row = findOwnedAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });

  const { paramKey, query } = req.body ?? {};
  if (typeof paramKey !== "string" || typeof query !== "string") {
    return res.status(400).json({ error: "paramKey and query are required" });
  }

  const automation = rowToAutomation(row);
  const param = automation.parameters.find((p) => p.key === paramKey && p.type === "location");
  if (!param) return res.status(400).json({ error: "Not a location parameter on this automation" });

  const suggestions = await suggestLocations(automation, param, query);
  res.json({ suggestions });
});

/**
 * Marketplace-purchased copies carry a license; owner-created automations are
 * "unlimited" and always pass. Returns the reason the run must be refused, or
 * null to proceed.
 */
function licenseBlockReason(automation: Automation): string | null {
  const { licenseMode, usesRemaining, subscriptionExpiresAt } = automation;
  if (licenseMode === "single" || licenseMode === "bulk100") {
    if (!usesRemaining || usesRemaining <= 0) {
      return "No uses remaining on this automation. Buy more from the marketplace.";
    }
  }
  if (licenseMode === "subscription") {
    if (!subscriptionExpiresAt || new Date(subscriptionExpiresAt) < new Date()) {
      return "This subscription has expired. Purchase again from the marketplace.";
    }
  }
  return null;
}

automationsRouter.post("/:id/run", async (req: AuthedRequest, res) => {
  const row = findOwnedAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });

  const automation = rowToAutomation(row);

  const blockReason = licenseBlockReason(automation);
  if (blockReason) return res.status(402).json({ error: blockReason });

  const values = (req.body?.values ?? {}) as Record<string, string>;

  // Reject malformed inputs (letters in a number field, past/imaginary dates,
  // emptied-out required fields) with a clear message BEFORE paying for a
  // Playwright launch - the run form validates the same rules inline, so this
  // mainly guards direct API callers.
  const validationError = validateRunValues(automation.parameters, values);
  if (validationError) return res.status(400).json({ error: validationError });

  const sessionCookies = row.session_cookies_encrypted
    ? (JSON.parse(decrypt(row.session_cookies_encrypted)) as CapturedCookie[])
    : null;
  const result = await replayAutomation(automation, values, sessionCookies);

  // Metered licenses spend a use per attempt, regardless of success - matches
  // how usage-based billing normally works (an attempt consumes the credit).
  if (automation.licenseMode === "single" || automation.licenseMode === "bulk100") {
    db.prepare("UPDATE automations SET uses_remaining = uses_remaining - 1 WHERE id = ?").run(automation.id);
  }

  db.prepare(
    `INSERT INTO runs (id, automation_id, values_json, success, output, error, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(),
    automation.id,
    JSON.stringify(values),
    result.success ? 1 : 0,
    result.output ? JSON.stringify(result.output) : null,
    result.error ?? null,
    result.durationMs,
    nowIso()
  );

  res.json(result);
});
