/* Enhanced Tab & Focus Monitor - background.js v6.1 */
import { getGeminiNudge } from './services/gemini.js';
import { classifySite } from './services/classifier.js';

// ======================
// CONSTANTS
// ======================
const TIME_WINDOW_MINUTES = 20;
const MAX_TIME = TIME_WINDOW_MINUTES * 60 * 1000;
const THRESHOLD = 10;
const POINTS_KEY = 'userPoints';
const FOCUS_SPRINT_DURATION = 25 * 60 * 1000;
const POINTS_PER_SPRINT = 10;
const DISTRACTION_PENALTY_INTERVAL = 5 * 60 * 1000;
const BASE_PENALTY_POINTS = 5;
const NO_DISTRACTION_REWARD_INTERVAL = 60 * 60 * 1000;
const NO_DISTRACTION_REWARD_POINTS = 15;
const NOTIFICATION_COOLDOWN = 1000 * 60 * 5;
const MIN_DISTRACTION_DURATION = 5000;
const ANALYSIS_TIMEOUT = 3000;
const MAX_LOG_ENTRIES = 200;
const MAX_TAB_SWITCHES = 100;
const UTC_TODAY = () => new Date().toISOString().split('T')[0];

// ======================
// STATE MANAGEMENT
// ======================
let state = {
  tabSwitchTimestamps: [],
  sprintTimeout: null,
  currentDistraction: {
    url: null,
    domain: null,
    startTime: null
  },
  lastFocusedUrl: null,
  lastNotificationTime: 0,
  lastNudgeTime: 0,
  nudgeCooldown: 1000 * 60 * 10,
  isProcessingNudge: false,
  isProcessingStats: false,
  injectedTabs: new Set() // Track injected tabs to avoid duplicate injections
};

// ======================
// INITIALIZATION
// ======================
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.tabs.onActivated.addListener(handleTabSwitch);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.alarms.create('cleanup', { periodInMinutes: 60 });

async function initialize() {
  try {
    const today = UTC_TODAY();
    const { lastReset } = await storageGet('lastReset');
    
    if (lastReset !== today) {
      await storageSet({
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
        lastProductiveDay: new Date(Date.now() - 86400000).toISOString().split('T')[0],
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
        },
        eventLogs: []
      });
      logEvent('Storage initialized', { newDay: true });
    }

    // Inject content scripts on all eligible tabs
    injectContentScripts();
  } catch (error) {
    console.error("Initialization failed:", error);
    logEvent('InitError', { error: error.message });
  }
}

// ======================
// CONTENT SCRIPT MANAGEMENT
// ======================
function injectContentScripts() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (shouldInjectContentScript(tab)) {
        injectContentScript(tab.id);
      }
    });
  });
}

function shouldInjectContentScript(tab) {
  return (
    tab.url && 
    (tab.url.startsWith('http://') || tab.url.startsWith('https://')) &&
    !state.injectedTabs.has(tab.id)
  );
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScripts/floatingButton.js']
    });
    state.injectedTabs.add(tabId);
    logEvent('ContentScriptInjected', { tabId });
  } catch (error) {
    console.error('Content script injection failed:', error);
    logEvent('ContentScriptInjectionError', {
      tabId,
      error: error.message
    });
  }
}

// ======================
// TAB EVENT HANDLERS
// ======================
async function handleTabSwitch(activeInfo) {
  const now = Date.now();
  
  try {
    // Update tab switch tracking
    state.tabSwitchTimestamps = state.tabSwitchTimestamps
      .slice(-MAX_TAB_SWITCHES)
      .filter(ts => now - ts < MAX_TIME);
    state.tabSwitchTimestamps.push(now);
    
    await storageSet({ 
      tabSwitchCount: state.tabSwitchTimestamps.length 
    });
    
    if (state.tabSwitchTimestamps.length > THRESHOLD) {
      handleExcessiveTabSwitching(state.tabSwitchTimestamps.length);
    }

    const tab = await chrome.tabs.get(activeInfo.tabId);
    const toUrl = tab?.url || '';
    
    if (state.lastFocusedUrl && toUrl && toUrl !== state.lastFocusedUrl) {
      await handlePotentialDistraction(state.lastFocusedUrl, toUrl, tab?.title || '');
    }

    // Inject content script if needed
    if (shouldInjectContentScript(tab)) {
      injectContentScript(tab.id);
    }

    state.lastFocusedUrl = toUrl;
  } catch (err) {
    console.error("Tab switch error:", err);
    logEvent('TabSwitchError', { error: err.message });
  }
}

