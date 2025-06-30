/* Enhanced Tab & Focus Monitor - background.js v5.1 (Improved Penalty System) */
import { getGeminiNudge } from './services/gemini.js';
import { classifySite } from './services/classifier.js';

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
const MIN_DISTRACTION_DURATION = 5000; // 5 seconds minimum to record
const GRACE_PERIOD = 60 * 1000; // 1 minute grace period for short distractions

// Dynamic variables
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
let NUDGE_COOLDOWN = 1000 * 60 * 10; // Start with 10 minutes, adjusts dynamically

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
        lastPenaltyCheck: Date.now(),
        lastRewardTime: Date.now(),
        dailyStreak: 0,
        lastProductiveDay: new Date(Date.now() - 86400000).toDateString(),
        distractionStatsTrend: [],
        aiInsights: {
          lastClassification: null,
          lastNudge: null,
          lastDistractionFlow: null,
          geminiUsage: {
            count: 0,
            lastUsed: null,
            errors: 0
          }
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
  if (duration >= MIN_DISTRACTION_DURATION) {
    updateDistractionStats(currentDistraction.url, duration);
  }
}

async function handlePotentialDistraction(fromUrl, toUrl, toTitle) {
  const isDistraction = isDistractionSite(toUrl);
  let classification = 'neutral';
  let nudge = '';
  
  if (isDistraction) {
    classification = 'distraction';
    
    if (Date.now() - lastNudgeTime > NUDGE_COOLDOWN) {
      try {
        const userContext = await getUserProductivityContext();
        const fromContext = getDomainContext(fromUrl);
        
        nudge = await getGeminiNudge(fromUrl, toUrl, {
          ...userContext,
          context: fromContext,
          timeOfDay: new Date().getHours()
        });
        
        // Update usage stats
        await chrome.storage.local.set({ 
          'aiInsights.geminiUsage.count': (userContext.aiInsights?.geminiUsage?.count || 0) + 1,
          'aiInsights.geminiUsage.lastUsed': Date.now()
        });
        
        lastNudgeTime = Date.now();
        NUDGE_COOLDOWN = Math.max(1000 * 60 * 5, NUDGE_COOLDOWN * 0.9); // Reduce cooldown on success
      } catch (error) {
        console.error("Gemini nudge generation failed:", error);
        nudge = generateLocalNudge(fromUrl, toUrl);
        
        // Increase cooldown on error
        NUDGE_COOLDOWN = Math.min(1000 * 60 * 30, NUDGE_COOLDOWN * 1.5);
        
        await chrome.storage.local.set({
          'aiInsights.geminiUsage.errors': (userContext.aiInsights?.geminiUsage?.errors || 0) + 1
        });
      }

      if (Date.now() - lastNotificationTime > NOTIFICATION_COOLDOWN) {
        showEnhancedNotification(nudge, classification);
        lastNotificationTime = Date.now();
      }
    }

    await chrome.storage.local.set({ 
      'aiInsights.lastClassification': classification,
      'aiInsights.lastNudge': nudge,
      'aiInsights.lastDistractionFlow': {
        from: fromUrl,
        to: toUrl,
        timestamp: Date.now(),
        context: getDomainContext(fromUrl)
      }
    });
  }
}

// Stats Management - Improved Version
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
  await applyProductivitySystems(stats, duration);
}

// Improved Penalty System
async function applyProductivitySystems(stats, newDuration) {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get([
    'sprintActive', 'lastPenaltyCheck', 'lastRewardTime',
    'dailyStreak', 'lastProductiveDay', 'distractionStats',
    'totalPenaltyToday', 'userPoints'
  ]);

  // Check if we need to reset daily stats
  if (data.lastReset !== today) {
    await resetDailyStats();
    return;
  }

  // Penalty System - Improved
  const lastPenaltyCheck = data.lastPenaltyCheck || Date.now();
  const timeSinceLastCheck = Date.now() - lastPenaltyCheck;
  
  // Only apply penalty if the new distraction is significant
  if (newDuration >= GRACE_PERIOD) {
    const penaltyChunks = Math.floor(newDuration / DISTRACTION_PENALTY_INTERVAL);
    
    if (penaltyChunks > 0) {
      const penaltyPoints = penaltyChunks * DISTRACTION_PENALTY_POINTS;
      const newPoints = Math.max(0, (data.userPoints || 0) - penaltyPoints);
      
      await chrome.storage.local.set({
        userPoints: newPoints,
        totalPenaltyToday: (data.totalPenaltyToday || 0) + penaltyPoints,
        lastPenaltyCheck: Date.now()
      });

      if (Date.now() - lastNotificationTime > NOTIFICATION_COOLDOWN) {
        showNotification(
          '⛔ Distraction Penalty',
          `${penaltyPoints} points deducted for ${Math.round(newDuration/60000)} mins on ${getDomain(currentDistraction.url)}!`
        );
        lastNotificationTime = Date.now();
      }
    }
  }
  
  // Reward System - Improved
  const now = Date.now();
  if (now - (data.lastRewardTime || 0) >= NO_DISTRACTION_REWARD_INTERVAL) {
    const totalDistractionTime = Object.values(stats).reduce((sum, site) => sum + (site.today || 0), 0);
    
    if (totalDistractionTime < (NO_DISTRACTION_REWARD_INTERVAL / 2)) { // Less than 30 mins distraction
      const rewardPoints = NO_DISTRACTION_REWARD_POINTS;
      const newPoints = (data.userPoints || 0) + rewardPoints;
      
      await chrome.storage.local.set({
        userPoints: newPoints,
        lastRewardTime: now
      });

      showNotification(
        '🎁 Focus Reward',
        `+${rewardPoints} points for staying focused!`
      );
    }
  }
  
  // Streak System - Improved
  const totalDistractionToday = Object.values(stats).reduce((sum, site) => sum + (site.today || 0), 0);
  const wasProductive = totalDistractionToday < 10 * 60 * 1000; // Less than 10 mins distraction
  
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
  
  updateTrendStats(stats);
}

