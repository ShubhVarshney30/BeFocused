// services/classifier.js
import { GEMINI_API_KEY } from '../config.js';

// Cache to store classification results (avoids duplicate API calls)
const classificationCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours cache

export async function classifySite(titleOrDomain) {
  // Clean and normalize input
  const cleanInput = titleOrDomain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .trim();

  // Check cache first
  if (classificationCache.has(cleanInput)) {
    const { classification, timestamp } = classificationCache.get(cleanInput);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`♻️ Using cached classification for "${cleanInput}"`);
      return classification;
    }
  }

  console.log(`🔍 Classifying: "${cleanInput}"`);

  // Fallback keywords (expand as needed)
  const FOCUS_SITES = new Set([
    'notion.so', 'docs.google.com', 'github.com', 'stackoverflow.com',
    'khanacademy.org', 'leetcode.com', 'coursera.org', 'edx.org'
  ]);

  const DISTRACTION_SITES = new Set([
    'youtube.com', 'reddit.com', 'netflix.com', 'tiktok.com',
    'instagram.com', 'twitter.com', 'facebook.com', 'twitch.tv'
  ]);

  // First check against known sites (avoids API calls)
  const domain = cleanInput.toLowerCase();
  if (FOCUS_SITES.has(domain)) return cacheAndReturn('focus', cleanInput);
  if (DISTRACTION_SITES.has(domain)) return cacheAndReturn('distraction', cleanInput);

  // If unknown, use Gemini API
  try {
    const prompt = `Classify "${cleanInput}" as ONLY "focus" or "distraction" based on typical productivity use.`;
    
    const response = await fetchGeminiAPI(prompt, {
      temperature: 0.3, // Less creative, more deterministic
      maxOutputTokens: 5
    });

    const classification = response?.toLowerCase().trim();
    
    if (classification === 'focus' || classification === 'distraction') {
      return cacheAndReturn(classification, cleanInput);
    }
    
    throw new Error(`Unexpected response: ${classification}`);
  } catch (error) {
    console.error('❌ Classification error:', error);
    // Final fallback: check for keywords in domain
    return keywordFallback(cleanInput);
  }
}

// Helper functions
async function fetchGeminiAPI(prompt, generationConfig = {}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig
      })
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text;
}

function cacheAndReturn(classification, input) {
  classificationCache.set(input, {
    classification,
    timestamp: Date.now()
  });
  return classification;
}

function keywordFallback(input) {
  const lowerInput = input.toLowerCase();
  const focusKeywords = ['docs', 'work', 'study', 'learn', 'code'];
  const distractionKeywords = ['watch', 'video', 'game', 'social', 'fun'];

  if (focusKeywords.some(kw => lowerInput.includes(kw))) return 'focus';
  if (distractionKeywords.some(kw => lowerInput.includes(kw))) return 'distraction';
  return 'neutral'; // When uncertain
}