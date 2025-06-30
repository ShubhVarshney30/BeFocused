// services/deepseek.js
import { DEEPSEEK_API_KEY } from '../config.js';

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const nudgeCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes cache
const API_COOLDOWN = 1000 * 5; // 5 seconds between API calls
const MAX_API_ERRORS = 3; // Max errors before disabling API

let lastApiCall = 0;
let apiLock = false;
let apiErrorCount = 0;
let apiDisabled = false;

/**
 * Main function to get a nudge from DeepSeek API or fallback
 * @param {string} fromUrl The URL user is coming from
 * @param {string} toUrl The URL user is going to
 * @returns {Promise<string>} The nudge message
 */
export async function getDeepSeekNudge(fromUrl, toUrl) {
  // Check cache first
  const cacheKey = generateCacheKey(fromUrl, toUrl);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // Extract domains
  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);
  
  // Validate domains
  if (!fromDomain || !toDomain) {
    console.warn("Invalid URLs for nudge:", fromUrl, toUrl);
    return getContextualFallback(fromUrl, toUrl);
  }

  // Check if API is disabled
  if (apiDisabled) {
    console.warn("API disabled - using fallback");
    return getContextualFallback(fromUrl, toUrl);
  }

  // Enforce cooldown
  if (Date.now() - lastApiCall < API_COOLDOWN || apiLock) {
    console.warn("API cooldown in effect");
    return getContextualFallback(fromUrl, toUrl);
  }

  apiLock = true;
  const prompt = buildNudgePrompt(fromDomain, toDomain);

  try {
    const nudge = await fetchDeepSeek(prompt);
    if (!isValidNudge(nudge)) throw new Error("Invalid nudge response");
    
    const processed = processNudge(nudge, fromDomain);
    updateCache(cacheKey, processed);
    lastApiCall = Date.now();
    apiErrorCount = 0; // Reset error count on success
    return processed;
  } catch (err) {
    console.error("DeepSeek API failed:", err);
    apiErrorCount++;
    
    // Disable API if we hit max errors or get balance error
    if (err.message.includes('Insufficient Balance') || apiErrorCount >= MAX_API_ERRORS) {
      disableDeepSeekAPI();
    }
    
    return getContextualFallback(fromUrl, toUrl);
  } finally {
    setTimeout(() => { apiLock = false }, API_COOLDOWN);
  }
}

/**
 * Fetch nudge from DeepSeek API
 * @param {string} prompt The prompt to send
 * @param {number} retries Number of retries remaining
 * @returns {Promise<string>} The nudge message
 */
