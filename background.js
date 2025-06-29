let tabSwitchTimestamps = [];
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

let sprintTimeout = null;
let currentDistractionStart = null;
let previousDistractionURL = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    tabSwitchCount: 0,
    alertsEnabled: true,
    timeWarpEnabled: true,
    userPoints: 0,
    sprintActive: false,
    distractionStats: {},
    lastReset: new Date().toDateString(),
    totalPenaltyToday: 0,
    lastPenaltyCheck: 0,
    lastRewardTime: Date.now(),
    dailyStreak: 0,
    lastProductiveDay: new Date(Date.now() - 86400000).toDateString()
  });
});

chrome.tabs.onActivated.addListener(() => {
  const now = Date.now();
  tabSwitchTimestamps = tabSwitchTimestamps.filter(ts => now - ts < MAX_TIME);
  tabSwitchTimestamps.push(now);

  const count = tabSwitchTimestamps.length;
  chrome.storage.local.set({ tabSwitchCount: count });

  if (count > THRESHOLD) {
    chrome.storage.local.get(['alertsEnabled', POINTS_KEY], (data) => {
      if (data.alertsEnabled) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Tab Monitor Alert',
          message: 'Please stop — too many tab switches in 20 minutes.',
          priority: 2
        });
        chrome.storage.local.set({
          userPoints: (data[POINTS_KEY] || 0) - 0.1
        });
      }
    });
  }
  logDistractionTime();
});

chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    tabSwitchTimestamps = [];
    chrome.storage.local.set({ tabSwitchCount: 0 });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.sprintActive?.newValue === true) startFocusSprint();
    if (changes.sprintActive?.newValue === false) stopFocusSprint();
  }
});

function startFocusSprint() {
  sprintTimeout = setTimeout(() => {
    chrome.storage.local.get(POINTS_KEY, (data) => {
      chrome.storage.local.set({
        userPoints: (data[POINTS_KEY] || 0) + POINTS_PER_SPRINT,
        sprintActive: false
      });
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Focus Sprint Complete 🎉',
        message: `+${POINTS_PER_SPRINT} points earned! Take a 2-min break.`,
        priority: 2
      });
      chrome.runtime.sendMessage({ type: "CONFETTI_BLAST" });
      chrome.tabs.create({ url: chrome.runtime.getURL('break.html') });
    });
  }, FOCUS_SPRINT_DURATION);
}

function stopFocusSprint() {
  if (sprintTimeout) clearTimeout(sprintTimeout);
  sprintTimeout = null;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    logDistractionTime();
    if (isDistractionSite(tab.url)) {
      currentDistractionStart = Date.now();
      previousDistractionURL = tab.url;
    } else {
      currentDistractionStart = null;
      previousDistractionURL = null;
    }
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  logDistractionTime();
});

function logDistractionTime() {
  if (currentDistractionStart && previousDistractionURL) {
    const now = Date.now();
    const duration = now - currentDistractionStart;
    updateDistractionStats(previousDistractionURL, duration);
    currentDistractionStart = null;
    previousDistractionURL = null;
  }
}

function updateDistractionStats(url, duration) {
  const domain = getDomain(url);
  chrome.storage.local.get([
    'distractionStats', 'lastReset', 'userPoints',
    'totalPenaltyToday', 'lastPenaltyCheck', 'lastRewardTime', 'sprintActive',
    'dailyStreak', 'lastProductiveDay'
  ], (data) => {
    const now = Date.now();
    const today = new Date().toDateString();

    if (data.lastReset !== today) {
      chrome.storage.local.set({
        distractionStats: {},
        lastReset: today,
        totalPenaltyToday: 0,
        lastPenaltyCheck: now,
        lastRewardTime: now
      });
    }

    const stats = data.distractionStats || {};
    stats[domain] = stats[domain] || { total: 0, count: 0 };
    stats[domain].total += duration;
    stats[domain].count += 1;

    chrome.storage.local.set({ distractionStats: stats });

    const totalMs = Object.values(stats).reduce((acc, site) => acc + (site.total || 0), 0);

    if (totalMs > 15 * 60 * 1000 && !data.sprintActive) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '🚨 Warning: High Distraction!',
        message: `You've wasted over ${Math.floor(totalMs / 60000)} mins today. Refocus now!`,
        priority: 2
      });
      chrome.runtime.sendMessage({ type: "SHOW_WARNING_ANIMATION" });
    }

    const lastPenaltyCheck = data.lastPenaltyCheck || 0;
    const penaltyChunks = Math.floor((totalMs - lastPenaltyCheck) / DISTRACTION_PENALTY_INTERVAL);

    if (!data.sprintActive && penaltyChunks > 0) {
      const penaltyPoints = penaltyChunks * DISTRACTION_PENALTY_POINTS;
      const newPoints = Math.max(0, (data.userPoints || 0) - penaltyPoints);

      chrome.storage.local.set({
        userPoints: newPoints,
        totalPenaltyToday: (data.totalPenaltyToday || 0) + penaltyPoints,
        lastPenaltyCheck: lastPenaltyCheck + penaltyChunks * DISTRACTION_PENALTY_INTERVAL
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '⛔ Distraction Penalty',
        message: `${penaltyPoints} coins deducted for ${penaltyChunks * 5} mins distraction!`,
        priority: 2
      });
    }

    if (now - (data.lastRewardTime || 0) >= NO_DISTRACTION_REWARD_INTERVAL && totalMs < NO_DISTRACTION_REWARD_INTERVAL) {
      const reward = NO_DISTRACTION_REWARD_POINTS;
      chrome.storage.local.set({
        userPoints: (data.userPoints || 0) + reward,
        lastRewardTime: now
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '🎁 Focus Reward',
        message: `Avoided distractions for 1 hour! +${reward} coins earned!`,
        priority: 2
      });
    }

    // ✅ Daily Productivity Streak Counter
    const wasProductive = (!data.sprintActive && totalMs < 10 * 60 * 1000);
    const todayStr = new Date().toDateString();
    if (wasProductive && data.lastProductiveDay !== todayStr) {
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const newStreak = (data.lastProductiveDay === yesterdayStr)
        ? (data.dailyStreak || 0) + 1
        : 1;

      chrome.storage.local.set({
        dailyStreak: newStreak,
        lastProductiveDay: todayStr
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: `🔥 Day ${newStreak} Focus Streak`,
        message: `You stayed productive today — great job!`,
        priority: 2
      });
    }
  });
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function isDistractionSite(url) {
  return (
    url.includes('youtube.com/shorts') ||
    url.includes('instagram.com/reels') ||
    url.includes('facebook.com/watch') ||
    url.includes('netflix.com')
  );
}
