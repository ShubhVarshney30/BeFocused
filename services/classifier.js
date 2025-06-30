// services/classifier.js

const classificationCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours cache

// Known site classifications
const FOCUS_SITES = new Set([
  'notion.so', 'docs.google.com', 'github.com', 'stackoverflow.com',
  'khanacademy.org', 'leetcode.com', 'coursera.org', 'edx.org'
]);

const DISTRACTION_SITES = new Set([
  'youtube.com', 'reddit.com', 'netflix.com', 'tiktok.com',
  'instagram.com', 'twitter.com', 'facebook.com', 'twitch.tv'
]);

export async function classifySite(titleOrDomain) {
  const cleanInput = sanitizeInput(titleOrDomain);
  if (!cleanInput) return 'neutral';

  // Check cache first
  const cached = getCachedClassification(cleanInput);
  if (cached) return cached;

  // Check known sites
  const knownClassification = checkKnownSites(cleanInput);
  if (knownClassification) return knownClassification;

  // Fallback keyword classification
  return keywordFallback(cleanInput);
}

// Helper functions
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return null;

  return input
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
}

function getCachedClassification(input) {
  if (classificationCache.has(input)) {
    const { classification, timestamp } = classificationCache.get(input);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`♻️ Using cached classification for "${input}"`);
      return classification;
    }
  }
  return null;
}

function checkKnownSites(input) {
  if (FOCUS_SITES.has(input)) return 'focus';
  if (DISTRACTION_SITES.has(input)) return 'distraction';
  return null;
}

function keywordFallback(input) {
  const focusKeywords = ['docs', 'work', 'study', 'learn', 'code', 'git', 'notion'];
  const distractionKeywords = ['watch', 'video', 'game', 'social', 'fun', 'tube', 'tok'];

  if (focusKeywords.some(kw => input.includes(kw))) return 'focus';
  if (distractionKeywords.some(kw => input.includes(kw))) return 'distraction';

  return 'neutral';
}
