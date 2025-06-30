/* ------------------------------------------------------------------
   Enhanced Tab & Focus Monitor – popup.js v3.4
   ------------------------------------------------------------------
   Features:
   • Comprehensive distraction statistics with interactive charts
   • Enhanced Pomodoro timer with floating controls
   • Advanced focus mode with site blocking
   • Points system with rewards/penalties
   • Dark mode and UI customization
   • Robust AI-powered insights and nudges
   ------------------------------------------------------------------ */

// Constants
const SPRINT_DURATION = 25 * 60; // 25 minutes in seconds
const NOTIFICATION_DELAY = 3000; // 3 seconds for status messages
const STATS_UPDATE_INTERVAL = 2000; // 2 seconds
const TREND_CHART_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f'];

// State variables
let sprintIntervalId = null;
let statsUpdateInterval = null;
let remainingTime = SPRINT_DURATION;
let currentHost = '';
let focusModeActive = false;

// DOM Elements
const elements = {
  sprint: {
    startBtn: document.getElementById('startSprintBtn'),
    stopBtn: document.getElementById('stopSprintBtn'),
    timerContainer: document.getElementById('sprintTimerContainer'),
    countdown: document.getElementById('sprintCountdown'),
    progress: document.getElementById('sprintProgress')
  },
  stats: {
    tabCount: document.getElementById('tabCount'),
    statusMessage: document.getElementById('statusMessage'),
    points: document.getElementById('pointsDisplay'),
    penalty: document.getElementById('penaltyDisplay'),
    netPoints: document.getElementById('netPointsDisplay'),
    motivation: document.getElementById('motivationStatus'),
    wastedTime: document.getElementById('wastedTimeDisplay'),
    distractionDetails: document.getElementById('distractionDetails'),
    todayVsAverage: document.getElementById('todayVsAverage'),
    trendChart: document.getElementById('trendChart'),
    domainChart: document.getElementById('domainChart'),
    sessionList: document.getElementById('sessionList')
  },
  toggles: {
    alert: document.getElementById('toggleAlert'),
    warp: document.getElementById('toggleWarp'),
    blur: document.getElementById('toggleBlur'),
    darkMode: document.getElementById('darkModeToggle')
  },
  focusMode: {
    siteInput: document.getElementById('fm-site'),
    minutesInput: document.getElementById('fm-minutes'),
    startBtn: document.getElementById('fm-start'),
    stopBtn: document.getElementById('fm-stop'),
    status: document.getElementById('fm-status')
  },
  views: {
    mainView: document.getElementById('mainStatsView'),
    detailView: document.getElementById('detailedStatsView'),
    domainView: document.getElementById('domainDetailView')
  },
  buttons: {
    viewDetails: document.getElementById('viewDetailsBtn'),
    viewDomains: document.getElementById('viewDomainsBtn'),
    backToMain: document.getElementById('backToMainBtn'),
    backFromDomain: document.getElementById('backFromDomainBtn')
  },
  aiInsights: {
    container: document.getElementById('aiInsightsContainer'),
    classification: document.getElementById('aiClassification'),
    nudge: document.getElementById('aiNudge'),
    details: document.getElementById('aiDetails')
  }
};

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initializeUI();
    setupEventListeners();
    await loadInitialState();
    setupFocusMode();
    setupStorageListeners();
    startStatsUpdates();
  } catch (error) {
    console.error("Popup initialization failed:", error);
    showTempStatus("Failed to initialize. Please refresh.", 'error');
  }
});

// Core Functions
function initializeUI() {
  // Set up collapsible sections
  document.querySelectorAll('.minimize-btn').forEach(btn => {
    btn.addEventListener('click', toggleSection);
  });

  // Initialize charts
  initializeCharts();
}

function initializeCharts() {
  // Trend chart canvas
  elements.stats.trendChart.innerHTML = '<canvas id="trendCanvas"></canvas>';
  
  // Domain chart canvas
  elements.stats.domainChart.innerHTML = '<canvas id="domainCanvas"></canvas>';
}