function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.active) {
    checkCurrentDistraction();
    
    // Inject content script when a tab finishes loading
    if (shouldInjectContentScript(tab)) {
      injectContentScript(tab.id);
    }
  }
}

// ======================
// DISTRACTION SYSTEM
// ======================
function checkCurrentDistraction() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.url) return;

    const url = tabs[0].url;
    const isDistracting = isDistractionSite(url);
    const domain = getDomain(url);

    if (isDistracting) {
      if (!state.currentDistraction.url || state.currentDistraction.url !== url) {
        if (state.currentDistraction.url) recordDistractionTime();
        state.currentDistraction = { url, domain, startTime: Date.now() };
      }
    } else if (state.currentDistraction.url) {
      recordDistractionTime();
      state.currentDistraction = { url: null, domain: null, startTime: null };
    }
  });
}

async function recordDistractionTime() {
  if (!state.currentDistraction.url || !state.currentDistraction.startTime) return;

  const duration = Date.now() - state.currentDistraction.startTime;
  if (duration >= MIN_DISTRACTION_DURATION) {
    try {
      await updateDistractionStats(state.currentDistraction.url, duration);
    } catch (error) {
      console.error("Distraction recording failed:", error);
      logEvent('DistractionRecordError', { 
        url: state.currentDistraction.url,
        duration,
        error: error.message 
      });
    }
  }
}

async function handlePotentialDistraction(fromUrl, toUrl, toTitle) {
  if (state.isProcessingNudge) return;
  state.isProcessingNudge = true;

  const isDistraction = isDistractionSite(toUrl);
  let classification = 'neutral';
  let nudge = '';
  
  if (isDistraction && Date.now() - state.lastNudgeTime > state.nudgeCooldown) {
    try {
      const [userContext, fromContext] = await Promise.all([
        safeGetContext(),
        getDomainContext(fromUrl)
      ]);

      try {
        nudge = await generateNudge(fromUrl, toUrl, userContext, fromContext);
        classification = 'distraction';
        state.lastNudgeTime = Date.now();
        state.nudgeCooldown = Math.max(1000 * 60 * 5, state.nudgeCooldown * 0.9);
        
        await updateGeminiUsage(true);
        logEvent('NudgeGenerated', {
          from: getDomain(fromUrl),
          to: getDomain(toUrl),
          source: 'gemini'
        });
      } catch (aiError) {
        nudge = generateLocalNudge(fromUrl, toUrl);
        state.nudgeCooldown = Math.min(1000 * 60 * 30, state.nudgeCooldown * 1.5);
        
        await updateGeminiUsage(false);
        logEvent('NudgeFallback', {
          from: getDomain(fromUrl),
          to: getDomain(toUrl),
          error: aiError.message
        });
      }

      if (Date.now() - state.lastNotificationTime > NOTIFICATION_COOLDOWN) {
        showEnhancedNotification(nudge, classification);
        state.lastNotificationTime = Date.now();
      }

      await storageSet({ 
        'aiInsights.lastClassification': classification,
        'aiInsights.lastNudge': nudge,
        'aiInsights.lastDistractionFlow': {
          from: fromUrl,
          to: toUrl,
          timestamp: Date.now(),
          context: fromContext
        }
      });
    } catch (error) {
      console.error("Nudge processing failed:", error);
      logEvent('NudgeError', { error: error.message });
    }
  }
  state.isProcessingNudge = false;
}

// ======================
// STATS MANAGEMENT
// ======================
async function updateDistractionStats(url, duration) {
  if (state.isProcessingStats) return;
  state.isProcessingStats = true;

  try {
    const today = UTC_TODAY();
    const { distractionStats = {}, lastReset } = await storageGet(['distractionStats', 'lastReset']);
    
    if (lastReset !== today) {
      await resetDailyStats();
      return;
    }

    const domain = getDomain(url);
    const stats = distractionStats[domain] || { 
      total: 0, today: 0, count: 0, sessions: [] 
    };

    // Atomic update
    const updatedStats = {
      ...distractionStats,
      [domain]: {
        ...stats,
        total: stats.total + Math.floor(duration),
        today: stats.today + Math.floor(duration),
        count: stats.count + 1,
        sessions: [
          ...stats.sessions,
          { start: state.currentDistraction.startTime, end: Date.now(), duration }
        ].slice(-50) // Keep last 50 sessions
      }
    };

    await storageSet({ distractionStats: updatedStats });
    await applyProductivitySystems(updatedStats);
  } finally {
    state.isProcessingStats = false;
  }
}

