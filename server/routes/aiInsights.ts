import { Router } from "express";
import { chatText } from "../lib/aiClient";
import rateLimit from "express-rate-limit";
import { FF } from "../config/flags";
import { getUserStats } from "../services/insightStats";
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 60 * 60 * 24 }); // 24h cache
const router = Router();

router.use(rateLimit({ windowMs: 60_000, max: 10 }));

router.post("/insights", async (req, res) => {
  if (!FF.AI_TRENDS) {
    return res.status(404).json({ error: "Feature disabled" });
  }

  const userId = (req as any).user?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Wave 3 - Multi-Entry: Support flexible lookback windows
  type RangeWindow = "7d" | "14d" | "30d" | "60d" | "90d" | "180d" | "365d" | "today" | "last_symptom" | "up_to_now";
  const validRanges: RangeWindow[] = ["7d", "14d", "30d", "60d", "90d", "180d", "365d", "today", "last_symptom", "up_to_now"];
  
  const range = (req.body?.range as RangeWindow) ?? "30d";
  if (!validRanges.includes(range)) {
    return res.status(400).json({ error: `Invalid range. Must be one of: ${validRanges.join(", ")}` });
  }
  
  const key = `ai:${userId}:${range}`;

  // Check cache first
  const cached = cache.get(key);
  if (cached) {
    res.set("Cache-Control", "no-store");
    return res.json(cached);
  }

  try {
    // Get numeric facts only (no PII)
    const facts = await getUserStats(userId, range);

    // Safety: truncate any inputs
    const systemPrompt = `You are Zebby, a supportive EDS companion. Provide non-medical-advice insights.
Use the numeric facts to identify trends, gentle ideas, and discussion prompts.
Never diagnose. Keep it brief, kind, and practical.`;

    const userPrompt = `Here are anonymized facts for ${range}.
Facts (JSON): ${JSON.stringify(facts)}
Please return JSON with keys: analysis (<=140 words), trendBullets (3-5 short bullets), actionIdeas (3 concise, optional steps).`;

    let result;
    try {
      const text =
        (await chatText(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          { temperature: 0.3, json: true },
        )) || "{}";
      result = JSON.parse(text);
    } catch (error) {
      console.error("AI insights error:", error);
      result = {
        analysis: "We couldn't generate insights right now.",
        trendBullets: [],
        actionIdeas: [],
      };
    }

    const payload = {
      range,
      analysis: String(result.analysis ?? ""),
      trendBullets: (result.trendBullets ?? []).slice(0, 5).map(String),
      actionIdeas: (result.actionIdeas ?? []).slice(0, 3).map(String),
      disclaimer: "Informational only — not medical advice.",
    };

    cache.set(key, payload);
    res.set("Cache-Control", "no-store");
    return res.json(payload);
  } catch (error) {
    console.error("Error generating AI insights:", error);
    return res.status(500).json({ error: "Failed to generate insights" });
  }
});

export default router;