async function loadInitialState() {
  try {
    // Load all initial data in parallel
    const [
      sprintData, 
      statsData, 
      settingsData,
      focusData,
      aiData,
      trendData
    ] = await Promise.all([
      chrome.storage.local.get(['sprintActive', 'sprintEnd']),
      chrome.storage.local.get([
        'tabSwitchCount', 'userPoints', 'totalPenaltyToday', 
        'dailyStreak', 'distractionStats'
      ]),
      chrome.storage.local.get(['alertsEnabled', 'timeWarpEnabled', 'darkMode']),
      chrome.storage.local.get(['focusHost', 'focusEnd']),
      chrome.storage.local.get(['lastAIClassification', 'lastAINudge', 'lastDistraction']),
      chrome.storage.local.get(['distractionStatsTrend'])
    ]);

    // Initialize sprint
    if (sprintData.sprintActive && sprintData.sprintEnd) {
      const now = Math.floor(Date.now() / 1000);
      remainingTime = Math.max(0, sprintData.sprintEnd - now);
      if (remainingTime > 0) startSprintUI();
    }

    // Update stats display
    updateStatsDisplay(statsData);
    
    // Update distraction stats with detailed view
    updateDistractionDisplay(statsData.distractionStats || {});
    updateTrendDisplay(trendData.distractionStatsTrend || []);

    // Set toggle states
    elements.toggles.alert.checked = settingsData.alertsEnabled !== false;
    elements.toggles.warp.checked = settingsData.timeWarpEnabled !== false;
    if (settingsData.darkMode) {
      document.body.classList.add('dark-mode');
      elements.toggles.darkMode.checked = true;
    }

    // Set focus mode if active
    if (focusData.focusHost && focusData.focusEnd && Date.now() < focusData.focusEnd) {
      showFocusStatus(focusData.focusHost, focusData.focusEnd);
      focusModeActive = true;
    }

    // Set AI insights
    updateAIInsightsDisplay(aiData);
  } catch (error) {
    console.error("Failed to load initial state:", error);
    showTempStatus("Error loading data. Please refresh.", 'error');
  }
}

function updateAIInsightsDisplay(aiData) {
  try {
    if (!aiData) {
      elements.aiInsights.container.style.display = 'none';
      return;
    }

    elements.aiInsights.container.style.display = 'block';
    
    if (aiData.lastAIClassification) {
      elements.aiInsights.classification.textContent = aiData.lastAIClassification;
      elements.aiInsights.classification.className = `ai-label ${aiData.lastAIClassification.toLowerCase()}`;
    } else {
      elements.aiInsights.classification.textContent = "No data";
      elements.aiInsights.classification.className = "ai-label neutral";
    }
    
    if (aiData.lastAINudge) {
      elements.aiInsights.nudge.textContent = aiData.lastAINudge;
      
      // Clear all nudge classes first
      elements.aiInsights.nudge.className = 'ai-nudge';
      
      // Add appropriate class based on classification
      const nudgeType = aiData.lastAIClassification?.toLowerCase() || 'neutral';
      elements.aiInsights.nudge.classList.add(`${nudgeType}-nudge`);
    } else {
      elements.aiInsights.nudge.textContent = "No nudge available";
      elements.aiInsights.nudge.className = "ai-nudge neutral-nudge";
    }

    if (aiData.lastDistraction) {
      elements.aiInsights.details.innerHTML = `
        <div class="distraction-flow">
          <span class="from">${extractRootDomain(aiData.lastDistraction.from)}</span>
          <span class="arrow">→</span>
          <span class="to">${extractRootDomain(aiData.lastDistraction.to)}</span>
          <span class="time">${new Date(aiData.lastDistraction.timestamp).toLocaleTimeString()}</span>
        </div>
      `;
    } else {
      elements.aiInsights.details.innerHTML = '<div class="no-data">No recent distractions</div>';
    }
  } catch (error) {
    console.error("Error updating AI insights:", error);
    elements.aiInsights.container.innerHTML = '<div class="error">Failed to load insights</div>';
  }
}

