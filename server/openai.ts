import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export async function generateAnalyticalReflection(
  symptomEntries: Array<{ name: string; intensity: number; notes?: string }>,
  contextualData: {
    heartRate?: number;
    waterIntake?: number;
    sodiumIntake?: number;
    weatherTemp?: number;
    weatherCondition?: string;
    timestamp: Date;
    sessionNotes?: string;
  }
): Promise<{
  reflection: string;
  sentiment: string;
  stamps: string[];
}> {
  // Analyze symptom data
  const highestSymptom = symptomEntries.reduce((prev, curr) => 
    prev.intensity > curr.intensity ? prev : curr
  );
  const lowestSymptom = symptomEntries.reduce((prev, curr) => 
    prev.intensity < curr.intensity ? prev : curr
  );
  const averageIntensity = Math.round(
    symptomEntries.reduce((sum, entry) => sum + entry.intensity, 0) / symptomEntries.length
  );
  
  // Format time context
  const timeOfDay = getTimeOfDay(contextualData.timestamp);
  const dayOfWeek = contextualData.timestamp.toLocaleDateString('en-US', { weekday: 'long' });
  
  // Build contextual observations
  const contextualObservations = [];
  if (contextualData.heartRate) {
    const hrStatus = contextualData.heartRate > 100 ? 'elevated' : contextualData.heartRate < 60 ? 'low' : 'normal';
    contextualObservations.push(`Heart rate: ${contextualData.heartRate} bpm (${hrStatus})`);
  }
  if (contextualData.waterIntake !== undefined) {
    const hydrationStatus = contextualData.waterIntake < 1000 ? 'low' : contextualData.waterIntake > 2500 ? 'high' : 'moderate';
    contextualObservations.push(`Water intake: ${contextualData.waterIntake}ml (${hydrationStatus})`);
  }
  if (contextualData.sodiumIntake !== undefined) {
    const sodiumStatus = contextualData.sodiumIntake > 2300 ? 'high' : contextualData.sodiumIntake < 1500 ? 'low' : 'moderate';
    contextualObservations.push(`Sodium intake: ${contextualData.sodiumIntake}mg (${sodiumStatus})`);
  }
  if (contextualData.weatherTemp) {
    const tempStatus = contextualData.weatherTemp < 60 ? 'cold' : contextualData.weatherTemp > 80 ? 'warm' : 'mild';
    contextualObservations.push(`Weather: ${contextualData.weatherTemp}°F (${tempStatus})${contextualData.weatherCondition ? `, ${contextualData.weatherCondition.toLowerCase()}` : ''}`);
  }
  
  const prompt = `You are Zebby, an analytical health companion for EDS patients. Provide data-driven insights and actionable recommendations based on symptom patterns and contextual data.

**SYMPTOM ANALYSIS:**
${symptomEntries.map(entry => `• ${entry.name}: ${entry.intensity}/10${entry.notes ? ` (${entry.notes})` : ''}`).join('\n')}

**CONTEXTUAL DATA:**
• Time: ${timeOfDay} on ${dayOfWeek}
${contextualObservations.map(obs => `• ${obs}`).join('\n')}
${contextualData.sessionNotes ? `• Session notes: ${contextualData.sessionNotes}` : ''}

**KEY PATTERNS:**
• Highest symptom: ${highestSymptom.name} (${highestSymptom.intensity}/10)
• Lowest symptom: ${lowestSymptom.name} (${lowestSymptom.intensity}/10)
• Average intensity: ${averageIntensity}/10

Provide a focused analysis that:
1. **Identifies specific patterns** in the symptom data and contextual factors
2. **Makes concrete observations** about potential correlations (hydration, weather, heart rate, timing)
3. **Offers actionable recommendations** for lifestyle factors that may help
4. **Avoids medical advice** but provides practical insights
5. **Uses specific data points** rather than vague statements

Respond in JSON format with:
- reflection: 3-4 sentences of analytical insights with specific observations and actionable recommendations
- sentiment: analytical tone ("analytical", "observational", "insightful", "data-driven")
- stamps: Array of 2-3 data-focused tags (e.g., ["Pattern Identified", "Hydration Focus", "Timing Noted"])

Focus on concrete, actionable insights based on the actual data provided.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are Zebby, an analytical health companion specializing in EDS and rare condition symptom analysis. Provide concrete, data-driven insights and actionable recommendations based on symptom patterns and contextual factors."
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
      reflection: result.reflection || `Your ${highestSymptom.name} was most prominent at ${highestSymptom.intensity}/10. ${contextualObservations.length > 0 ? 'Based on your contextual data: ' + contextualObservations[0] + '.' : ''} Consider tracking this pattern over time to identify potential triggers.`,
      sentiment: result.sentiment || "analytical",
      stamps: result.stamps || ["Pattern Noted", "Data Tracked", "Insights Ready"]
    };
  } catch (error) {
    console.error("Failed to generate AI reflection:", error);
    
    // Analytical fallback using actual data
    const contextInsights = [];
    if (contextualData.heartRate && contextualData.heartRate > 100) {
      contextInsights.push(`elevated heart rate (${contextualData.heartRate} bpm)`);
    }
    if (contextualData.waterIntake && contextualData.waterIntake < 1000) {
      contextInsights.push(`low hydration (${contextualData.waterIntake}ml)`);
    }
    if (contextualData.sodiumIntake && contextualData.sodiumIntake > 2300) {
      contextInsights.push(`high sodium intake (${contextualData.sodiumIntake}mg)`);
    }
    
    const contextText = contextInsights.length > 0 
      ? ` Notable factors: ${contextInsights.join(', ')}.` 
      : '';
    
    return {
      reflection: `${highestSymptom.name} was your most intense symptom at ${highestSymptom.intensity}/10, with ${lowestSymptom.name} at ${lowestSymptom.intensity}/10.${contextText} ${timeOfDay} symptoms on ${contextualData.timestamp.toLocaleDateString('en-US', { weekday: 'long' })} may indicate specific triggers - continue tracking to identify patterns.`,
      sentiment: "analytical",
      stamps: ["Pattern Identified", contextInsights.length > 0 ? "Context Noted" : "Data Tracking", "Analysis Ready"]
    };
  }
}

function getTimeOfDay(timestamp: Date): string {
  const hour = timestamp.getHours();
  if (hour < 6) return 'early morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// Legacy function for backward compatibility
function getIntensityDescription(intensity: number): string {
  if (intensity <= 2) return "mild";
  if (intensity <= 4) return "mild to moderate";
  if (intensity <= 6) return "moderate";
  if (intensity <= 8) return "moderate to severe";
  return "severe";
}

// Keep old function name for backward compatibility but mark as deprecated
export const generateEmpathicReflection = generateAnalyticalReflection;

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
