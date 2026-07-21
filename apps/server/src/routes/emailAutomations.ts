import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db, queryOne, queryAll, nowIso } from "../db";
import { AuthedRequest, requireAuth } from "../auth";
import { EmailAutomation, EmailRunResult } from "@automate/shared";
import { encrypt, decrypt } from "../crypto";
import { checkAndConsumeCreationQuota } from "../planLimits";
import { createGmailTransporter } from "../mailer";
import { validateEmailAddress } from "../paramValidation";

export const emailAutomationsRouter = Router();

interface EmailAutomationRow {
  id: string;
  owner_id: string;
  name: string;
  from_email: string;
  app_password_encrypted: string;
  to_value: string;
  to_changeable: number;
  subject_value: string;
  subject_changeable: number;
  body_value: string;
  body_changeable: number;
  created_at: string;
}

function rowToEmailAutomation(row: EmailAutomationRow): EmailAutomation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    fromEmail: row.from_email,
    to: row.to_value,
    toChangeable: !!row.to_changeable,
    subject: row.subject_value,
    subjectChangeable: !!row.subject_changeable,
    body: row.body_value,
    bodyChangeable: !!row.body_changeable,
    createdAt: row.created_at,
  };
  // Note: app_password_encrypted is intentionally never included here.
}

/** Same owner-or-404 contract as findOwnedAutomation in automations.ts. */
function findOwnedEmailAutomation(req: AuthedRequest): EmailAutomationRow | undefined {
  const row = queryOne<EmailAutomationRow>("SELECT * FROM email_automations WHERE id = ?", req.params.id);
  return row && row.owner_id === req.userId ? row : undefined;
}

emailAutomationsRouter.use(requireAuth);

emailAutomationsRouter.post("/", (req: AuthedRequest, res) => {
  const { name, fromEmail, appPassword, to, subject, body, toChangeable, subjectChangeable, bodyChangeable } =
    req.body ?? {};

  if (
    typeof name !== "string" ||
    typeof fromEmail !== "string" ||
    typeof appPassword !== "string" ||
    typeof to !== "string" ||
    typeof subject !== "string" ||
    typeof body !== "string"
  ) {
    return res.status(400).json({ error: "name, fromEmail, appPassword, to, subject and body are required" });
  }

  const quotaError = checkAndConsumeCreationQuota(req.userId as string);
  if (quotaError) return res.status(402).json({ error: quotaError });

  const id = uuid();
  db.prepare(
    `INSERT INTO email_automations
      (id, owner_id, name, from_email, app_password_encrypted, to_value, to_changeable, subject_value, subject_changeable, body_value, body_changeable, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.userId as string,
    name,
    fromEmail,
    encrypt(appPassword),
    to,
    toChangeable ? 1 : 0,
    subject,
    subjectChangeable ? 1 : 0,
    body,
    bodyChangeable ? 1 : 0,
    nowIso()
  );

  res.status(201).json({ id });
});

emailAutomationsRouter.get("/", (req: AuthedRequest, res) => {
  const rows = queryAll<EmailAutomationRow>(
    "SELECT * FROM email_automations WHERE owner_id = ? ORDER BY created_at DESC",
    req.userId as string
  );
  res.json(rows.map(rowToEmailAutomation));
});

emailAutomationsRouter.get("/:id", (req: AuthedRequest, res) => {
  const row = findOwnedEmailAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(rowToEmailAutomation(row));
});

emailAutomationsRouter.patch("/:id", (req: AuthedRequest, res) => {
  if (!findOwnedEmailAutomation(req)) return res.status(404).json({ error: "Not found" });

  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  db.prepare("UPDATE email_automations SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  res.status(204).end();
});

emailAutomationsRouter.delete("/:id", (req: AuthedRequest, res) => {
  if (!findOwnedEmailAutomation(req)) return res.status(404).json({ error: "Not found" });

  db.prepare("DELETE FROM email_automations WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

emailAutomationsRouter.post("/:id/run", async (req: AuthedRequest, res) => {
  const row = findOwnedEmailAutomation(req);
  if (!row) return res.status(404).json({ error: "Not found" });

  const values = (req.body?.values ?? {}) as Record<string, string>;
  const started = Date.now();

  // Changeable fields accept a run-time value; fixed fields always send as saved.
  const to = row.to_changeable && values.to ? values.to : row.to_value;
  const subject = row.subject_changeable && values.subject ? values.subject : row.subject_value;
  const body = row.body_changeable && values.body ? values.body : row.body_value;

  // A malformed recipient would otherwise surface as a raw SMTP error string.
  const toError = validateEmailAddress(to);
  if (toError) return res.status(400).json({ error: toError });

  let result: EmailRunResult;
  try {
    const transporter = createGmailTransporter(row.from_email, decrypt(row.app_password_encrypted));
    await transporter.sendMail({ from: row.from_email, to, subject, text: body });
    result = { success: true, durationMs: Date.now() - started };
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }

  res.json(result);
});