function extractRootDomain(url) {
  try {
    let domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    domain = domain.replace('www.', '');
    const parts = domain.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : domain;
  } catch {
    return url;
  }
}

function startStatsUpdates() {
  // Update immediately
  updateStats();
  
  // Set up periodic updates
  statsUpdateInterval = setInterval(updateStats, STATS_UPDATE_INTERVAL);
}

async function updateStats() {
  const [stats, trend] = await Promise.all([
    chrome.storage.local.get([
      'tabSwitchCount', 'userPoints', 'totalPenaltyToday', 
      'dailyStreak', 'distractionStats'
    ]),
    chrome.storage.local.get(['distractionStatsTrend'])
  ]);
  
  updateStatsDisplay(stats);
  updateDistractionDisplay(stats.distractionStats || {});
  updateTrendDisplay(trend.distractionStatsTrend || []);
}

function updateStatsDisplay(data) {
  const count = data.tabSwitchCount || 0;
  elements.stats.tabCount.textContent = count;
  elements.stats.statusMessage.textContent = 
    count > 10 ? '⚠️ You switched too much!' : "You're doing great!";

  const points = data.userPoints || 0;
  const penalty = data.totalPenaltyToday || 0;
  const netPoints = points - penalty;

  elements.stats.points.textContent = points;
  elements.stats.penalty.textContent = penalty;
  elements.stats.netPoints.textContent = netPoints;

  updateMotivationMessage(netPoints, data.dailyStreak || 0);
}

function updateMotivationMessage(netPoints, streak) {
  const status = elements.stats.motivation;
  if (netPoints < 0) {
    status.textContent = '😓 You seem distracted. Let\'s bounce back!';
    status.classList.add('warning-animate');
    setTimeout(() => status.classList.remove('warning-animate'), 2000);
  } else if (netPoints >= 100) {
    status.textContent = streak > 7 ? '🏆 Legendary focus streak!' : '👑 You\'re unstoppable!';
  } else if (netPoints >= 50) {
    status.textContent = '🚀 Keep growing — you\'re doing great!';
  } else if (streak > 3) {
    status.textContent = `🔥 ${streak}-day streak! Keep it up!`;
  } else {
    status.textContent = '✨ Stay focused and watch yourself rise!';
  }
}

function updateDistractionDisplay(stats) {
  if (!stats || Object.keys(stats).length === 0) {
    elements.stats.wastedTime.textContent = 'No distraction data yet. Great going! ✨';
    elements.stats.distractionDetails.innerHTML = '';
    return;
  }

  let totalMs = 0;
  const sites = [];
  
  // Calculate total time and prepare site list
  for (const [domain, data] of Object.entries(stats)) {
    totalMs += data.total || 0;
    sites.push({
      domain,
      minutes: Math.round(data.total / 60000),
      todayMinutes: Math.round((data.today || 0) / 60000),
      visits: data.count || 0,
      sessions: data.sessions || []
    });
  }

  const totalMinutes = Math.round(totalMs / 60000);
  elements.stats.wastedTime.textContent = `Total distracted time: ${totalMinutes} minutes`;
  
  // Sort by most time wasted
  sites.sort((a, b) => b.minutes - a.minutes);
  
  // Create detailed breakdown
  let detailsHTML = '<div style="margin-top: 8px;"><strong>Top Distractions:</strong><ul style="margin: 4px 0; padding-left: 20px;">';
  
  sites.slice(0, 3).forEach(site => {
    detailsHTML += `<li>${site.domain}: ${site.minutes} mins (${site.visits} visits)</li>`;
  });
  
  if (sites.length > 3) {
    detailsHTML += `<li>+ ${sites.length - 3} more sites</li>`;
  }
  
  detailsHTML += '</ul></div>';
  elements.stats.distractionDetails.innerHTML = detailsHTML;

  // Update domain chart
  updateDomainChart(sites.slice(0, 5));

  // Update session list
  updateSessionList(sites);
}

