import { Router } from "express";
import { storage } from "../storage";
import { generateEmbedding } from "../lib/embeddings";
import { z } from "zod";

const router = Router();

const edsKnowledgeBase = [
  {
    source: "eds-basics",
    title: "What is EDS?",
    content: "Ehlers-Danlos Syndrome (EDS) is a group of genetic connective tissue disorders. The most common type is hypermobile EDS (hEDS), characterized by joint hypermobility, skin hyperextensibility, and tissue fragility. People with EDS often experience chronic pain, frequent joint dislocations, fatigue, and various other symptoms affecting multiple body systems.",
  },
  {
    source: "eds-management",
    title: "Daily Management Tips",
    content: "Managing EDS involves gentle exercise, physical therapy focusing on joint stability, pacing activities to avoid overexertion, staying hydrated (especially important for those with POTS), maintaining adequate salt intake, using joint supports when needed, and working with a multidisciplinary medical team. Rest is crucial - listen to your body.",
  },
  {
    source: "pots-basics",
    title: "POTS and EDS",
    content: "Postural Orthostatic Tachycardia Syndrome (POTS) commonly occurs alongside EDS. POTS causes increased heart rate upon standing, dizziness, fatigue, and brain fog. Management includes increasing fluid and salt intake, compression garments, gradual position changes, and sometimes medications. Track your heart rate and hydration.",
  },
  {
    source: "pain-management",
    title: "Pain Management Strategies",
    content: "Non-medical pain management for EDS includes heat/ice therapy, gentle stretching, low-impact exercise like swimming or yoga, maintaining good posture, using assistive devices, rest breaks, stress management, and keeping a symptom diary to identify triggers. Some find TENS units, braces, or taping helpful.",
  },
  {
    source: "flare-management",
    title: "Managing Flares",
    content: "EDS flares can be triggered by weather changes, stress, overexertion, illness, or hormonal changes. During a flare: rest more, use heat/ice, gentle movement when possible, increase hydration, manage stress, and be kind to yourself. Flares are temporary - they will pass. Track patterns to identify your personal triggers.",
  },
  {
    source: "hydration-importance",
    title: "Hydration and Salt",
    content: "Proper hydration is critical for EDS, especially with POTS. Aim for 2-3 liters of water daily, increase salt intake (consult your doctor first), use electrolyte drinks, and avoid excessive caffeine or alcohol. Dehydration can worsen joint pain, fatigue, and POTS symptoms. Track your daily water intake.",
  },
  {
    source: "exercise-guidelines",
    title: "Safe Exercise with EDS",
    content: "Exercise should be low-impact and focus on muscle strengthening without overstretching joints. Swimming, water aerobics, recumbent cycling, and modified yoga are often well-tolerated. Avoid high-impact activities and extreme joint ranges. Start slowly, listen to your body, and work with a PT familiar with EDS.",
  },
  {
    source: "mental-health",
    title: "Mental Health and EDS",
    content: "Living with EDS can affect mental health. Chronic pain, medical gaslighting, and activity limitations are challenging. Support groups, therapy, mindfulness, and connecting with others who understand can help. You're not alone in this journey. Your feelings are valid. Be patient and compassionate with yourself.",
  },
];

router.post("/seed", async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Seed endpoint disabled in production" });
    }
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: "OpenAI API key not configured" });
    }

    console.log("Seeding EDS knowledge base...");
    
    for (const item of edsKnowledgeBase) {
      const embedding = await generateEmbedding(item.content);
      await storage.upsertKnowledgeChunk(
        item.source,
        item.title,
        item.content,
        embedding
      );
      console.log(`Seeded: ${item.title}`);
    }

    const chunks = await storage.getKnowledgeChunks(10);
    
    return res.json({
      message: "EDS knowledge base seeded successfully",
      count: chunks.length,
      chunks: chunks.map(c => ({ source: c.source, title: c.title })),
    });
  } catch (error) {
    console.error("Error seeding knowledge base:", error);
    return res.status(500).json({ error: "Failed to seed knowledge base" });
  }
});

const answerSchema = z.object({
  question: z.string().min(1),
  window: z.enum(["7d", "30d", "90d", "up_to_now"]).default("30d"),
});

router.post("/answer", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: "OpenAI API key not configured" });
    }

    const ragEnabled = process.env.FF_RAG === "true";
    if (!ragEnabled) {
      return res.status(400).json({ error: "RAG feature not enabled" });
    }

    const body = answerSchema.parse(req.body);
    const topK = parseInt(process.env.RAG_TOP_K || "6");

    const queryEmbedding = await generateEmbedding(body.question);

    const timeWindow = calculateTimeWindow(body.window);

    const [knowledgeChunks, userChunks] = await Promise.all([
      storage.searchKnowledgeChunks(queryEmbedding, Math.floor(topK / 2)),
      storage.searchUserChunks(req.user.id, queryEmbedding, Math.floor(topK / 2), timeWindow),
    ]);

    const edsContext = knowledgeChunks
      .map(c => `• ${c.title}: ${c.content}`)
      .join("\n");

    const userContext = userChunks
      .map(c => `• ${c.kind} (${c.occurredAt ? new Date(c.occurredAt).toLocaleDateString() : 'recent'}): ${c.content}`)
      .join("\n");

    const systemPrompt = `You are Zebby, a caring AI companion for people with EDS and rare conditions. You provide supportive, empathetic responses based on EDS knowledge and the user's health history.

IMPORTANT: You are NOT a medical professional. Never diagnose, prescribe, or provide medical advice. Always encourage users to consult healthcare providers for medical decisions.

EDS Knowledge Context:
${edsContext || "No specific EDS knowledge available."}

User's Recent Health History:
${userContext || "No recent health data available."}

Guidelines:
- Be warm, caring, and validating
- Acknowledge their experiences and patterns
- Suggest gentle, non-medical coping strategies
- Remind them this is supportive info, not medical advice
- Keep responses brief and actionable (3-5 sentences)`;

    const openai = (await import("openai")).default;
    const client = new openai({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: body.question },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const answer = completion.choices[0].message.content || "I'm here to help, but I couldn't generate a response. Please try again.";

    return res.json({
      answer,
      disclaimer: "This is supportive information, not medical advice. Always consult your healthcare provider.",
      sources: {
        edsKnowledge: knowledgeChunks.length,
        userHistory: userChunks.length,
      },
    });
  } catch (error: any) {
    console.error("Error generating RAG answer:", error);
    return res.status(500).json({ error: error.message || "Failed to generate answer" });
  }
});

function calculateTimeWindow(window: string): { from?: Date; to?: Date } {
  const now = new Date();
  const from = new Date();

  switch (window) {
    case "7d":
      from.setDate(now.getDate() - 7);
      break;
    case "30d":
      from.setDate(now.getDate() - 30);
      break;
    case "90d":
      from.setDate(now.getDate() - 90);
      break;
    case "up_to_now":
      return {};
  }

  return { from, to: now };
}

export default router;
