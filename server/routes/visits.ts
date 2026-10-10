/**
 * Visit Recorder API (Zebby+).
 *
 *   GET    /api/visits/consent           current opt-in state + wording to show
 *   POST   /api/visits/consent           { action: "grant" | "withdraw", appVersion?, platform? }
 *   GET    /api/visits                   list my visits (metadata + decrypted titles)
 *   POST   /api/visits                   start a visit -> returns a signed upload link
 *   POST   /api/visits/:id/uploaded      tell us the upload finished; we verify it in storage
 *   GET    /api/visits/:id               one visit (metadata; transcript/recap once ready)
 *   DELETE /api/visits/:id               delete a visit (audio + encrypted text)
 *   DELETE /api/visits                   delete ALL my visits
 *
 * Every route: signed in, feature flag on, owner-only. Creating visits also
 * needs an active opt-in and Zebby+. Every touch is written to visit_access_log.
 * Responses are never cached.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { users, visits, visitConsents, visitAccessLog } from "@shared/schema";
import {
  VISIT_OPTIN_TEXT,
  VISIT_OPTIN_VERSION,
  VISIT_ROOM_CONSENT_TEXT,
  VISIT_ROOM_CONSENT_VERSION,
  VISIT_PARTICIPANTS,
  VISIT_SETTINGS,
} from "@shared/visitConsent";
import { isHealthCryptoConfigured, openOptional, sealOptional } from "../lib/healthCrypto";
import {
  VISIT_AUDIO_MAX_BYTES,
  VISIT_AUDIO_MIME_TO_EXT,
  createVisitUploadLink,
  deleteVisitAudio,
  isVisitBucketReady,
  isVisitStorageConfigured,
  statVisitAudio,
  visitAudioPath,
} from "../lib/visitStorage";
import { audioDeleteAfterFrom, purgeAllVisitsForUser } from "../lib/visitRetention";

const router = Router();

// Express 4 does not catch errors thrown in async handlers; an unhandled
// rejection would take the whole server down. Wrap every handler so errors go
// to the error handler at the bottom of this file instead.
for (const method of ["get", "post", "delete"] as const) {
  const original = (router as any)[method].bind(router);
  (router as any)[method] = (path: string, ...handlers: any[]) =>
    original(
      path,
      ...handlers.map(
        (h) => (req: Request, res: Response, next: NextFunction) =>
          Promise.resolve(h(req, res, next)).catch(next),
      ),
    );
}

export const FF_VISIT_RECORDER = (process.env.FF_VISIT_RECORDER || "").toLowerCase() === "true";

function userIdOf(req: Request): string | undefined {
  const u = (req as any).user;
  return u?.claims?.sub || u?.id;
}

function ipHash(req: Request): string | null {
  return req.ip ? crypto.createHash("sha256").update(req.ip).digest("hex") : null;
}

async function logAccess(visitId: string, userId: string, action: string, detail?: string) {
  await db.insert(visitAccessLog).values({ visitId, userId, action, detail: detail ?? null });
}

async function latestConsent(userId: string) {
  const [row] = await db
    .select()
    .from(visitConsents)
    .where(and(eq(visitConsents.userId, userId), eq(visitConsents.scope, "visit_recorder")))
    .orderBy(desc(visitConsents.createdAt))
    .limit(1);
  return row as typeof visitConsents.$inferSelect | undefined;
}

async function isPlus(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ plan: users.plan, planStatus: users.planStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!u && u.plan === "plus" && ["active", "trialing"].includes(String(u.planStatus));
}

// --- guards ----------------------------------------------------------------

router.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

router.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  if (!userIdOf(req)) return res.status(401).json({ error: "auth_required" });
  // Deleting your own recordings always works, even if the feature is later
  // switched off. Everything else needs the feature on.
  if (!FF_VISIT_RECORDER && req.method !== "DELETE") {
    return res.status(404).json({ error: "feature_disabled" });
  }
  next();
});

function requireReady(_req: Request, res: Response, next: NextFunction) {
  if (!isHealthCryptoConfigured() || !isVisitStorageConfigured() || !isVisitBucketReady()) {
    return res.status(503).json({ error: "visit_recorder_not_configured" });
  }
  next();
}

// Deletes only need storage access (no decryption).
function requireStorage(_req: Request, res: Response, next: NextFunction) {
  if (!isVisitStorageConfigured()) {
    return res.status(503).json({ error: "visit_recorder_not_configured" });
  }
  next();
}

// --- consent ---------------------------------------------------------------

router.get("/consent", async (req, res) => {
  const userId = userIdOf(req)!;
  const last = await latestConsent(userId);
  const active = last?.action === "granted" && last.consentTextVersion === VISIT_OPTIN_VERSION;
  res.json({
    active,
    needsReconsent: last?.action === "granted" && last.consentTextVersion !== VISIT_OPTIN_VERSION,
    grantedAt: active ? last!.createdAt : null,
    plus: await isPlus(userId),
    optIn: { version: VISIT_OPTIN_VERSION, ...VISIT_OPTIN_TEXT },
    room: { version: VISIT_ROOM_CONSENT_VERSION, ...VISIT_ROOM_CONSENT_TEXT },
  });
});

const consentBody = z.object({
  action: z.enum(["grant", "withdraw"]),
  consentTextVersion: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
  platform: z.enum(["web", "ios", "android"]).optional(),
});

router.post("/consent", async (req, res) => {
  const userId = userIdOf(req)!;
  const parsed = consentBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
  const { action, consentTextVersion, appVersion, platform } = parsed.data;

  // A grant must be for the wording we are showing right now.
  if (action === "grant" && consentTextVersion !== VISIT_OPTIN_VERSION) {
    return res.status(409).json({ error: "consent_text_outdated", currentVersion: VISIT_OPTIN_VERSION });
  }

  await db.insert(visitConsents).values({
    userId,
    action: action === "grant" ? "granted" : "withdrawn",
    scope: "visit_recorder",
    consentTextVersion: VISIT_OPTIN_VERSION,
    appVersion: appVersion ?? null,
    platform: platform ?? null,
    ipHash: ipHash(req),
  });
  res.json({ ok: true, active: action === "grant" });
});

// --- visits ----------------------------------------------------------------

// A row that can't be decrypted (for example a key rotated without
// HEALTH_DATA_KEY_PREVIOUS) shows as unreadable instead of failing the request.
function safeOpen(userId: string, purpose: string, sealed: string | null, failures: string[]): string | null {
  try {
    return openOptional(userId, purpose, sealed);
  } catch {
    failures.push(purpose);
    return null;
  }
}

function publicVisit(userId: string, v: typeof visits.$inferSelect, includeText: boolean) {
  const failures: string[] = [];
  const title = safeOpen(userId, "visit.title", v.titleEnc, failures);
  const text = includeText
    ? {
        transcript: safeOpen(userId, "visit.transcript", v.transcriptEnc, failures),
        recap: safeOpen(userId, "visit.recap", v.recapEnc, failures),
        consentEvidence: safeOpen(userId, "visit.consentEvidence", v.consentEvidenceEnc, failures),
      }
    : {};
  return {
    id: v.id,
    title,
    setting: v.setting,
    participants: v.participants ?? [],
    status: v.status,
    errorCode: v.errorCode,
    consentCheck: v.consentCheck,
    consentTappedAt: v.consentTappedAt,
    audioOnFile: !!v.audioPath && !v.audioDeletedAt,
    audioDeleteAfter: v.audioDeleteAfter,
    audioDurationSec: v.audioDurationSec,
    transcriptApprovedAt: v.transcriptApprovedAt,
    createdAt: v.createdAt,
    unreadable: failures.length > 0,
    ...text,
  };
}

router.get("/", requireReady, async (req, res) => {
  const userId = userIdOf(req)!;
  const rows = await db
    .select()
    .from(visits)
    .where(eq(visits.userId, userId))
    .orderBy(desc(visits.createdAt))
    .limit(200);
  res.json({ visits: rows.map((v: typeof visits.$inferSelect) => publicVisit(userId, v, false)) });
});

const createBody = z.object({
  title: z.string().trim().max(120).optional(),
  setting: z.enum(VISIT_SETTINGS).optional(),
  participants: z.array(z.enum(VISIT_PARTICIPANTS)).max(5).optional(),
  mimeType: z.string().max(60),
  roomConsentVersion: z.literal(VISIT_ROOM_CONSENT_VERSION),
  everyoneAgreed: z.literal(true),
});

router.post("/", requireReady, async (req, res) => {
  const userId = userIdOf(req)!;
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_request", issues: parsed.error.issues.map((i) => i.path.join(".")) });
  }
  const body = parsed.data;

  const consent = await latestConsent(userId);
  if (!(consent?.action === "granted" && consent.consentTextVersion === VISIT_OPTIN_VERSION)) {
    return res.status(403).json({ error: "optin_required" });
  }
  if (!(await isPlus(userId))) {
    return res.status(402).json({ error: "zebby_plus_required" });
  }

  const mime = body.mimeType.split(";")[0].trim().toLowerCase();
  if (!VISIT_AUDIO_MIME_TO_EXT[mime]) return res.status(415).json({ error: "unsupported_audio_type" });

  const now = new Date();
  const [row] = await db
    .insert(visits)
    .values({
      userId,
      titleEnc: sealOptional(userId, "visit.title", body.title),
      setting: body.setting ?? null,
      participants: body.participants ?? ["me"],
      status: "awaiting_upload",
      consentTappedAt: now,
      consentTextVersion: VISIT_ROOM_CONSENT_VERSION,
      consentCheck: "pending",
      audioMime: mime,
      audioDeleteAfter: audioDeleteAfterFrom(now),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const path = visitAudioPath(userId, row.id, mime);
  const link = await createVisitUploadLink(path);
  await db.update(visits).set({ audioPath: path, updatedAt: new Date() }).where(eq(visits.id, row.id));
  await logAccess(row.id, userId, "created");
  await logAccess(row.id, userId, "upload_link");

  res.status(201).json({
    visitId: row.id,
    upload: { method: "PUT", url: link.signedUrl, contentType: mime, maxBytes: VISIT_AUDIO_MAX_BYTES },
  });
});

async function ownedVisit(userId: string, id: string) {
  const [v] = await db
    .select()
    .from(visits)
    .where(and(eq(visits.id, id), eq(visits.userId, userId)))
    .limit(1);
  return v as typeof visits.$inferSelect | undefined;
}

// Signed upload links expire after about 2 hours. Long visits (ER, hospital)
// ask for a fresh link to the same file when recording stops.
router.post("/:id/upload-link", requireReady, async (req, res) => {
  const userId = userIdOf(req)!;
  const v = await ownedVisit(userId, req.params.id);
  if (!v) return res.status(404).json({ error: "not_found" });
  if (v.status !== "awaiting_upload" || !v.audioPath || !v.audioMime) {
    return res.status(409).json({ error: "wrong_state", status: v.status });
  }
  const link = await createVisitUploadLink(v.audioPath);
  await logAccess(v.id, userId, "upload_link", "refresh");
  res.json({
    visitId: v.id,
    upload: { method: "PUT", url: link.signedUrl, contentType: v.audioMime, maxBytes: VISIT_AUDIO_MAX_BYTES },
  });
});

const uploadedBody = z.object({ durationSec: z.number().int().min(1).max(6 * 60 * 60).optional() });

router.post("/:id/uploaded", requireReady, async (req, res) => {
  const userId = userIdOf(req)!;
  const v = await ownedVisit(userId, req.params.id);
  if (!v) return res.status(404).json({ error: "not_found" });
  if (v.status !== "awaiting_upload" || !v.audioPath) return res.status(409).json({ error: "wrong_state", status: v.status });
  const parsed = uploadedBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

  const stat = await statVisitAudio(v.audioPath);
  if (!stat || stat.bytes <= 0) return res.status(409).json({ error: "upload_not_found" });
  if (stat.bytes > VISIT_AUDIO_MAX_BYTES) {
    await deleteVisitAudio([v.audioPath]);
    return res.status(413).json({ error: "audio_too_large" });
  }

  const now = new Date();
  // Only move forward if nothing else (a second tap, the cleanup job) changed
  // this visit since we read it.
  const updated = await db
    .update(visits)
    .set({
      status: "uploaded",
      audioBytes: stat.bytes,
      audioDurationSec: parsed.data.durationSec ?? null,
      audioUploadedAt: now,
      updatedAt: now,
    })
    .where(and(eq(visits.id, v.id), eq(visits.status, "awaiting_upload")))
    .returning({ id: visits.id });
  if (!updated.length) return res.status(409).json({ error: "wrong_state" });
  await logAccess(v.id, userId, "uploaded", String(stat.bytes));
  res.json({ ok: true, status: "uploaded" });
});

router.get("/:id", requireReady, async (req, res) => {
  const userId = userIdOf(req)!;
  const v = await ownedVisit(userId, req.params.id);
  if (!v) return res.status(404).json({ error: "not_found" });
  await logAccess(v.id, userId, "viewed");
  res.json({ visit: publicVisit(userId, v, true) });
});

router.delete("/:id", requireStorage, async (req, res) => {
  const userId = userIdOf(req)!;
  const v = await ownedVisit(userId, req.params.id);
  if (!v) return res.status(404).json({ error: "not_found" });
  if (v.audioPath) await deleteVisitAudio([v.audioPath]);
  await db.delete(visits).where(eq(visits.id, v.id));
  await logAccess(v.id, userId, "deleted");
  res.json({ ok: true });
});

router.delete("/", requireStorage, async (req, res) => {
  const userId = userIdOf(req)!;
  const removed = await purgeAllVisitsForUser(userId);
  res.json({ ok: true, removed });
});

// Errors from any handler above land here. Log the error type only (never
// request or response content), and answer with a generic message.
router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(
    JSON.stringify({
      evt: "visits_route_error",
      method: req.method,
      route: req.route?.path ?? "unknown",
      // Name and code only: database and storage error messages can echo
      // query values, so the message itself is never logged.
      error: err instanceof Error ? err.name : "unknown",
      code: (err as any)?.code ?? (err as any)?.statusCode ?? null,
    }),
  );
  if (!res.headersSent) res.status(500).json({ error: "visit_error" });
});

export default router;
