// Complete replacement with Gemini implementation
import { GEMINI_API_KEY } from '../config.js';

const NUDGE_CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export async function getGeminiNudge(fromUrl, toUrl, userContext = {}) {
  const cacheKey = `${extractDomain(fromUrl)}|${extractDomain(toUrl)}`;
  if (NUDGE_CACHE.has(cacheKey)) {
    return NUDGE_CACHE.get(cacheKey);
  }

  const prompt = buildGeminiPrompt(fromUrl, toUrl, userContext);
  
  try {
    const response = await fetchGeminiAPI(prompt);
    const nudge = processNudgeResponse(response);
    NUDGE_CACHE.set(cacheKey, nudge);
    return nudge;
  } catch (error) {
    console.error("Gemini API error:", error);
    return generateFallbackNudge(fromUrl);
  }
}

function buildGeminiPrompt(fromUrl, toUrl, context) {
  return `Generate a 15-25 word nudge to refocus from ${extractDomain(toUrl)} back to ${extractDomain(fromUrl)}.
Context: 
- Working on: ${context.taskType || 'task'} 
- Streak: ${context.streak || 0} days
- Tone: ${context.tonePreference || 'supportive'}
Format: "Your [task] on [domain] needs... [emoji]"`;
}

async function fetchGeminiAPI(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 50
        }
      })
    }
  );
  return await response.json();
}