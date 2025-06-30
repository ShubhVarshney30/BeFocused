// services/gemini.js (Gemini-Free Version)

const NUDGE_CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export async function getGeminiNudge(fromUrl, toUrl, userContext = {}) {
  const cacheKey = `${extractDomain(fromUrl)}|${extractDomain(toUrl)}`;
  if (NUDGE_CACHE.has(cacheKey)) {
    return NUDGE_CACHE.get(cacheKey);
  }

  const nudge = generateLocalNudge(fromUrl, toUrl, userContext);
  NUDGE_CACHE.set(cacheKey, nudge);
  return nudge;
}

function generateLocalNudge(fromUrl, toUrl, context = {}) {
  const fromDomain = extractDomain(fromUrl);
  const toDomain = extractDomain(toUrl);
  const taskType = context.taskType || detectContext(fromDomain);
  const streak = context.streak || 0;
  const tone = context.tonePreference || "supportive";

  const baseNudges = {
    coding: [
      `Your code on ${fromDomain} needs your magic 🧠`,
      `Fixing bugs beats scrolling ${toDomain} 🐞`,
      `You're in the zone! Stay with ${fromDomain} 💻`
    ],
    study: [
      `Keep learning on ${fromDomain}! 📚`,
      `Your streak is strong—focus on ${fromDomain} 🔥`,
      `Ignore ${toDomain}, ace ${fromDomain} instead ✍️`
    ],
    writing: [
      `Your doc on ${fromDomain} is almost there ✨`,
      `Finish that sentence on ${fromDomain} 💬`,
      `Don’t let ${toDomain} steal your writing flow ✍️`
    ],
    neutral: [
      `You're doing great—don't lose focus! 💪`,
      `Back to ${fromDomain}, you're almost done ⏳`,
      `${toDomain} can wait. ${fromDomain} matters now. 🚀`
    ]
  };

  const selected = baseNudges[taskType] || baseNudges.neutral;
  return selected[Math.floor(Math.random() * selected.length)];
}

function detectContext(domain) {
  domain = domain.toLowerCase();
  if (domain.includes('git') || domain.includes('stack') || domain.includes('code')) return 'coding';
  if (domain.includes('notion') || domain.includes('doc') || domain.includes('write')) return 'writing';
  if (domain.includes('learn') || domain.includes('study') || domain.includes('academy')) return 'study';
  return 'neutral';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}