function updateTrendDisplay(trendData) {
  if (!trendData || trendData.length === 0) return;
  
  const labels = trendData.map(day => 
    new Date(day.date).toLocaleDateString([], { weekday: 'short' }));
  const data = trendData.map(day => Math.round(day.totalTime / 60000));
  
  updateTrendChart(labels, data);

  // Calculate today vs average
  if (trendData.length > 1) {
    const today = trendData[trendData.length - 1];
    const pastDays = trendData.slice(0, -1);
    const avg = pastDays.reduce((sum, day) => sum + day.totalTime, 0) / pastDays.length;
    
    const diff = today.totalTime - avg;
    let comparison = '';
    
    if (diff > 0) {
      comparison = `📈 ${Math.round(diff/60000)}m more than average`;
      elements.stats.todayVsAverage.style.color = '#e15759';
    } else if (diff < 0) {
      comparison = `📉 ${Math.round(Math.abs(diff)/60000)}m less than average`;
      elements.stats.todayVsAverage.style.color = '#59a14f';
    } else {
      comparison = '🟰 Same as average';
      elements.stats.todayVsAverage.style.color = '#4e79a7';
    }
    
    elements.stats.todayVsAverage.innerHTML = `
      <strong>Today:</strong> ${Math.round(today.totalTime/60000)}m | 
      <strong>Avg:</strong> ${Math.round(avg/60000)}m<br>
      ${comparison}
    `;
  }
}

function updateSessionList(sites) {
  // Flatten all sessions from all sites
  const allSessions = [];
  sites.forEach(site => {
    site.sessions.forEach(session => {
      allSessions.push({
        domain: site.domain,
        time: new Date(session.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: Math.round(session.duration / 60000)
      });
    });
  });

  // Sort by most recent
  allSessions.sort((a, b) => new Date(b.time) - new Date(a.time));

  // Display last 5 sessions
  elements.stats.sessionList.innerHTML = allSessions.slice(0, 5).map(session => `
    <div class="session-item">
      <span class="domain-badge" style="background-color: ${getDomainColor(session.domain)}">
        ${session.domain}
      </span>
      <span class="session-time">${session.time}</span>
      <span class="session-duration">${session.duration}m</span>
    </div>
  `).join('');
}

function updateTrendChart(labels, data) {
  const canvas = elements.stats.trendChart.querySelector('canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const chart = Chart.getChart(ctx);
  
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = [{
      label: 'Distraction Time',
      data: data,
      borderColor: '#4e79a7',
      backgroundColor: 'rgba(78, 121, 167, 0.1)',
      tension: 0.3,
      fill: true
    }];
    chart.update();
  } else {
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Distraction Time',
          data: data,
          borderColor: '#4e79a7',
          backgroundColor: 'rgba(78, 121, 167, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Minutes' } }
        }
      }
    });
  }
}

function updateDomainChart(domains) {
  const canvas = elements.stats.domainChart.querySelector('canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const chart = Chart.getChart(ctx);
  
  if (chart) {
    chart.data.labels = domains.map(d => d.domain);
    chart.data.datasets = [{
      data: domains.map(d => d.todayMinutes),
      backgroundColor: domains.map(d => getDomainColor(d.domain)),
      borderWidth: 1
    }];
    chart.update();
  } else {
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: domains.map(d => d.domain),
        datasets: [{
          data: domains.map(d => d.todayMinutes),
          backgroundColor: domains.map(d => getDomainColor(d.domain)),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: (context) => {
                const domain = domains.find(d => d.domain === context.label);
                return [
                  `${context.label}: ${context.raw}m`,
                  `Total: ${domain.minutes}m | Visits: ${domain.visits}`
                ];
              }
            }
          }
        }
      }
    });
  }
}