async function fetchDeepSeek(prompt, retries = 2) {
  try {
    // Validate API key
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your-api-key-here') {
      throw new Error('Invalid or missing API key');
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a focus coach that generates short, empathetic nudges (15-30 words) to help people stay productive."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 50
      }),
      timeout: 5000 // 5 second timeout
    });

    // Handle specific errors
    if (response.status === 402) {
      throw new Error('API Error: 402 - Insufficient Balance');
    }
    if (response.status === 429) {
      throw new Error('API Error: 429 - Rate Limit Exceeded');
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error: ${response.status} - ${errorData.message || errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  } catch (err) {
    // Only retry on certain errors
    if (retries > 0 && 
        !err.message.includes('Insufficient Balance') && 
        !err.message.includes('Invalid or missing API key')) {
      console.warn(`Retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 1000 * (3 - retries)));
      return fetchDeepSeek(prompt, retries - 1);
    }
    throw err;
  }
}

/**
 * Disable API calls and switch to fallback mode
 */
function disableDeepSeekAPI() {
  apiDisabled = true;
  console.warn('DeepSeek API disabled due to errors or insufficient balance');
  // You could add a timer to re-enable after some time
  // setTimeout(() => { apiDisabled = false; }, 1000 * 60 * 60); // 1 hour
}

/**
 * Manually reset the API status
 */
export function resetDeepSeekAPI() {
  apiDisabled = false;
  apiErrorCount = 0;
  console.log('DeepSeek API status reset');
}

/**
 * Build the prompt for the nudge
 */
function buildNudgePrompt(fromDomain, toDomain) {
  return `Create a short (15-30 word) motivational nudge to help someone return from ${toDomain} to their productive work on ${fromDomain}. 
  Make it empathetic and encouraging. Example: "You were doing great work on ${fromDomain} - just a little more focus!"`;
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return domain.replace("www.", "").split(".")[0];
  } catch {
    return url.split("/")[0].replace("www.", "");
  }
}

/**
 * Generate cache key from URLs
 */
function generateCacheKey(from, to) {
  return `${extractDomain(from)}|${extractDomain(to)}`;
}

/**
 * Validate nudge response
 */
function isValidNudge(nudge) {
  return nudge && nudge.length >= 10 && nudge.length <= 120 && !nudge.includes("http");
}

/**
 * Process the nudge before returning
 */
function processNudge(nudge, fromDomain) {
  // Ensure the fromDomain is mentioned
  if (!nudge.includes(fromDomain)) {
    return `${nudge} (Remember your work on ${fromDomain})`;
  }
  return nudge;
}

/**
 * Get from cache with TTL check
 */
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

/**
 * Update cache with new nudge
 */
function updateCache(key, nudge) {
  nudgeCache.set(key, {
    nudge,
    timestamp: Date.now()
  });
}

/**
 * Get contextual fallback message
 */
function getContextualFallback(fromUrl, toUrl) {
  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);
  const ctx = inferContext(fromUrl);
  const fallbackList = FALLBACK_NUDGES[ctx] || FALLBACK_NUDGES.general;
  
  // Enhance fallback with both domains if available
  const enhancedFallbacks = fallbackList.map(nudge => 
    nudge.replace("{from}", fromDomain) + 
    (toDomain ? ` (You were on ${toDomain})` : '')
  );
  
  return enhancedFallbacks[Math.floor(Math.random() * enhancedFallbacks.length)];
}

/**
 * Fallback nudge messages by context
 */
const FALLBACK_NUDGES = {
  document: [ 
    "Your document on {from} is waiting to be finished", 
    "You were editing {from} - just a few more changes?",
    "That important document on {from} needs your attention"
  ],
  research: [ 
    "Your research on {from} was getting interesting", 
    "Those sources on {from} won't analyze themselves",
    "Your findings on {from} could lead to breakthroughs"
  ],
  coding: [
    "Your code on {from} is almost working",
    "Just one more test to run on {from}",
    "That bug on {from} won't fix itself"
  ],
  learning: [ 
    "Your lesson on {from} was almost complete", 
    "That concept on {from} needs more practice",
    "The knowledge on {from} is waiting for you"
  ],
  creative: [ 
    "Your creative flow on {from} was inspiring", 
    "{from} holds your unfinished masterpiece",
    "Your creative spark on {from} is still glowing"
  ],
  communication: [ 
    "Your conversation on {from} needs your reply", 
    "People are waiting for you on {from}",
    "Your connections on {from} value your input"
  ],
  general: [ 
    "You were doing great work on {from}", 
    "Ready to pick up where you left off on {from}?",
    "Your focus on {from} was impressive - let's continue",
    "The work on {from} deserves your attention",
    "{from} is where your productivity shines"
  ]
};

/**
 * Infer context from URL
 */
function inferContext(url) {
  const domain = extractDomain(url).toLowerCase();
  if (domain.includes("docs") || domain.includes("notion") || domain.includes("word")) return "document";
  if (domain.includes("github") || domain.includes("gitlab") || domain.includes("code")) return "coding";
  if (domain.includes("jstor") || domain.includes("research") || domain.includes("academic")) return "research";
  if (domain.includes("coursera") || domain.includes("udemy") || domain.includes("learn")) return "learning";
  if (domain.includes("figma") || domain.includes("canva") || domain.includes("creative")) return "creative";
  if (domain.includes("mail") || domain.includes("messag") || domain.includes("slack")) return "communication";
  return "general";
}