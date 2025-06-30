// services/gemini.js v2.1
import { GEMINI_API_KEY } from '../config.js';

// Enhanced caching system with TTL and usage tracking
const nudgeCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const API_COOLDOWN = 1000 * 5; // 5 seconds between API calls
let lastApiCall = 0;

// Expanded fallback nudges with contextual variations
const FALLBACK_NUDGES = {
  document: [
    "Your document on {from} is waiting to be finished",
    "You were editing {from} - just a few more changes?",
    "{from} needs your attention to complete that draft"
  ],
  research: [
    "Your research on {from} was getting interesting",
    "Those sources on {from} won't analyze themselves",
    "Ready to continue your investigation on {from}?"
  ],
  learning: [
    "Your lesson on {from} was almost complete",
    "That concept on {from} needs more practice",
    "Knowledge awaits you back on {from}"
  ],
  creative: [
    "Your creative flow on {from} was inspiring",
    "{from} holds your unfinished masterpiece",
    "The muse is calling you back to {from}"
  ],
  communication: [
    "Your conversation on {from} needs your reply",
    "People are waiting for you on {from}",
    "That important discussion on {from} isn't over"
  ],
  general: [
    "You were doing great work on {from}",
    "Ready to pick up where you left off on {from}?",
    "Your focus on {from} was impressive - keep going!"
  ]
};

// Main nudge generation function with enhanced reliability
export async function getPersonalizedNudge(fromUrl, toUrl) {
  const cacheKey = generateCacheKey(fromUrl, toUrl);
  
  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // Rate limit protection
  if (Date.now() - lastApiCall < API_COOLDOWN) {
    return getFallbackNudge(fromUrl, toUrl);
  }

  try {
    const prompt = buildNudgePrompt(fromUrl, toUrl);
    const nudge = await fetchWithRetry(prompt);
    
    if (!isValidNudge(nudge)) {
      throw new Error('Invalid nudge format');
    }

    const processedNudge = processNudge(nudge, fromUrl);
    updateCache(cacheKey, processedNudge);
    lastApiCall = Date.now();
    
    return processedNudge;
  } catch (error) {
    console.error('Nudge generation failed:', error);
    return getContextualFallback(fromUrl, toUrl);
  }
}

// Enhanced API fetch with retry logic
async function fetchWithRetry(prompt, retries = 2) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 40,
            topP: 0.9,
            topK: 40
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_DEROGATORY",
              threshold: "BLOCK_ONLY_HIGH"
            }
          ]
        })
      }
    );

    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries)));
      return fetchWithRetry(prompt, retries - 1);
    }
    throw error;
  }
}

// Improved prompt engineering
function buildNudgePrompt(fromUrl, toUrl) {
  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);
  
  return `
As a focus coach, generate a SHORT (10-15 word) nudge to help users refocus. Follow these rules:

Context:
- From: ${fromDomain} (productive site about ${inferContext(fromUrl)})
- To: ${toDomain} (distraction)

Guidelines:
1. EMPATHETIC tone (no guilt)
2. Mention the SOURCE ("${fromDomain}")
3. MAX 20 words
4. No emojis (added later)
5. Focus on CONTINUITY ("keep going") or VALUE ("important work")

Examples:
- "Your work on ${fromDomain} needs your brilliant mind!"
- "Almost done with ${fromDomain}? Just a bit more focus!"
- "${fromDomain} holds your important progress - want to continue?"
`.trim();
}

// Context inference for better personalization
function inferContext(url) {
  const domain = extractDomain(url).toLowerCase();
  
  if (domain.includes('docs') || domain.includes('notion')) return 'document work';
  if (domain.includes('github') || domain.includes('gitlab')) return 'coding';
  if (domain.includes('research') || domain.includes('jstor')) return 'research';
  if (domain.includes('learn') || domain.includes('coursera')) return 'learning';
  if (domain.includes('figma') || domain.includes('canva')) return 'creative work';
  if (domain.includes('mail') || domain.includes('messag')) return 'communication';
  
  return 'important work';
}

// Enhanced nudge validation and processing
function isValidNudge(nudge) {
  return nudge && 
         nudge.length <= 60 && 
         nudge.length >= 10 && 
         !nudge.includes('http') && 
         !nudge.includes('sorry');
}

function processNudge(nudge, fromUrl) {
  const fromDomain = extractDomain(fromUrl);
  let processed = nudge
    .replace(/["'\n]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Ensure source domain is mentioned
  if (!processed.toLowerCase().includes(fromDomain.toLowerCase())) {
    processed = `${processed} (${fromDomain})`;
  }

  // Add occasional emoji (30% chance)
  if (Math.random() < 0.3) {
    const emojis = ['🚀', '💡', '🎯', '✨', '⚡', '🔍', '📚', '🖋️'];
    processed = `${emojis[Math.floor(Math.random() * emojis.length)]} ${processed}`;
  }

  return processed;
}

// Cache management utilities
function generateCacheKey(fromUrl, toUrl) {
  return `${extractDomain(fromUrl)}|${extractDomain(toUrl)}`;
}

function getFromCache(key) {
  if (nudgeCache.has(key)) {
    const { nudge, timestamp } = nudgeCache.get(key);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`♻️ Using cached nudge for ${key}`);
      return nudge;
    }
  }
  return null;
}

function updateCache(key, nudge) {
  nudgeCache.set(key, {
    nudge,
    timestamp: Date.now(),
    usageCount: (nudgeCache.get(key)?.usageCount || 0) + 1
  });
}

// Fallback system with contextual awareness
function getContextualFallback(fromUrl, toUrl) {
  const fromDomain = extractDomain(fromUrl);
  const context = inferContext(fromUrl).split(' ')[0]; // First word
  const category = FALLBACK_NUDGES[context] ? context : 'general';
  
  const nudges = FALLBACK_NUDGES[category];
  const selected = nudges[Math.floor(Math.random() * nudges.length)];
  
  return selected.replace('{from}', fromDomain);
}

// Domain extraction utilities
function extractDomain(url) {
  try {
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return domain.replace('www.', '').split('.')[0];
  } catch {
    return url.split('/')[0].replace('www.', '');
  }
}