function getDomainColor(domain) {
  const hash = Array.from(domain).reduce(
    (hash, char) => char.charCodeAt(0) + (hash << 6) + (hash << 16) - hash, 0);
  return TREND_CHART_COLORS[Math.abs(hash) % TREND_CHART_COLORS.length];
}

// Sprint Timer Functions
function startSprintUI() {
  updateSprintButtons(true);
  updateSprintUI();

  if (sprintIntervalId) clearInterval(sprintIntervalId);
  sprintIntervalId = setInterval(() => {
    remainingTime--;
    updateSprintUI();
    if (remainingTime <= 0) {
      stopSprint();
      // Reward for completing sprint
      chrome.storage.local.get(['userPoints'], (data) => {
        const newPoints = (data.userPoints || 0) + 10;
        chrome.storage.local.set({ userPoints: newPoints });
        showTempStatus('+10 points for completing your sprint!', 'success');
      });
    }
  }, 1000);

  injectFloatingStopAndBlocker();
}

function stopSprint() {
  if (sprintIntervalId) clearInterval(sprintIntervalId);
  sprintIntervalId = null;
  remainingTime = 0;

  chrome.storage.local.set({ sprintActive: false, sprintEnd: null });
  updateSprintButtons(false);

  elements.sprint.countdown.textContent = '25:00';
  elements.sprint.progress.value = 0;

  removeFloatingButtons();
}

function updateSprintUI() {
  const mins = String(Math.floor(remainingTime / 60)).padStart(2, '0');
  const secs = String(remainingTime % 60).padStart(2, '0');
  elements.sprint.countdown.textContent = `${mins}:${secs}`;
  elements.sprint.progress.value = SPRINT_DURATION - remainingTime;
}

function updateSprintButtons(running) {
  elements.sprint.startBtn.style.display = running ? 'none' : 'block';
  elements.sprint.stopBtn.style.display = running ? 'block' : 'none';
  elements.sprint.timerContainer.style.display = running ? 'block' : 'none';
}

// Content Script Injection
function injectFloatingStopAndBlocker() {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['contentScripts/floatingButton.js']
      }).catch(err => console.error('Injection failed:', err));
    });
  });
}

function removeFloatingButtons() {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const btn = document.getElementById('floatingStopBtn');
          if (btn) btn.remove();
        }
      });
    });
  });
}

// Focus Mode Functions
function setupFocusMode() {
  elements.focusMode.startBtn.addEventListener('click', startFocusMode);
  elements.focusMode.stopBtn.addEventListener('click', stopFocusMode);
}

function startFocusMode() {
  const host = extractHostname(elements.focusMode.siteInput.value);
  const mins = parseInt(elements.focusMode.minutesInput.value, 10);

  if (!host || !mins || mins <= 0) {
    showTempStatus('Enter a valid domain/URL and time.', 'error');
    return;
  }

  const end = Date.now() + mins * 60_000;
  chrome.storage.local.set({ 
    focusHost: host, 
    focusEnd: end,
    distractionStats: {}
  }, () => {
    showFocusStatus(host, end);
    focusModeActive = true;
    updateDistractionDisplay({});
    applyFocusModeToTabs(host);
  });
}

function stopFocusMode() {
  chrome.storage.local.remove(['focusHost', 'focusEnd'], () => {
    elements.focusMode.status.textContent = "Focus Mode disabled.";
    focusModeActive = false;
    removeFocusModeRestrictions();
  });
}

function showFocusStatus(host, end) {
  elements.focusMode.status.textContent = 
    `Only "${host}" allowed until ${new Date(end).toLocaleTimeString()}.`;
}