async function applyProductivitySystems(stats) {
  const today = UTC_TODAY();
  const {
    sprintActive,
    lastPenaltyCheck = 0,
    lastRewardTime = 0,
    dailyStreak = 0,
    lastProductiveDay,
    userPoints = 100
  } = await storageGet([
    'sprintActive', 'lastPenaltyCheck', 'lastRewardTime',
    'dailyStreak', 'lastProductiveDay', 'userPoints'
  ]);

  const totalMs = Object.values(stats).reduce((sum, site) => sum + (site.today || 0), 0);

  // Penalty System
  const penaltyChunks = Math.floor((totalMs - lastPenaltyCheck) / DISTRACTION_PENALTY_INTERVAL);
  
  if (!sprintActive && penaltyChunks > 0) {
    const penaltyPoints = calculatePenalty(penaltyChunks, userPoints);
    const newPoints = Math.max(0, userPoints - penaltyPoints);
    
    await storageSet({
      userPoints: newPoints,
      totalPenaltyToday: (await storageGet('totalPenaltyToday')).totalPenaltyToday + penaltyPoints,
      lastPenaltyCheck: lastPenaltyCheck + penaltyChunks * DISTRACTION_PENALTY_INTERVAL
    });

    showNotification(
      '⛔ Distraction Penalty',
      `${penaltyPoints} points deducted for ${penaltyChunks * 5} mins distraction!`
    );
  }
  
  // Reward System
  if (Date.now() - lastRewardTime >= NO_DISTRACTION_REWARD_INTERVAL && 
      totalMs < NO_DISTRACTION_REWARD_INTERVAL) {
    await storageSet({
      userPoints: userPoints + NO_DISTRACTION_REWARD_POINTS,
      lastRewardTime: Date.now()
    });

    showNotification(
      '🎁 Focus Reward',
      `+${NO_DISTRACTION_REWARD_POINTS} points for 1 hour distraction-free!`
    );
  }
  
  // Streak System
  const wasProductive = (!sprintActive && totalMs < 10 * 60 * 1000);
  if (wasProductive && lastProductiveDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const newStreak = lastProductiveDay === yesterday ? dailyStreak + 1 : 1;
    
    await storageSet({
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

// ======================
// HELPER FUNCTIONS
// ======================
function isDistractionSite(url) {
  if (!url) return false;
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return [
      'youtube.com', 'facebook.com', 'instagram.com',
      'twitter.com', 'reddit.com', 'tiktok.com',
      'netflix.com', 'twitch.tv', '9gag.com'
    ].some(d => domain === d); // Exact match only
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
  
  return (nudges[context] || nudges.default)[Math.floor(Math.random() * 2)];
}

async function safeGetContext() {
  try {
    const data = await storageGet([
      'dailyStreak', 'userPoints', 'sprintActive',
      'distractionStats', 'aiInsights'
    ]);
    
    return {
      streak: data.dailyStreak || 0,
      points: data.userPoints || 0,
      inSprint: data.sprintActive || false,
      topDistractions: Object.entries(data.distractionStats || {})
        .sort((a, b) => b[1].today - a[1].today)
        .slice(0, 3)
        .map(([domain]) => domain),
      aiInsights: data.aiInsights || {}
    };
  } catch (error) {
    console.error("Context fetch failed:", error);
    return {
      streak: 0,
      points: 0,
      inSprint: false,
      topDistractions: [],
      aiInsights: {}
    };
  }
}

async function generateNudge(fromUrl, toUrl, userContext, fromContext) {
  return Promise.race([
    getGeminiNudge(fromUrl, toUrl, {
      ...userContext,
      context: fromContext,
      timeOfDay: new Date().getHours()
    }),
    timeout(ANALYSIS_TIMEOUT, 'AnalysisTimeout')
  ]);
}

async function updateGeminiUsage(success) {
  const { aiInsights = {} } = await storageGet('aiInsights');
  const { geminiUsage = {} } = aiInsights;
  
  await storageSet({
    'aiInsights.geminiUsage': {
      count: (geminiUsage.count || 0) + 1,
      lastUsed: Date.now(),
      errors: geminiUsage.errors + (success ? 0 : 1)
    }
  });
}

function calculatePenalty(chunks, currentPoints) {
  const basePenalty = chunks * BASE_PENALTY_POINTS;
  const scaledPenalty = Math.floor(basePenalty * (1 + (currentPoints / 500)));
  return Math.min(scaledPenalty, currentPoints);
}

// ======================
// NOTIFICATION SYSTEM
// ======================
function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: title,
      message: message,
      priority: 2
    });
  } catch (error) {
    console.error("Notification failed:", error);
  }
}

