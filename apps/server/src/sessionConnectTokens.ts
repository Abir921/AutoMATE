import { randomBytes } from "node:crypto";

// Generous TTL: the user may need to actually log in (find credentials, pass
// 2FA) on the opened tab before they get to click Capture in the popup.
const TOKEN_TTL_MS = 15 * 60 * 1000;

interface ConnectTokenEntry {
  automationId: string;
  ownerId: string;
  expiresAt: number;
}

// Short-lived, single-use tokens that let the extension (which has no login of
// its own) prove it's acting on behalf of a specific automation's owner when
// posting captured cookies back - without ever handing the extension a JWT.
// In-memory is fine: if the server restarts mid-connect-flow the user just
// clicks "Connect" again.
const tokens = new Map<string, ConnectTokenEntry>();

export function createConnectToken(automationId: string, ownerId: string): string {
  const token = randomBytes(24).toString("hex");
  tokens.set(token, { automationId, ownerId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** Validates and consumes (single-use) a connect token. Returns null if missing/expired. */
export function consumeConnectToken(token: string): ConnectTokenEntry | null {
  const entry = tokens.get(token);
  tokens.delete(token);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}