function applyFocusModeToTabs(host) {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.url.includes(host)) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (allowedHost) => {
            if (!window.location.hostname.includes(allowedHost)) {
              document.body.innerHTML = `
                <div style="
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  height: 100vh; 
                  font-size: 20px; 
                  color: red; 
                  font-family: sans-serif; 
                  text-align: center;
                  padding: 20px;
                ">
                  🚫 Focus Mode Active. Only ${allowedHost} is allowed.
                </div>
              `;
            }
          },
          args: [host]
        });
      }
    });
  });
}

function removeFocusModeRestrictions() {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (document.body.textContent.includes('Focus Mode Active')) {
            window.location.reload();
          }
        }
      });
    });
  });
}

// View Navigation Functions
function setupViewNavigation() {
  elements.buttons.viewDetails.addEventListener('click', () => {
    elements.views.mainView.style.display = 'none';
    elements.views.detailView.style.display = 'block';
  });

  elements.buttons.viewDomains.addEventListener('click', () => {
    elements.views.mainView.style.display = 'none';
    elements.views.domainView.style.display = 'block';
  });

  elements.buttons.backToMain.addEventListener('click', () => {
    elements.views.detailView.style.display = 'none';
    elements.views.mainView.style.display = 'block';
  });

  elements.buttons.backFromDomain.addEventListener('click', () => {
    elements.views.domainView.style.display = 'none';
    elements.views.mainView.style.display = 'block';
  });
}

// Utility Functions
function extractHostname(input) {
  try {
    if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(input)) {
      input = "https://" + input.trim();
    }
    return new URL(input).hostname.replace('www.', '');
  } catch {
    return "";
  }
}

function showTempStatus(message, type = 'success') {
  const status = document.getElementById('statusMessage');
  status.textContent = message;
  status.style.color = type === 'error' ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => { status.textContent = ''; }, NOTIFICATION_DELAY);
}

function toggleSection(e) {
  const section = e.currentTarget.closest('.section');
  if (!section) return;
  
  section.classList.toggle('minimized');
  const icon = e.currentTarget.querySelector('span');
  
  if (section.classList.contains('minimized')) {
    icon.textContent = '+';
    e.currentTarget.setAttribute('aria-label', 'Maximize section');
  } else {
    icon.textContent = '−';
    e.currentTarget.setAttribute('aria-label', 'Minimize section');
  }
}

// Event Listeners
function setupEventListeners() {
  // Sprint controls
  elements.sprint.startBtn.addEventListener('click', () => {
    remainingTime = SPRINT_DURATION;
    const sprintEnd = Math.floor(Date.now() / 1000) + remainingTime;
    chrome.storage.local.set({ sprintActive: true, sprintEnd });
    startSprintUI();
  });

  elements.sprint.stopBtn.addEventListener('click', stopSprint);

  // Toggles
  elements.toggles.alert.addEventListener('change', (e) => 
    chrome.storage.local.set({ alertsEnabled: e.target.checked })
  );

  elements.toggles.warp.addEventListener('change', (e) => 
    chrome.storage.local.set({ timeWarpEnabled: e.target.checked })
  );

  elements.toggles.blur.addEventListener('change', (e) => 
    chrome.storage.sync.set({ blurEnabled: e.target.checked })
  );

  elements.toggles.darkMode.addEventListener('change', (e) => {
    document.body.classList.toggle('dark-mode', e.target.checked);
    chrome.storage.local.set({ darkMode: e.target.checked });
  });

  // Stats reset
  document.getElementById('resetStatsBtn').addEventListener('click', () => {
    chrome.storage.local.set({ 
      distractionStats: {},
      totalPenaltyToday: 0
    }, () => {
      updateDistractionDisplay({});
      showTempStatus('Stats reset successfully!', 'success');
      chrome.storage.local.get(['userPoints'], (data) => {
        elements.stats.penalty.textContent = '0';
        elements.stats.netPoints.textContent = data.userPoints || 0;
      });
    });
  });

  // View navigation
  setupViewNavigation();

  // Session list interactions
  elements.stats.sessionList.addEventListener('click', (e) => {
    const domainBadge = e.target.closest('.domain-badge');
    if (domainBadge) {
      const domain = domainBadge.textContent.trim();
      showDomainDetails(domain);
    }
  });
}

