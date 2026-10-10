/**
 * Visit Recorder consent wording, shared by the app and the server.
 *
 * Change the wording → bump the version. The server stores the version with
 * every opt-in and every visit, so we can always show exactly what a user saw.
 * Wording is DRAFT until the health-privacy lawyer signs off.
 */

export const VISIT_OPTIN_VERSION = "vr-optin-2026-10-09";

export const VISIT_OPTIN_TEXT = {
  title: "Turn on Visit Recorder",
  lines: [
    "Zebby can record your doctor visits, turn them into a transcript, and write you a plain-English recap with questions for next time.",
    "You'll always ask everyone in the room before recording. You're responsible for getting their OK.",
    "Audio is deleted once you approve the transcript (30 days at most). Transcripts stay encrypted until you delete them. You can turn this off anytime in Settings.",
  ],
  policyLinkLabel: "How we handle your health data",
  button: "Turn on Visit Recorder",
} as const;

export const VISIT_ROOM_CONSENT_VERSION = "vr-room-2026-10-09";

export const VISIT_ROOM_CONSENT_TEXT = {
  sayThis: "Mind if I record this so I can remember what you said?",
  button: "Everyone's OK, start recording",
  helper: "Ask out loud right after you tap. Zebby listens for the OK in the first minute.",
} as const;

export const VISIT_SETTINGS = ["office", "er", "hospital", "video", "other"] as const;
export const VISIT_PARTICIPANTS = ["me", "nurse", "doctor", "family", "other"] as const;
