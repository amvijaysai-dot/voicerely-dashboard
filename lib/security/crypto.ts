// lib/security/crypto.ts
//
// Encryption-at-rest for tenant secrets (the per-tenant Retell API key).
// Uses Node's native crypto with AES-256-GCM: each value gets a random IV
// and a 16-byte auth tag, so tampering is detected on decrypt. The key is
// loaded from ENCRYPTION_KEY (32-byte hex) and fails fast if absent.

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FATAL: ENCRYPTION_KEY is not set. Generate a 32-byte hex key (crypto.randomBytes(32).toString('hex')) and add it to .env.local."
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("FATAL: ENCRYPTION_KEY must be a 32-byte (64 hex char) value.");
  }
  return key;
}

/** Encrypts a plaintext secret. Returns a self-describing token string. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: v1:<iv>:<tag>:<ciphertext>  (all hex)
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypts a token produced by encryptSecret. Tolerates legacy plaintext. */
export function decryptSecret(token: string): string {
  if (!token) return "";
  if (!token.startsWith("v1:")) return token; // legacy plaintext fallback
  const [, ivHex, tagHex, dataHex] = token.split(":");
  if (!ivHex || !tagHex || !dataHex) return token;
  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    // Auth tag mismatch / corruption -> treat as unusable.
    return "";
  }
}