/**
 * Encryption at rest for sensitive health text (Visit Recorder titles,
 * transcripts, recaps, consent evidence).
 *
 * Ported from FlashFlow's lib/crypto/encrypt.ts (AES-256-GCM, versioned wire
 * format) with two changes for health data:
 *
 *   1. Per-user keys. Each user's data is sealed with a key derived from the
 *      master key + their user id (HKDF-SHA256). A row copied to another
 *      user's account will not decrypt.
 *   2. Context binding. The user id and a purpose label ("visit.transcript")
 *      are bound in as additional authenticated data, so a transcript can't be
 *      swapped into the recap column unnoticed.
 *
 * Env:
 *   HEALTH_DATA_KEY           32 random bytes as 64 hex chars. Generate with:
 *                             node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *                             Use a DIFFERENT key from FlashFlow's TOKEN_ENCRYPTION_KEY.
 *   HEALTH_DATA_KEY_PREVIOUS  optional; the old key during a rotation. Reads try
 *                             the current key first, then this one.
 *
 * Wire format: hv1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 * Losing HEALTH_DATA_KEY makes every sealed value unreadable. Store it in the
 * host's secret manager and keep an offline backup.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = "hv1";
const HKDF_SALT = Buffer.from("zebbys-world/health-data/v1", "utf8");

function parseKey(hex: string | undefined, name: string): Buffer | null {
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${name} must be 64 hex characters (32 bytes)`);
  }
  return Buffer.from(hex, "hex");
}

function masterKeys(): Buffer[] {
  const current = parseKey(process.env.HEALTH_DATA_KEY, "HEALTH_DATA_KEY");
  if (!current) {
    throw new Error("HEALTH_DATA_KEY is not set — health data cannot be encrypted");
  }
  const previous = parseKey(process.env.HEALTH_DATA_KEY_PREVIOUS, "HEALTH_DATA_KEY_PREVIOUS");
  return previous ? [current, previous] : [current];
}

export function isHealthCryptoConfigured(): boolean {
  try {
    masterKeys();
    return true;
  } catch {
    return false;
  }
}

function userKey(master: Buffer, userId: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", master, HKDF_SALT, Buffer.from(`user:${userId}`, "utf8"), 32));
}

function aad(userId: string, purpose: string): Buffer {
  return Buffer.from(`${VERSION}|${userId}|${purpose}`, "utf8");
}

/** Encrypt text for one user. `purpose` labels the field, e.g. "visit.transcript". */
export function sealForUser(userId: string, purpose: string, plaintext: string): string {
  if (!userId) throw new Error("sealForUser: userId required");
  const key = userKey(masterKeys()[0], userId);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(aad(userId, purpose));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Decrypt a value produced by sealForUser with the same userId and purpose. */
export function openForUser(userId: string, purpose: string, sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("openForUser: not a sealed health value");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ct = Buffer.from(parts[3], "base64url");
  let lastErr: unknown;
  for (const master of masterKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, userKey(master, userId), iv, { authTagLength: TAG_LEN });
      decipher.setAAD(aad(userId, purpose));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`openForUser: could not decrypt (${(lastErr as Error)?.message ?? "unknown"})`);
}

/** Null-safe helpers for optional columns. */
export function sealOptional(userId: string, purpose: string, value: string | null | undefined): string | null {
  return value == null || value === "" ? null : sealForUser(userId, purpose, value);
}
export function openOptional(userId: string, purpose: string, sealed: string | null | undefined): string | null {
  return sealed ? openForUser(userId, purpose, sealed) : null;
}

export function looksSealed(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}
