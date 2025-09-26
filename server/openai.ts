import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export async function generateEmpathicReflection(
  symptoms: string[], 
  intensity: number, 
  notes?: string
): Promise<{
  reflection: string;
  sentiment: string;
  stamps: string[];
}> {
  const symptomsList = symptoms.join(", ");
  const intensityDescription = getIntensityDescription(intensity);
  
  const prompt = `You are Zebby, a compassionate AI companion for people with EDS (Ehlers-Danlos Syndrome) and other rare conditions. Your role is to provide empathetic, validating responses to symptom logs.

User reported symptoms: ${symptomsList}
Intensity level: ${intensity}/10 (${intensityDescription})
Additional notes: ${notes || "None provided"}

Generate an empathetic reflection that:
1. Validates their experience without dismissing it
2. Shows understanding of EDS/rare condition challenges
3. Offers gentle support and encouragement
4. Avoids medical advice or diagnosis
5. Uses warm, caring language that makes them feel understood

Respond in JSON format with:
- reflection: A 2-3 sentence empathetic response
- sentiment: One word describing the tone (validating, supportive, understanding, encouraging)
- stamps: Array of 2-3 encouraging words/phrases for visual stamps

Keep the reflection conversational and personal, as if speaking to a friend who needs understanding.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are Zebby, an empathetic AI companion for people with EDS and rare conditions. Always respond with validating, supportive messages that make users feel understood."
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      reflection: result.reflection || "I hear you, and what you're experiencing is valid. Your body is working hard, and it's okay to acknowledge that this is challenging.",
      sentiment: result.sentiment || "validating",
      stamps: result.stamps || ["Validated", "Understood", "Supported"]
    };
  } catch (error) {
    console.error("Failed to generate AI reflection:", error);
    
    // Fallback empathetic response
    return {
      reflection: "Thank you for sharing this with me. What you're experiencing sounds really challenging, and I want you to know that your feelings about this are completely valid.",
      sentiment: "supportive",
      stamps: ["Heard", "Valid", "Supported"]
    };
  }
}

function getIntensityDescription(intensity: number): string {
  if (intensity <= 2) return "mild";
  if (intensity <= 4) return "mild to moderate";
  if (intensity <= 6) return "moderate";
  if (intensity <= 8) return "moderate to severe";
  return "severe";
}

export async function generatePersonalizedInsight(
  recentSymptoms: Array<{ symptoms: string[], intensity: number, timestamp: Date }>
): Promise<string> {
  if (recentSymptoms.length === 0) {
    return "Keep tracking your symptoms to help me understand your patterns better.";
  }

  const symptomsText = recentSymptoms
    .map(log => `${log.symptoms.join(", ")} (${log.intensity}/10)`)
    .join("; ");

  const prompt = `Based on these recent symptom logs from an EDS patient, provide a gentle, encouraging insight about patterns you notice. Keep it supportive and avoid medical advice.

Recent symptoms: ${symptomsText}

Provide a brief, encouraging insight in 1-2 sentences that might help them feel understood or notice positive patterns.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are Zebby, providing gentle insights about symptom patterns. Always be encouraging and supportive."
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return response.choices[0].message.content || "You're doing great by tracking these patterns. Keep listening to your body.";
  } catch (error) {
    console.error("Failed to generate insight:", error);
    return "You're doing amazing by staying aware of your body's signals. Every day you track is a step toward better understanding yourself.";
  }
}
