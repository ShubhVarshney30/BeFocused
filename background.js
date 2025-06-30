/* Enhanced Tab & Focus Monitor - background.js v4.0 */
import { classifySite } from './services/classifier.js';
import { getPersonalizedNudge } from './services/gemini.js';

// Constants
const TIME_WINDOW_MINUTES = 20;
const MAX_TIME = TIME_WINDOW_MINUTES * 60 * 1000;
const THRESHOLD = 10;
const POINTS_KEY = 'userPoints';
const FOCUS_SPRINT_DURATION = 25 * 60 * 1000;
const POINTS_PER_SPRINT = 10;
const DISTRACTION_PENALTY_INTERVAL = 5 * 60 * 1000;
const DISTRACTION_PENALTY_POINTS = 5;
const NO_DISTRACTION_REWARD_INTERVAL = 60 * 60 * 1000;
const NO_DISTRACTION_REWARD_POINTS = 15;
const NOTIFICATION_COOLDOWN = 1000 * 60 * 5; // 5 minutes
const NUDGE_COOLDOWN = 1000 * 60 * 10; // 10 minutes between nudges

// State variables
let tabSwitchTimestamps = [];
let sprintTimeout = null;
let currentDistraction = {
  url: null,
  domain: null,
  startTime: null
};
let lastFocusedUrl = null;
let lastNotificationTime = 0;
let lastNudgeTime = 0;

// Initialize extension
chrome.runtime.onInstalled.addListener(initializeStorage);
chrome.runtime.onStartup.addListener(initializeStorage);
chrome.tabs.onActivated.addListener(handleTabSwitch);
chrome.tabs.onUpdated.addListener(handleTabUpdate);

// Core Functions
function initializeStorage() {
  const today = new Date().toDateString();
  chrome.storage.local.get(['lastReset'], (data) => {
    if (data.lastReset !== today) {
      const initialStats = {
        tabSwitchCount: 0,
        alertsEnabled: true,
        timeWarpEnabled: true,
        userPoints: 100,
        sprintActive: false,
        distractionStats: {},
        lastReset: today,
        totalPenaltyToday: 0,
        lastPenaltyCheck: 0,
        lastRewardTime: Date.now(),
        dailyStreak: 0,
        lastProductiveDay: new Date(Date.now() - 86400000).toDateString(),
        distractionStatsTrend: [],
        aiInsights: {
          lastClassification: null,
          lastNudge: null,
          lastDistractionFlow: null
        }
      };
      chrome.storage.local.set(initialStats);
    }
  });
}

// Tab Event Handlers
async function handleTabSwitch(activeInfo) {
  const now = Date.now();
  
  // Update tab switch timestamps
  tabSwitchTimestamps = tabSwitchTimestamps.filter(ts => now - ts < MAX_TIME);
  tabSwitchTimestamps.push(now);
  const newCount = tabSwitchTimestamps.length;
  
  await chrome.storage.local.set({ tabSwitchCount: newCount });
  if (newCount > THRESHOLD) handleExcessiveTabSwitching(newCount);

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const toUrl = tab?.url || '';
    const toTitle = tab?.title || '';

    if (lastFocusedUrl && toUrl && toUrl !== lastFocusedUrl) {
      await handlePotentialDistraction(lastFocusedUrl, toUrl, toTitle);
    }

    lastFocusedUrl = toUrl;
  } catch (err) {
    console.error("Tab processing error:", err);
  }
}

function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.active) {
    checkCurrentDistraction();
  }
}

// Distraction System
function checkCurrentDistraction() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.url) return;

    const url = tabs[0].url;
    const isDistracting = isDistractionSite(url);
    const domain = getDomain(url);

    if (isDistracting) {
      if (!currentDistraction.url || currentDistraction.url !== url) {
        if (currentDistraction.url) recordDistractionTime();
        currentDistraction = { url, domain, startTime: Date.now() };
      }
    } else if (currentDistraction.url) {
      recordDistractionTime();
      currentDistraction = { url: null, domain: null, startTime: null };
    }
  });
}

function recordDistractionTime() {
  if (!currentDistraction.url || !currentDistraction.startTime) return;

  const duration = Date.now() - currentDistraction.startTime;
  if (duration >= 5000) { // Only record if >5 seconds
    updateDistractionStats(currentDistraction.url, duration);
  }
}

async function handlePotentialDistraction(fromUrl, toUrl, toTitle) {
  const isDistraction = isDistractionSite(toUrl);
  let classification = 'neutral';
  let nudge = '';
  
  if (isDistraction) {
    classification = 'distraction';
    
    // Only generate nudge if cooldown has passed
    if (Date.now() - lastNudgeTime > NUDGE_COOLDOWN) {
      try {
        nudge = await getPersonalizedNudge(fromUrl, toUrl);
        lastNudgeTime = Date.now();
      } catch (error) {
        console.error("Nudge generation failed:", error);
        nudge = generateLocalNudge(fromUrl, toUrl);
      }

      if (Date.now() - lastNotificationTime > NOTIFICATION_COOLDOWN) {
        showNotification('⚠️ Focus Alert', nudge);
        lastNotificationTime = Date.now();
      }
    }

    await chrome.storage.local.set({ 
      'aiInsights.lastClassification': classification,
      'aiInsights.lastNudge': nudge,
      'aiInsights.lastDistractionFlow': {
        from: fromUrl,
        to: toUrl,
        timestamp: Date.now()
      }
    });
  }
}

