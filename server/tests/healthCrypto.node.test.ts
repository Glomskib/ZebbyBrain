/**
 * Run: npx tsx --test server/tests/healthCrypto.node.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env.HEALTH_DATA_KEY = crypto.randomBytes(32).toString("hex");
const { sealForUser, openForUser, looksSealed, sealOptional, openOptional } = await import("../lib/healthCrypto");
const { audioDeleteAfterFrom, AUDIO_MAX_DAYS } = await import("../lib/visitRetentionRules");

test("round-trips text for the same user and purpose", () => {
  const sealed = sealForUser("user-a", "visit.transcript", "Troponin went from 2 to 42.");
  assert.ok(looksSealed(sealed));
  assert.ok(!sealed.includes("Troponin"));
  assert.equal(openForUser("user-a", "visit.transcript", sealed), "Troponin went from 2 to 42.");
});

test("same text encrypts differently every time", () => {
  assert.notEqual(sealForUser("u", "p", "x"), sealForUser("u", "p", "x"));
});

test("another user's key cannot open it", () => {
  const sealed = sealForUser("user-a", "visit.recap", "private");
  assert.throws(() => openForUser("user-b", "visit.recap", sealed));
});

test("a value moved to a different field cannot be opened", () => {
  const sealed = sealForUser("user-a", "visit.transcript", "private");
  assert.throws(() => openForUser("user-a", "visit.recap", sealed));
});

test("tampering is detected", () => {
  const sealed = sealForUser("user-a", "visit.title", "Cardiology");
  const parts = sealed.split(".");
  const ct = Buffer.from(parts[3], "base64url");
  ct[0] ^= 0xff;
  parts[3] = ct.toString("base64url");
  assert.throws(() => openForUser("user-a", "visit.title", parts.join(".")));
});

test("key rotation: old values still open with HEALTH_DATA_KEY_PREVIOUS", () => {
  const oldKey = process.env.HEALTH_DATA_KEY!;
  const sealed = sealForUser("user-a", "visit.title", "before rotation");
  process.env.HEALTH_DATA_KEY_PREVIOUS = oldKey;
  process.env.HEALTH_DATA_KEY = crypto.randomBytes(32).toString("hex");
  try {
    assert.equal(openForUser("user-a", "visit.title", sealed), "before rotation");
  } finally {
    process.env.HEALTH_DATA_KEY = oldKey;
    delete process.env.HEALTH_DATA_KEY_PREVIOUS;
  }
});

test("optional helpers pass nulls through", () => {
  assert.equal(sealOptional("u", "p", null), null);
  assert.equal(sealOptional("u", "p", ""), null);
  assert.equal(openOptional("u", "p", null), null);
});

test("audio is never kept past 30 days", () => {
  const created = new Date("2026-10-09T18:34:00Z");
  const due = audioDeleteAfterFrom(created);
  assert.equal(AUDIO_MAX_DAYS, 30);
  assert.equal(due.getTime() - created.getTime(), 30 * 24 * 60 * 60 * 1000);
});
