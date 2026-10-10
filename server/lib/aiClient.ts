/**
 * One OpenAI client for all of Zebby's World.
 *
 * Every AI call (Ask Zebby, AI insights, reflections, and Visit Recorder
 * transcription + recaps) goes through here. That gives us one place to:
 *
 *   - point at the dedicated Zebby OpenAI org/project (the one covered by the
 *     Healthcare Addendum), via OPENAI_ORG_ID / OPENAI_PROJECT_ID
 *   - keep keys server-side only (the browser never talks to OpenAI)
 *   - apply the same timeout and retry rules everywhere
 *
 * Env:
 *   OPENAI_API_KEY      required for real AI; without it callers fall back
 *   OPENAI_ORG_ID       optional, the Zebby org id
 *   OPENAI_PROJECT_ID   optional, the Zebby project id
 *   OPENAI_MODEL        default chat model for long-form features (default gpt-5)
 *   OPENAI_FAST_MODEL   default model for short chat replies (default gpt-4o-mini)
 */
import OpenAI from "openai";

export const OPENAI_AVAILABLE = !!process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5";
export const OPENAI_FAST_MODEL = process.env.OPENAI_FAST_MODEL ?? "gpt-4o-mini";

let client: OpenAI | null = null;

/** Returns the shared client, or null when OPENAI_API_KEY is not set. */
export function getOpenAI(): OpenAI | null {
  if (!OPENAI_AVAILABLE) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID || undefined,
      project: process.env.OPENAI_PROJECT_ID || undefined,
      timeout: 120_000,
      maxRetries: 2,
    });
  }
  return client;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Simple chat completion that returns the reply text.
 * Throws "openai_disabled" when no key is configured so callers can use
 * their existing graceful fallbacks.
 */
export async function chatText(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; json?: boolean } = {},
): Promise<string> {
  const ai = getOpenAI();
  if (!ai) throw new Error("openai_disabled");
  const response = await ai.chat.completions.create({
    model: opts.model ?? OPENAI_FAST_MODEL,
    messages,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  return response.choices?.[0]?.message?.content ?? "";
}