// Stats Management
async function updateDistractionStats(url, duration) {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get([
    'distractionStats', 'lastReset', 'sprintActive',
    'lastPenaltyCheck', 'lastRewardTime', 'dailyStreak'
  ]);

  if (data.lastReset !== today) {
    await resetDailyStats();
    return;
  }

  const domain = getDomain(url);
  const stats = data.distractionStats || {};
  
  if (!stats[domain]) {
    stats[domain] = { 
      total: 0, 
      today: 0,
      count: 0, 
      lastVisit: 0,
      sessions: [] 
    };
  }
  
  stats[domain].total += duration;
  stats[domain].today += duration;
  stats[domain].count += 1;
  stats[domain].lastVisit = Date.now();
  stats[domain].sessions.push({
    start: currentDistraction.startTime,
    duration: duration,
    end: Date.now()
  });

  await chrome.storage.local.set({ distractionStats: stats });
  await applyProductivitySystems(stats);
}

async function applyProductivitySystems(stats) {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get([
    'sprintActive', 'lastPenaltyCheck', 'lastRewardTime',
    'dailyStreak', 'lastProductiveDay'
  ]);

  const totalMs = Object.values(stats).reduce((sum, site) => sum + (site.today || 0), 0);

  // Penalty System
  const lastPenaltyCheck = data.lastPenaltyCheck || 0;
  const penaltyChunks = Math.floor((totalMs - lastPenaltyCheck) / DISTRACTION_PENALTY_INTERVAL);
  
  if (!data.sprintActive && penaltyChunks > 0) {
    const penaltyPoints = penaltyChunks * DISTRACTION_PENALTY_POINTS;
    const { userPoints = 0 } = await chrome.storage.local.get(['userPoints']);
    const newPoints = Math.max(0, userPoints - penaltyPoints);
    
    await chrome.storage.local.set({
      userPoints: newPoints,
      totalPenaltyToday: (data.totalPenaltyToday || 0) + penaltyPoints,
      lastPenaltyCheck: lastPenaltyCheck + penaltyChunks * DISTRACTION_PENALTY_INTERVAL
    });

    showNotification(
      '⛔ Distraction Penalty',
      `${penaltyPoints} points deducted for ${penaltyChunks * 5} mins distraction!`
    );
  }
  
  // Reward System
  const now = Date.now();
  if (now - (data.lastRewardTime || 0) >= NO_DISTRACTION_REWARD_INTERVAL && 
      totalMs < NO_DISTRACTION_REWARD_INTERVAL) {
    const { userPoints = 0 } = await chrome.storage.local.get(['userPoints']);
    const newPoints = userPoints + NO_DISTRACTION_REWARD_POINTS;
    
    await chrome.storage.local.set({
      userPoints: newPoints,
      lastRewardTime: now
    });

    showNotification(
      '🎁 Focus Reward',
      `+${NO_DISTRACTION_REWARD_POINTS} points for 1 hour distraction-free!`
    );
  }
  
  // Streak System
  const wasProductive = (!data.sprintActive && totalMs < 10 * 60 * 1000);
  if (wasProductive && data.lastProductiveDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = (data.lastProductiveDay === yesterday) ? 
      (data.dailyStreak || 0) + 1 : 1;
    
    await chrome.storage.local.set({
      dailyStreak: newStreak,
      lastProductiveDay: today
    });

    showNotification(
      `🔥 ${newStreak}-Day Streak!`,
      `You stayed productive today!`
    );
  }
  
  // Update trend data
  updateTrendStats(stats);
}

// Helper Functions
function isDistractionSite(url) {
  if (!url) return false;
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return [
      'youtube.com', 'facebook.com', 'instagram.com',
      'twitter.com', 'reddit.com', 'tiktok.com',
      'netflix.com', 'twitch.tv', '9gag.com'
    ].some(d => domain.includes(d));
  } catch {
    return false;
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, '');
  } catch {
    return 'unknown';
  }
}

function generateLocalNudge(fromUrl, toUrl) {
  const fromDomain = getDomain(fromUrl);
  const toDomain = getDomain(toUrl);
  
  const nudges = [
    `You were focused on ${fromDomain} - want to continue?`,
    `Quick break? ${fromDomain} is waiting!`,
    `${toDomain} can wait - you're doing great!`,
    `Remember your goal on ${fromDomain}`,
    `Your focus on ${fromDomain} was impressive!`
  ];
  
  return nudges[Math.floor(Math.random() * nudges.length)];
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 2
  });
}

// Sprint System
function startFocusSprint() {
  stopFocusSprint();
  
  sprintTimeout = setTimeout(() => {
    chrome.storage.local.get([POINTS_KEY], (data) => {
      const newPoints = (data[POINTS_KEY] || 0) + POINTS_PER_SPRINT;
      chrome.storage.local.set({
        userPoints: newPoints,
        sprintActive: false
      });
      
      showNotification('🎉 Sprint Complete!', `+${POINTS_PER_SPRINT} points earned!`);
      chrome.runtime.sendMessage({ type: "CONFETTI_BLAST" });
    });
  }, FOCUS_SPRINT_DURATION);
}

function stopFocusSprint() {
  if (sprintTimeout) {
    clearTimeout(sprintTimeout);
    sprintTimeout = null;
  }
}

// Storage Listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sprintActive) {
    changes.sprintActive.newValue ? startFocusSprint() : stopFocusSprint();
  }
});

// Cleanup
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    tabSwitchTimestamps = [];
    chrome.storage.local.set({ tabSwitchCount: 0 });
  }
});