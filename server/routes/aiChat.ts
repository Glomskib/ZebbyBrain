import { Router } from "express";
import rateLimit from "express-rate-limit";
import { FF } from "../config/flags";
import { getUserStats } from "../services/insightStats";

const router = Router();
router.use(rateLimit({ windowMs: 60_000, max: 10 }));

router.post("/chat", async (req, res) => {
  if (!FF.AVATAR) {
    return res.status(404).json({ error: "Feature disabled" });
  }

  const userId = (req as any).user?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { message, entryContext } = req.body ?? {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // Pull quick snapshot of user stats
    const facts = await getUserStats(userId, "30d");

    // Graceful fallback when OpenAI isn't configured — never 500.
    if (!process.env.OPENAI_API_KEY) {
      res.set("Cache-Control", "no-store");
      return res.json({
        reply: fallbackReply(String(message), facts),
        fallback: true,
      });
    }

    const systemPrompt = `You are Zebby, a warm, validating EDS companion. You never diagnose.
Use facts provided; reflect briefly and offer at most one gentle, optional idea.
Avoid PII; keep under 120 words.`;

    const userMsg = [
      `User message: ${String(message || "")}`,
      entryContext ? `Entry context: ${JSON.stringify(entryContext)}` : "",
      `Facts: ${JSON.stringify(facts)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.4,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "I'm here with you.";

    res.set("Cache-Control", "no-store");
    return res.json({ reply: text });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(500).json({ error: "AI unavailable" });
  }
});

function fallbackReply(message: string, facts: any): string {
  const m = message.toLowerCase();
  const intense = facts?.avgIntensity ?? null;
  const top = facts?.topSymptom ?? null;

  const warm = [
    "I hear you. You're doing harder work than most people realize.",
    "You don't have to push through — you get to pace.",
    "Take this slowly. I'm right here.",
  ];

  let tail = "";
  if (/(flare|bad|worse|pain|hurts|hurt)/.test(m)) {
    tail =
      " When it's flaring, a gentle grounding exercise in Calm Corner can take the edge off while you ride it out.";
  } else if (/(sleep|tired|exhausted|fatigue)/.test(m)) {
    tail =
      " Rest is data, not a setback. If hydration and salt have been low today, those tiny boosts tend to help POTS-type fatigue.";
  } else if (/(doctor|appointment|gp|specialist)/.test(m)) {
    tail =
      " Doctor Prep can turn your last 30 days into a one-page brief you can hand to your provider.";
  } else if (/(track|log|symptom)/.test(m)) {
    tail =
      " Even a 10-second log counts — intensity + one note is enough to see patterns.";
  }

  const opener = warm[Math.floor(Math.random() * warm.length)];
  const summary =
    intense != null && top
      ? ` Over your last 30 days, ${top} has been your most-logged symptom (avg ${intense}/10).`
      : "";

  return `${opener}${summary}${tail}`.trim();
}

export default router;
