/** Pure retention rules for Visit Recorder (no database access, safe to unit test). */
export const AUDIO_MAX_DAYS = 30;
export const ABANDONED_UPLOAD_HOURS = 24;

export function audioDeleteAfterFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + AUDIO_MAX_DAYS * 24 * 60 * 60 * 1000);
}