function showEnhancedNotification(nudge, classification) {
  const icons = {
    distraction: '⚠️',
    neutral: '💡',
    productive: '✅'
  };
  
  try {
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
  } catch (error) {
    console.error("Enhanced notification failed:", error);
  }
}

// ======================
// STORAGE UTILITIES
// ======================
function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(data) {
  return new Promise(resolve => {
    chrome.storage.local.set(data, resolve);
  });
}

// ======================
// SPRINT SYSTEM
// ======================
function startFocusSprint() {
  stopFocusSprint();
  
  state.sprintTimeout = setTimeout(async () => {
    const { userPoints = 0 } = await storageGet('userPoints');
    await storageSet({
      userPoints: userPoints + POINTS_PER_SPRINT,
      sprintActive: false
    });
    
    showNotification('🎉 Sprint Complete!', `+${POINTS_PER_SPRINT} points earned!`);
    chrome.runtime.sendMessage({ type: "CONFETTI_BLAST" });
  }, FOCUS_SPRINT_DURATION);
}

function stopFocusSprint() {
  if (state.sprintTimeout) {
    clearTimeout(state.sprintTimeout);
    state.sprintTimeout = null;
  }
}

// ======================
// EVENT HANDLERS
// ======================
function handleStorageChange(changes, area) {
  if (area === 'local' && changes.sprintActive) {
    changes.sprintActive.newValue ? startFocusSprint() : stopFocusSprint();
  }
}

function handleExcessiveTabSwitching(count) {
  chrome.storage.local.get(['alertsEnabled'], (data) => {
    if (data.alertsEnabled !== false && Date.now() - state.lastNotificationTime > NOTIFICATION_COOLDOWN) {
      showNotification(
        '🔄 Too Many Tab Switches',
        `You've switched tabs ${count} times in ${TIME_WINDOW_MINUTES} minutes. Try to focus!`
      );
      state.lastNotificationTime = Date.now();
    }
  });
}

// ======================
// MAINTENANCE FUNCTIONS
// ======================
async function resetDailyStats() {
  const today = UTC_TODAY();
  const { distractionStats = {}, userPoints = 100 } = await storageGet(['distractionStats', 'userPoints']);
  
  // Archive yesterday
  const trendData = (await storageGet('distractionStatsTrend')).distractionStatsTrend || [];
  trendData.push({
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    totalTime: Object.values(distractionStats).reduce((sum, site) => sum + (site.today || 0), 0)
  });

  await storageSet({
    distractionStats: {},
    totalPenaltyToday: 0,
    lastReset: today,
    distractionStatsTrend: trendData.slice(-7),
    userPoints: Math.max(50, userPoints) // Never drop below 50
  });
}

function updateTrendStats(currentStats) {
  const today = UTC_TODAY();
  const totalToday = Object.values(currentStats).reduce((sum, site) => sum + (site.today || 0), 0);
  
  storageGet('distractionStatsTrend').then(({ distractionStatsTrend = [] }) => {
    const index = distractionStatsTrend.findIndex(d => d.date === today);
    
    const updatedTrend = index >= 0
      ? distractionStatsTrend.map((d, i) => i === index ? { ...d, totalTime: totalToday } : d)
      : [...distractionStatsTrend, { date: today, totalTime: totalToday }];
    
    storageSet({ distractionStatsTrend: updatedTrend.slice(-7) });
  });
}

// ======================
// UTILITY FUNCTIONS
// ======================
function timeout(ms, reason) {
  return new Promise((_, reject) => { 
    setTimeout(() => reject(new Error(reason)), ms);
  });
}

function logEvent(eventName, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: eventName,
    ...metadata
  };
  
  storageGet('eventLogs').then(({ eventLogs = [] }) => {
    storageSet({ eventLogs: [...eventLogs, logEntry].slice(-MAX_LOG_ENTRIES) });
  });
}

// ======================
// DEBUG UTILITIES
// ======================
if (typeof window !== 'undefined') {
  window.debug = {
    simulateTabSwitch: (from, to) => handlePotentialDistraction(
      `https://${from}`, 
      `https://${to}`
    ),
    forcePenalty: async (minutes) => {
      await updateDistractionStats(
        'https://youtube.com', 
        minutes * 60 * 1000
      );
    },
    resetPoints: () => storageSet({ userPoints: 100 }),
    startSprint: () => storageSet({ sprintActive: true }),
    stopSprint: () => storageSet({ sprintActive: false }),
    injectAllTabs: () => injectContentScripts()
  };
}

// Initialize
logEvent('BackgroundScriptStarted', { version: '6.1' });