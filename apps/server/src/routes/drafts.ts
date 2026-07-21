import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db, queryOne, nowIso } from "../db";
import { RecordedStep } from "@automate/shared";
import { detectParameterCandidates } from "../paramDetect";

export const draftsRouter = Router();

interface DraftOutputField {
  key: string;
  label: string;
  selectors: string[];
}

// Called by the browser extension when the user hits "Stop recording".
// No auth required - the extension isn't logged in. The web app claims the
// draft into a real Automation once the user reviews it while signed in.
draftsRouter.post("/", (req, res) => {
  const { startUrl, steps, outputFields } = req.body ?? {};
  if (typeof startUrl !== "string" || !Array.isArray(steps)) {
    return res.status(400).json({ error: "startUrl and steps[] are required" });
  }

  const id = uuid();
  db.prepare(
    "INSERT INTO drafts (id, start_url, steps_json, output_fields_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, startUrl, JSON.stringify(steps), JSON.stringify(outputFields ?? []), nowIso());

  res.status(201).json({ id });
});

draftsRouter.get("/:id", (req, res) => {
  const draft = queryOne<{ id: string; start_url: string; steps_json: string; output_fields_json: string; created_at: string }>(
    "SELECT * FROM drafts WHERE id = ?",
    req.params.id
  );

  if (!draft) return res.status(404).json({ error: "Draft not found or already claimed" });

  const steps: RecordedStep[] = JSON.parse(draft.steps_json);
  const outputFields: DraftOutputField[] = JSON.parse(draft.output_fields_json);
  res.json({
    id: draft.id,
    startUrl: draft.start_url,
    steps,
    outputFields,
    candidates: detectParameterCandidates(steps),
  });
});