// Helper Functions (unchanged from original)
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

function getDomainContext(url) {
  const domain = getDomain(url).toLowerCase();
  if (domain.includes('docs') || domain.includes('notion')) return 'document';
  if (domain.includes('github') || domain.includes('gitlab')) return 'coding';
  if (domain.includes('jira') || domain.includes('trello')) return 'planning';
  if (domain.includes('mail') || domain.includes('outlook')) return 'email';
  if (domain.includes('figma') || domain.includes('adobe')) return 'design';
  return 'work';
}

async function getUserProductivityContext() {
  const data = await chrome.storage.local.get([
    'dailyStreak',
    'userPoints',
    'sprintActive',
    'distractionStats',
    'aiInsights'
  ]);
  
  return {
    streak: data.dailyStreak || 0,
    points: data.userPoints || 0,
    inSprint: data.sprintActive || false,
    topDistractions: Object.entries(data.distractionStats || {})
      .sort((a, b) => b[1].today - a[1].today)
      .slice(0, 3)
      .map(([domain]) => domain),
    aiInsights: data.aiInsights
  };
}

function generateLocalNudge(fromUrl, toUrl) {
  const fromDomain = getDomain(fromUrl);
  const toDomain = getDomain(toUrl);
  const context = getDomainContext(fromUrl);
  
  const nudges = {
    document: [
      `Your document on ${fromDomain} is waiting to be finished`,
      `You were editing ${fromDomain} - just a few more changes?`
    ],
    coding: [
      `Your code on ${fromDomain} needs your attention`,
      `Those bugs on ${fromDomain} won't fix themselves`
    ],
    email: [
      `Your inbox on ${fromDomain} can wait a bit longer`,
      `Those emails aren't going anywhere`
    ],
    default: [
      `You were focused on ${fromDomain} - want to continue?`,
      `${toDomain} can wait - you're doing great!`
    ]
  };
  
  const contextNudges = nudges[context] || nudges.default;
  return contextNudges[Math.floor(Math.random() * contextNudges.length)];
}

function showEnhancedNotification(nudge, classification) {
  const icons = {
    distraction: '⚠️',
    neutral: '💡',
    productive: '✅'
  };
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: `${icons[classification] || '🤖'} Focus Alert`,
    message: nudge,
    priority: 2,
    buttons: [{
      title: 'Dismiss',
      iconUrl: 'close.png'
    }]
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

// Helper function for excessive tab switching
function handleExcessiveTabSwitching(count) {
  chrome.storage.local.get(['alertsEnabled'], (data) => {
    if (data.alertsEnabled !== false && Date.now() - lastNotificationTime > NOTIFICATION_COOLDOWN) {
      showNotification(
        '🔄 Too Many Tab Switches',
        `You've switched tabs ${count} times in ${TIME_WINDOW_MINUTES} minutes. Try to focus!`
      );
      lastNotificationTime = Date.now();
    }
  });
}

// Helper function to reset daily stats
async function resetDailyStats() {
  const today = new Date().toDateString();
  const data = await chrome.storage.local.get(['distractionStats', 'userPoints']);
  
  // Archive yesterday's stats
  const trendData = data.distractionStatsTrend || [];
  trendData.push({
    date: new Date(Date.now() - 86400000).toDateString(),
    totalTime: Object.values(data.distractionStats || {}).reduce((sum, site) => sum + (site.today || 0), 0)
  });
  
  // Reset for new day
  await chrome.storage.local.set({
    distractionStats: {},
    totalPenaltyToday: 0,
    lastReset: today,
    lastPenaltyCheck: Date.now(),
    lastRewardTime: Date.now(),
    distractionStatsTrend: trendData.slice(-7) // Keep last 7 days
  });
}

// Helper function to update trend stats
function updateTrendStats(currentStats) {
  chrome.storage.local.get(['distractionStatsTrend'], (data) => {
    const trendData = data.distractionStatsTrend || [];
    const today = new Date().toDateString();
    
    // Update today's entry if exists, or create new
    const todayIndex = trendData.findIndex(d => d.date === today);
    const totalToday = Object.values(currentStats).reduce((sum, site) => sum + (site.today || 0), 0);
    
    if (todayIndex >= 0) {
      trendData[todayIndex].totalTime = totalToday;
    } else {
      trendData.push({
        date: today,
        totalTime: totalToday
      });
    }
    
    chrome.storage.local.set({ distractionStatsTrend: trendData.slice(-7) });
  });
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 1
  });
}