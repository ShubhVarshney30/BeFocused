let tabSwitchTimestamps = [];
const TIME_WINDOW_MINUTES = 20;
const MAX_TIME = TIME_WINDOW_MINUTES * 60 * 1000;
const THRESHOLD = 10;
const POINTS_KEY = 'userPoints';
const FOCUS_SPRINT_DURATION = 25 * 60 * 1000; // 25 minutes
const POINTS_PER_SPRINT = 10;

// ✅ Global timeout to allow cancellation
let sprintTimeout = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    tabSwitchCount: 0,
    alertsEnabled: true,
    timeWarpEnabled: true,
    userPoints: 0,
    sprintActive: false
  });
});

// 🔁 Tab Switch Tracking
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
          userPoints: (data[POINTS_KEY] || 0) - 5
        });
      }
    });
  }
});

// 🔁 Cleanup tab switch counter every hour
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    tabSwitchTimestamps = [];
    chrome.storage.local.set({ tabSwitchCount: 0 });
  }
});

// 🚀 Sprint Start/Stop Listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.sprintActive?.newValue === true) {
      startFocusSprint();
    }

    if (changes.sprintActive?.newValue === false) {
      stopFocusSprint();
    }
  }
});

// 🟢 Start Sprint Handler
function startFocusSprint() {
  console.log("🎯 Focus sprint started");

  sprintTimeout = setTimeout(() => {
    chrome.storage.local.get(POINTS_KEY, (data) => {
      const newPoints = (data[POINTS_KEY] || 0) + POINTS_PER_SPRINT;

      chrome.storage.local.set({
        userPoints: newPoints,
        sprintActive: false
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Focus Sprint Complete 🎉',
        message: `You earned +${POINTS_PER_SPRINT} points! Take a 2-min break now.`,
        priority: 2
      });

      chrome.tabs.create({
        url: chrome.runtime.getURL('break.html')
      });
    });
  }, FOCUS_SPRINT_DURATION);
}

// ⛔ Stop Sprint Handler
function stopFocusSprint() {
  if (sprintTimeout) {
    clearTimeout(sprintTimeout);
    sprintTimeout = null;
    console.log("⛔ Focus sprint manually stopped.");
  }
}
