import { GEMINI_API_KEY } from '../config.js';

const nudgeCache = new Map();
const CACHE_TTL = 1000 * 60 * 30;
const API_COOLDOWN = 1000 * 5;

let lastApiCall = 0;
let apiLock = false;

const FALLBACK_NUDGES = {
  document: [ "Your document on {from} is waiting to be finished", "You were editing {from} - just a few more changes?" ],
  research: [ "Your research on {from} was getting interesting", "Those sources on {from} won't analyze themselves" ],
  learning: [ "Your lesson on {from} was almost complete", "That concept on {from} needs more practice" ],
  creative: [ "Your creative flow on {from} was inspiring", "{from} holds your unfinished masterpiece" ],
  communication: [ "Your conversation on {from} needs your reply", "People are waiting for you on {from}" ],
  general: [ "You were doing great work on {from}", "Ready to pick up where you left off on {from}?" ]
};

export async function getPersonalizedNudge(fromUrl, toUrl) {
  const cacheKey = generateCacheKey(fromUrl, toUrl);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);
  if (!fromDomain || !toDomain) {
    console.warn("❌ Invalid URLs for nudge:", fromUrl, toUrl);
    return getContextualFallback(fromUrl, toUrl);
  }

  // Enforce cooldown
  if (Date.now() - lastApiCall < API_COOLDOWN || apiLock) {
    console.warn("⏳ API cooldown in effect.");
    return getContextualFallback(fromUrl, toUrl);
  }

  apiLock = true;
  const prompt = buildNudgePrompt(fromUrl, toUrl);

  if (!prompt || prompt.length < 20) {
    console.error("❌ Invalid prompt:", prompt);
    apiLock = false;
    return getContextualFallback(fromUrl, toUrl);
  }

  try {
    const nudge = await fetchWithRetry(prompt);
    if (!isValidNudge(nudge)) throw new Error("Bad nudge");

    const processed = processNudge(nudge, fromUrl);
    updateCache(cacheKey, processed);
    lastApiCall = Date.now();
    return processed;
  } catch (err) {
    console.error("🚨 Gemini Nudge API failed:", err.message);
    return getContextualFallback(fromUrl, toUrl);
  } finally {
    setTimeout(() => { apiLock = false }, API_COOLDOWN);
  }
}

// Enhanced API fetch
async function fetchWithRetry(prompt, retries = 2) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 40,
          topP: 0.9,
          topK: 40
        }
      })
    });

    if (res.status === 429) throw new Error("Rate limit exceeded (429)");
    if (res.status === 400) throw new Error("Bad Request (400)");

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch (err) {
    if (retries > 0) {
      console.warn(`Retrying Gemini... (${retries})`);
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(prompt, retries - 1);
    }
    throw err;
  }
}

// Build prompt
function buildNudgePrompt(fromUrl, toUrl) {
  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);

  return `
As a focus coach, generate a short (max 20 words) empathetic motivational nudge:

From: ${fromDomain} (productive work on ${inferContext(fromUrl)})
To: ${toDomain} (distraction)

Examples:
- "Your work on ${fromDomain} needs your brilliant mind!"
- "Almost done with ${fromDomain}? Just a bit more focus!"
`.trim();
}

// Context tags
function inferContext(url) {
  const domain = extractDomain(url).toLowerCase();
  if (domain.includes("docs") || domain.includes("notion")) return "document";
  if (domain.includes("github") || domain.includes("gitlab")) return "coding";
  if (domain.includes("jstor") || domain.includes("research")) return "research";
  if (domain.includes("coursera") || domain.includes("learn")) return "learning";
  if (domain.includes("figma") || domain.includes("canva")) return "creative";
  if (domain.includes("mail") || domain.includes("messag")) return "communication";
  return "general";
}

// Utilities
function extractDomain(url) {
  try {
    const domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return domain.replace("www.", "").split(".")[0];
  } catch {
    return url.split("/")[0].replace("www.", "");
  }
}

function generateCacheKey(from, to) {
  return `${extractDomain(from)}|${extractDomain(to)}`;
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
    timestamp: Date.now()
  });
}

function isValidNudge(nudge) {
  return nudge && nudge.length >= 10 && nudge.length <= 60 && !nudge.includes("http");
}

function processNudge(nudge, fromUrl) {
  const domain = extractDomain(fromUrl);
  let clean = nudge.replace(/["'\n]/g, "").replace(/\s{2,}/g, " ").trim();

  if (!clean.toLowerCase().includes(domain)) {
    clean += ` (${domain})`;
  }

  if (Math.random() < 0.3) {
    const emojis = ["💡", "🎯", "✨", "⚡", "📚"];
    clean = `${emojis[Math.floor(Math.random() * emojis.length)]} ${clean}`;
  }

  return clean;
}

function getContextualFallback(fromUrl, toUrl) {
  const domain = extractDomain(fromUrl);
  const ctx = inferContext(fromUrl);
  const fallbackList = FALLBACK_NUDGES[ctx] || FALLBACK_NUDGES.general;
  return fallbackList[Math.floor(Math.random() * fallbackList.length)].replace("{from}", domain);
}
