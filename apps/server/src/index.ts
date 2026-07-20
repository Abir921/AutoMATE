// Must be the very first import - systemMailer.ts and other modules read
// process.env at module-load time, before app code runs, so the .env file
// has to be loaded before anything else is imported.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { draftsRouter } from "./routes/drafts";
import { automationsRouter } from "./routes/automations";
import { meRouter } from "./routes/me";
import { emailAutomationsRouter } from "./routes/emailAutomations";
import { marketplaceRouter } from "./routes/marketplace";
import { subscriptionRouter } from "./routes/subscription";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/drafts", draftsRouter);
app.use("/api/automations", automationsRouter);
app.use("/api/me", meRouter);
app.use("/api/email-automations", emailAutomationsRouter);
app.use("/api/marketplace", marketplaceRouter);
app.use("/api/subscription", subscriptionRouter);

// Safety net: without this, an uncaught exception in a route handler falls
// through to Express's default HTML error page, which the frontend can't
// parse as JSON and shows as an opaque "Request failed (500)".
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`FormAutomator server listening on http://localhost:${PORT}`);
});