function showDomainDetails(domain) {
  elements.views.detailView.style.display = 'none';
  elements.views.domainView.style.display = 'block';
  
  chrome.storage.local.get(['distractionStats'], (data) => {
    const domainData = data.distractionStats?.[domain];
    if (!domainData) return;
    
    document.getElementById('domainDetailName').textContent = domain;
    document.getElementById('domainTotalTime').textContent = 
      `${Math.round(domainData.total / 60000)} minutes total`;
    document.getElementById('domainTodayTime').textContent = 
      `${Math.round(domainData.today / 60000)} minutes today`;
    document.getElementById('domainVisitCount').textContent = 
      `${domainData.count} visits`;
    
    renderDomainSessions(domainData.sessions || []);
  });
}

function renderDomainSessions(sessions) {
  const container = document.getElementById('domainSessionTimeline');
  container.innerHTML = '';
  
  sessions.slice(0, 10).forEach(session => {
    const durationMins = Math.round(session.duration / 60000);
    const time = new Date(session.start).toLocaleTimeString([], { 
      hour: '2-digit', minute: '2-digit' 
    });
    
    const sessionEl = document.createElement('div');
    sessionEl.className = 'domain-session';
    sessionEl.innerHTML = `
      <div class="session-time">${time}</div>
      <div class="session-bar-container">
        <div class="session-bar" style="width: ${Math.min(durationMins * 5, 100)}%">
          ${durationMins}m
        </div>
      </div>
    `;
    container.appendChild(sessionEl);
  });
}

// Storage Listeners
function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    try {
      // Update distraction stats
      if (changes.distractionStats) {
        updateDistractionDisplay(changes.distractionStats.newValue || {});
      }

      // Update points display
      if (changes.userPoints || changes.totalPenaltyToday) {
        chrome.storage.local.get(['userPoints', 'totalPenaltyToday'], (data) => {
          elements.stats.points.textContent = data.userPoints || 0;
          elements.stats.penalty.textContent = data.totalPenaltyToday || 0;
          elements.stats.netPoints.textContent = (data.userPoints || 0) - (data.totalPenaltyToday || 0);
        });
      }

      // Update streak
      if (changes.dailyStreak) {
        chrome.storage.local.get(['userPoints', 'totalPenaltyToday', 'dailyStreak'], (data) => {
          const netPoints = (data.userPoints || 0) - (data.totalPenaltyToday || 0);
          updateMotivationMessage(netPoints, data.dailyStreak || 0);
        });
      }

      // Update tab switch count
      if (changes.tabSwitchCount) {
        elements.stats.tabCount.textContent = changes.tabSwitchCount.newValue || 0;
        elements.stats.statusMessage.textContent = 
          changes.tabSwitchCount.newValue > 10 ? '⚠️ You switched too much!' : "You're doing great!";
      }

      // Enhanced AI insights handling
      if (changes.lastAIClassification || changes.lastAINudge || changes.lastDistraction) {
        chrome.storage.local.get([
          'lastAIClassification', 
          'lastAINudge', 
          'lastDistraction'
        ], (aiData) => {
          updateAIInsightsDisplay(aiData);
        });
      }

      // Update trend data
      if (changes.distractionStatsTrend) {
        updateTrendDisplay(changes.distractionStatsTrend.newValue || []);
      }
    } catch (error) {
      console.error("Error in storage listener:", error);
    }
  });
}

// Clean up
window.addEventListener('unload', () => {
  if (sprintIntervalId) clearInterval(sprintIntervalId);
  if (statsUpdateInterval) clearInterval(statsUpdateInterval);
});

// End of file