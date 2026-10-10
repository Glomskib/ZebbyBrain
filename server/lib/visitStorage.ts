/**
 * Private audio storage for Visit Recorder (Supabase Storage).
 *
 * Pattern ported from FlashFlow's lib/storage/mint-upload-url.ts: the phone
 * uploads audio straight to storage through a short-lived signed link, so big
 * files never pass through our Express server (which caps bodies at 512 KB and
 * requests at 10 seconds on purpose).
 *
 * Rules:
 *   - The bucket is private. There are no public URLs, ever.
 *   - Only this server holds the service-role key (never the browser/app).
 *   - Audio-only MIME types, size cap from VISIT_AUDIO_MAX_MB (default 50).
 *   - Objects live at <userId>/<visitId>.<ext>.
 *   - Audio is deleted by the retention job (server/lib/visitRetention.ts).
 *
 * Env (Brandon enters these in the host's secret settings):
 *   SUPABASE_URL                e.g. https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   server-only secret
 *   VISIT_AUDIO_BUCKET          optional, default "visit-audio"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const VISIT_AUDIO_BUCKET = process.env.VISIT_AUDIO_BUCKET || "visit-audio";
// Must not exceed the Supabase project's global upload limit (50 MB on the
// Free plan; raise it in the Supabase dashboard on Pro). 50 MB is roughly
// 3+ hours of the speech-quality audio the app records.
export const VISIT_AUDIO_MAX_BYTES =
  Number(process.env.VISIT_AUDIO_MAX_MB || 50) * 1024 * 1024;

export const VISIT_AUDIO_MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

let client: SupabaseClient | null = null;
let bucketReady = false;

/** True once the private bucket was confirmed (or created) private at boot. */
export function isVisitBucketReady(): boolean {
  return bucketReady;
}

export function isVisitStorageConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function admin(): SupabaseClient {
  if (!isVisitStorageConfigured()) {
    throw new Error("visit_storage_not_configured");
  }
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Creates the private bucket if it doesn't exist and keeps it private. Safe to run on every boot. */
export async function ensureVisitAudioBucket(): Promise<void> {
  if (!isVisitStorageConfigured()) return;
  const sb = admin();
  const options = {
    public: false,
    fileSizeLimit: VISIT_AUDIO_MAX_BYTES,
    allowedMimeTypes: Object.keys(VISIT_AUDIO_MIME_TO_EXT),
  };
  bucketReady = false;
  const { data } = await sb.storage.getBucket(VISIT_AUDIO_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(VISIT_AUDIO_BUCKET, options);
    if (error && !/already exists/i.test(error.message)) throw error;
  } else {
    const { error } = await sb.storage.updateBucket(VISIT_AUDIO_BUCKET, options);
    if (error) throw error;
  }
  // Never serve from a bucket we could not confirm is private.
  const { data: check, error: checkErr } = await sb.storage.getBucket(VISIT_AUDIO_BUCKET);
  if (checkErr || !check) throw checkErr ?? new Error("bucket_missing_after_setup");
  if (check.public) throw new Error("visit_audio_bucket_is_public");
  bucketReady = true;
}

export function visitAudioPath(userId: string, visitId: string, mime: string): string {
  const ext = VISIT_AUDIO_MIME_TO_EXT[mime.split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error("unsupported_audio_type");
  return `${userId}/${visitId}.${ext}`;
}

/**
 * A one-time signed upload link (valid about 2 hours). The app sends the file
 * with: PUT <signedUrl>, header Content-Type: <mime>, body = the audio.
 */
export async function createVisitUploadLink(path: string): Promise<{ signedUrl: string; path: string }> {
  const { data, error } = await admin().storage.from(VISIT_AUDIO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("upload_link_failed");
  return { signedUrl: data.signedUrl, path: data.path };
}

/** Confirms the object exists and returns its size in bytes, or null if missing. */
export async function statVisitAudio(path: string): Promise<{ bytes: number; mime: string | null } | null> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await admin().storage.from(VISIT_AUDIO_BUCKET).list(folder, { search: name, limit: 10 });
  if (error) throw error;
  const hit = (data || []).find((o) => o.name === name);
  if (!hit) return null;
  const meta = (hit.metadata || {}) as { size?: number; mimetype?: string };
  return { bytes: Number(meta.size ?? 0), mime: meta.mimetype ?? null };
}

/** Downloads audio for transcription (server-side only). */
export async function downloadVisitAudio(path: string): Promise<Blob> {
  const { data, error } = await admin().storage.from(VISIT_AUDIO_BUCKET).download(path);
  if (error || !data) throw error ?? new Error("download_failed");
  return data;
}

/** Permanently deletes audio objects. Missing objects are not an error. */
export async function deleteVisitAudio(paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean);
  if (!clean.length) return;
  const { error } = await admin().storage.from(VISIT_AUDIO_BUCKET).remove(clean);
  if (error) throw error;
}
