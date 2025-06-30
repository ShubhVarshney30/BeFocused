// services/deepseek.js
import { DEEPSEEK_API_KEY } from '../config.js';

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const nudgeCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes cache
const API_COOLDOWN = 1000 * 5; // 5 seconds between API calls

let lastApiCall = 0;
let apiLock = false;

export async function getDeepSeekNudge(fromUrl, toUrl) {
  const cacheKey = generateCacheKey(fromUrl, toUrl);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);
  
  if (!fromDomain || !toDomain) {
    console.warn("Invalid URLs for nudge:", fromUrl, toUrl);
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
    return processed;
  } catch (err) {
    console.error("DeepSeek API failed:", err);
    return getContextualFallback(fromUrl, toUrl);
  } finally {
    setTimeout(() => { apiLock = false }, API_COOLDOWN);
  }
}

async function fetchDeepSeek(prompt, retries = 2) {
  try {
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
            content: "You are a focus coach that generates short, empathetic nudges to help people stay productive."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  } catch (err) {
    if (retries > 0) {
      console.warn(`Retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 1000 * (3 - retries)));
      return fetchDeepSeek(prompt, retries - 1);
    }
    throw err;
  }
}

// Helper functions (keep from your original implementation)
function buildNudgePrompt(fromDomain, toDomain) {
  return `Create a short (15-30 word) motivational nudge to help someone return from ${toDomain} to their productive work on ${fromDomain}. 
  Make it empathetic and encouraging. Example: "You were doing great work on ${fromDomain} - just a little more focus!"`;
}

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

function isValidNudge(nudge) {
  return nudge && nudge.length >= 10 && nudge.length <= 120 && !nudge.includes("http");
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

function getContextualFallback(fromUrl, toUrl) {
  const fromDomain = extractDomain(fromUrl);
  const ctx = inferContext(fromUrl);
  const fallbackList = FALLBACK_NUDGES[ctx] || FALLBACK_NUDGES.general;
  return fallbackList[Math.floor(Math.random() * fallbackList.length)].replace("{from}", fromDomain);
}

const FALLBACK_NUDGES = {
  document: [ "Your document on {from} is waiting to be finished", "You were editing {from} - just a few more changes?" ],
  research: [ "Your research on {from} was getting interesting", "Those sources on {from} won't analyze themselves" ],
  learning: [ "Your lesson on {from} was almost complete", "That concept on {from} needs more practice" ],
  creative: [ "Your creative flow on {from} was inspiring", "{from} holds your unfinished masterpiece" ],
  communication: [ "Your conversation on {from} needs your reply", "People are waiting for you on {from}" ],
  general: [ "You were doing great work on {from}", "Ready to pick up where you left off on {from}?" ]
};

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