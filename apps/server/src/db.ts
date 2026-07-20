import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = path.join(__dirname, "..", "formautomator.db");
export const db = new DatabaseSync(dbPath);

type SqlParam = string | number | bigint | null | Uint8Array;

/**
 * Typed wrappers around db.prepare().get()/.all() - node:sqlite types rows as
 * a generic record, which otherwise forces an `as unknown as Row` double-cast
 * at every call site.
 */
export function queryOne<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function run(sql: string, ...params: SqlParam[]): void {
  db.prepare(sql).run(...params);
}

export function nowIso(): string {
  return new Date().toISOString();
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  start_url TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  output_fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_url TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  output_enabled INTEGER NOT NULL,
  output_fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  values_json TEXT NOT NULL,
  success INTEGER NOT NULL,
  output TEXT,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (automation_id) REFERENCES automations(id)
);

CREATE TABLE IF NOT EXISTS email_automations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  app_password_encrypted TEXT NOT NULL,
  to_value TEXT NOT NULL,
  to_changeable INTEGER NOT NULL,
  subject_value TEXT NOT NULL,
  subject_changeable INTEGER NOT NULL,
  body_value TEXT NOT NULL,
  body_changeable INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  source_automation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  pricing_mode TEXT NOT NULL,
  price INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FOREIGN KEY (source_automation_id) REFERENCES automations(id)
);

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  copied_automation_id TEXT NOT NULL,
  pricing_mode TEXT NOT NULL,
  price_paid INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  seller_payout INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subscription_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  price_paid INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Simple additive migrations: these tables predate these columns, and
// CREATE TABLE IF NOT EXISTS above won't add them to already-existing tables.
function addColumnIfMissing(table: string, columnDef: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch {
    // Column already exists from a previous run - fine.
  }
}

addColumnIfMissing("users", "avatar TEXT");
addColumnIfMissing("automations", "license_mode TEXT NOT NULL DEFAULT 'unlimited'");
addColumnIfMissing("automations", "uses_remaining INTEGER");
addColumnIfMissing("automations", "subscription_expires_at TEXT");
addColumnIfMissing("automations", "purchased_from_listing_id TEXT");
addColumnIfMissing("users", "plan TEXT NOT NULL DEFAULT 'free'");
addColumnIfMissing("users", "plan_renews_at TEXT");
addColumnIfMissing("users", "creations_today INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "creations_date TEXT");
addColumnIfMissing("users", "name TEXT");
addColumnIfMissing("automations", "session_cookies_encrypted TEXT");
addColumnIfMissing("automations", "session_captured_at TEXT");
addColumnIfMissing("automations", "session_domain TEXT");
