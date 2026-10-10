/**
 * Visit Recorder retention rules (pattern from FlashFlow lib/storage/retention.ts).
 *
 * Audio is the most sensitive thing we hold, so it is kept as briefly as possible:
 *   - deleted as soon as the user approves the transcript, and
 *   - never kept longer than 30 days after the visit was created, and
 *   - visits never uploaded are cleaned up after 24 hours.
 * Transcripts and recaps (encrypted) stay until the user deletes them or their
 * account.
 */
import { and, eq, isNull, isNotNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import { visits, visitAccessLog } from "@shared/schema";
import { deleteVisitAudio, isVisitStorageConfigured } from "./visitStorage";

import { ABANDONED_UPLOAD_HOURS } from "./visitRetentionRules";
export { AUDIO_MAX_DAYS, ABANDONED_UPLOAD_HOURS, audioDeleteAfterFrom } from "./visitRetentionRules";

async function logAccess(visitId: string, userId: string, action: string, detail?: string) {
  await db.insert(visitAccessLog).values({ visitId, userId, action, detail: detail ?? null });
}

/** Deletes audio that has passed its retention point. Returns how many files were removed. */
export async function purgeExpiredVisitAudio(now: Date = new Date()): Promise<number> {
  if (!isVisitStorageConfigured()) return 0;

  const due = await db
    .select({ id: visits.id, userId: visits.userId, audioPath: visits.audioPath, status: visits.status })
    .from(visits)
    .where(
      and(
        isNotNull(visits.audioPath),
        isNull(visits.audioDeletedAt),
        or(lt(visits.audioDeleteAfter, now), isNotNull(visits.transcriptApprovedAt)),
      ),
    )
    .limit(500);

  const abandonedBefore = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
  const abandoned = await db
    .select({ id: visits.id, userId: visits.userId, audioPath: visits.audioPath, status: visits.status })
    .from(visits)
    .where(and(eq(visits.status, "awaiting_upload"), lt(visits.createdAt, abandonedBefore)))
    .limit(500);

  const rows = [...due, ...abandoned];
  if (!rows.length) return 0;

  // Claim each row first (guarded on the status we read), then delete only
  // the files we claimed. A visit that changed in the meantime (for example a
  // late upload confirmation) is left alone until the next run.
  const claimed: { id: string; path: string; status: string }[] = [];
  for (const r of rows) {
    const isAbandoned = r.status === "awaiting_upload";
    const done = await db
      .update(visits)
      .set({
        audioPath: null,
        audioDeletedAt: now,
        updatedAt: now,
        ...(isAbandoned ? { status: "failed", errorCode: "never_uploaded" } : {}),
      })
      .where(and(eq(visits.id, r.id), eq(visits.status, r.status), isNull(visits.audioDeletedAt)))
      .returning({ id: visits.id });
    if (!done.length) continue;
    if (r.audioPath) claimed.push({ id: r.id, path: r.audioPath, status: r.status });
    await logAccess(r.id, "system", "audio_purged", isAbandoned ? "never_uploaded" : "retention");
  }
  if (!claimed.length) return 0;
  try {
    await deleteVisitAudio(claimed.map((c) => c.path));
  } catch (err) {
    // Storage didn't confirm the delete: put the pointers back so the next
    // run retries, rather than leaving files nobody can find.
    for (const c of claimed) {
      await db
        .update(visits)
        .set({ audioPath: c.path, audioDeletedAt: null, status: c.status, errorCode: null })
        .where(eq(visits.id, c.id));
    }
    throw err;
  }
  return claimed.length;
}

/** Removes every visit (audio + encrypted text) for a user. Used by account purge and "delete all visits". */
export async function purgeAllVisitsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ id: visits.id, audioPath: visits.audioPath })
    .from(visits)
    .where(eq(visits.userId, userId));
  if (!rows.length) return 0;
  const audio = rows.map((r: { audioPath: string | null }) => r.audioPath!).filter(Boolean);
  if (audio.length) {
    // Never drop the rows while files still exist in storage with nothing
    // pointing at them. If storage isn't reachable, fail and retry later.
    if (!isVisitStorageConfigured()) throw new Error("visit_storage_not_configured");
    await deleteVisitAudio(audio);
  }
  await db.delete(visits).where(eq(visits.userId, userId));
  for (const r of rows) await logAccess(r.id, userId, "deleted", "all_visits");
  return rows.length;
}
