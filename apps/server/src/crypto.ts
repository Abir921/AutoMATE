import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// App passwords are the only real secrets this server stores. They're
// encrypted at rest with a key generated on first run and kept in a local,
// gitignored file - never hardcoded, never sent back to the client.
const KEY_PATH = path.join(__dirname, "..", ".secret-key");

function loadOrCreateKey(): Buffer {
  if (fs.existsSync(KEY_PATH)) {
    return Buffer.from(fs.readFileSync(KEY_PATH, "utf8"), "hex");
  }
  const key = randomBytes(32);
  fs.writeFileSync(KEY_PATH, key.toString("hex"), "utf8");
  return key;
}

const KEY = loadOrCreateKey();

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}
