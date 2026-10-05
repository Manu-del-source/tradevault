import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const raw = process.env.TRADEVAULT_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TRADEVAULT_TOKEN_ENCRYPTION_KEY is not configured");
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const decoded = Buffer.from(padded, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map(v => v.toString("base64url")).join(".");
}

export function decryptSecret(payload: string) {
  const [ivText, tagText, cipherText] = payload.split(".");
  if (!ivText || !tagText || !cipherText) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
