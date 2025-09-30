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

export default router;
