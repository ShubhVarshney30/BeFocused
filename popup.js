/* ------------------------------------------------------------------
   Tab & Focus Monitor – popup.js
   ------------------------------------------------------------------
   Handles:
   • Tab‑switch counter, alert toggles
   • 25‑minute Focus Sprint timer (Pomodoro‑style)
   • Points, distraction‑time display, reset button
   • Mini Chart.js doughnut showing today’s focus vs distraction
   • YouTube Thumbnail Blur toggle (NEW ✅)
   ------------------------------------------------------------------ */

const SPRINT_DURATION = 25 * 60;
let sprintIntervalId = null;
let remainingTime = SPRINT_DURATION;

function updateSprintButtons(running) {
  document.getElementById('startSprintBtn').style.display = running ? 'none' : 'inline-block';
  document.getElementById('stopSprintBtn').style.display = running ? 'inline-block' : 'none';
  document.getElementById('sprintTimerContainer').style.display = running ? 'block' : 'none';
}

function updateSprintUI() {
  const mins = String(Math.floor(remainingTime / 60)).padStart(2, '0');
  const secs = String(remainingTime % 60).padStart(2, '0');
  document.getElementById('sprintCountdown').textContent = `${mins}:${secs}`;
  document.getElementById('sprintProgress').value = SPRINT_DURATION - remainingTime;
}

function stopSprint() {
  if (sprintIntervalId) clearInterval(sprintIntervalId);
  sprintIntervalId = null;
  remainingTime = 0;

  chrome.storage.local.set({ sprintActive: false, sprintEnd: null });
  updateSprintButtons(false);

  document.getElementById('sprintCountdown').textContent = '25:00';
  document.getElementById('sprintProgress').value = 0;

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const btn = document.getElementById('floatingStopBtn');
          if (btn) btn.remove();
        }
      });
    }
  });
}

function startSprintUI() {
  updateSprintButtons(true);
  updateSprintUI();

  if (sprintIntervalId) clearInterval(sprintIntervalId);
  sprintIntervalId = setInterval(() => {
    remainingTime--;
    updateSprintUI();
    if (remainingTime <= 0) stopSprint();
  }, 1000);
}

function restoreSprintState() {
  chrome.storage.local.get(['sprintActive', 'sprintEnd'], data => {
    if (data.sprintActive && data.sprintEnd) {
      const now = Math.floor(Date.now() / 1000);
      remainingTime = Math.max(0, data.sprintEnd - now);
      if (remainingTime > 0) startSprintUI();
      else chrome.storage.local.set({ sprintActive: false });
    } else {
      updateSprintButtons(false);
    }
  });
}

function drawMiniChart() {
  chrome.storage.local.get('distractionStats', (data) => {
    const stats = data.distractionStats || {};
    let totalMs = 0;
    Object.values(stats).forEach(obj => { totalMs += obj.total || 0; });

    const distractedMin = Math.round(totalMs / 60000);
    const focusedMin = Math.max(0, 25 - distractedMin);

    new Chart(document.getElementById('miniChart'), {
      type: 'doughnut',
      data: {
        labels: ['Focused', 'Distracted'],
        datasets: [{
          data: [focusedMin, distractedMin],
          backgroundColor: ['#4caf50', '#f44336'],
        }]
      },
      options: {
        responsive: true,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom' },
          title: {
            display: true,
            text: 'Today’s Focus Ratio',
            font: { size: 14 }
          }
        }
      }
    });
  });
}

function injectFloatingStopAndBlocker() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (!document.getElementById('floatingStopBtn')) {
            const stopBtn = document.createElement('button');
            stopBtn.id = 'floatingStopBtn';
            stopBtn.textContent = '🛑 Stop Sprint';
            Object.assign(stopBtn.style, {
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              padding: '10px 16px',
              fontSize: '14px',
              zIndex: '100000',
              backgroundColor: '#e53935',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            });
            stopBtn.onclick = () => {
              chrome.storage.local.set({ sprintActive: false });
              stopBtn.remove();
            };
            document.body.appendChild(stopBtn);
          }

          const url = window.location.href;
          const host = window.location.hostname;
          const pathname = window.location.pathname;

          const isYouTubeShorts = host.includes('youtube.com') && pathname.startsWith('/shorts');
          const isInstagramReels = host.includes('instagram.com') && pathname.includes('/reels');
          const isFacebookWatch = host.includes('facebook.com') && pathname.includes('/watch');
          const isNetflix = host.includes('netflix.com');

          if (isYouTubeShorts || isInstagramReels || isFacebookWatch || isNetflix) {
            document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 20px; color: red; font-family: sans-serif; text-align: center;">🚫 This content is blocked during Focus Sprint. Please return to study.</div>';
          }
        }
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  restoreSprintState();

  chrome.storage.local.get([
    'tabSwitchCount', 'userPoints', 'alertsEnabled', 'timeWarpEnabled',
    'distractionStats', 'totalPenaltyToday', 'dailyStreak'
  ], (data) => {
    const count = data.tabSwitchCount || 0;
    document.getElementById('tabCount').textContent = count;
    document.getElementById('statusMessage').textContent =
      count > 10 ? '⚠️ You switched too much!' : "You're doing great!";

    const points = data.userPoints || 0;
    const penalty = data.totalPenaltyToday || 0;
    const netPoints = points - penalty;

    document.getElementById('pointsDisplay').textContent = `Points: ${points}`;
    document.getElementById('penaltyDisplay').textContent = `Today's Penalty: ${penalty}`;
    document.getElementById('netPointsDisplay').textContent = `Net Points: ${netPoints}`;

    const status = document.getElementById('motivationStatus');
    if (netPoints < 0) {
      status.textContent = '😓 You seem distracted. Let\'s bounce back!';
      status.classList.add('warning-animate');
      setTimeout(() => status.classList.remove('warning-animate'), 2000);
    } else if (netPoints >= 100) {
      status.textContent = '👑 You\'re unstoppable!';
    } else if (netPoints >= 20) {
      status.textContent = '🚀 Keep growing — you\'re doing great!';
    } else {
      status.textContent = '✨ Stay focused and watch yourself rise!';
    }

    document.getElementById('toggleAlert').checked = data.alertsEnabled ?? true;
    document.getElementById('toggleWarp').checked = data.timeWarpEnabled ?? true;
  });

  chrome.storage.sync.get('blurEnabled', (data) => {
    document.getElementById('toggleBlur').checked = data.blurEnabled ?? true;
  });

  document.getElementById('toggleAlert').addEventListener('change', (e) =>
    chrome.storage.local.set({ alertsEnabled: e.target.checked })
  );

  document.getElementById('toggleWarp').addEventListener('change', (e) =>
    chrome.storage.local.set({ timeWarpEnabled: e.target.checked })
  );

  document.getElementById('toggleBlur').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.sync.set({ blurEnabled: enabled });
  });

  document.getElementById('startSprintBtn').addEventListener('click', () => {
    remainingTime = SPRINT_DURATION;
    const sprintEnd = Math.floor(Date.now() / 1000) + remainingTime;
    chrome.storage.local.set({ sprintActive: true, sprintEnd });
    startSprintUI();
    injectFloatingStopAndBlocker();
  });

  document.getElementById('stopSprintBtn').addEventListener('click', stopSprint);

  document.getElementById('resetStatsBtn').addEventListener('click', () => {
    chrome.storage.local.set({ distractionStats: {} }, () => {
      document.getElementById('wastedTimeDisplay').textContent =
        'Time wasted today: 0 min across 0 sites.';
      drawMiniChart();
    });
  });

  chrome.storage.local.get('distractionStats', (data) => {
    let totalMs = 0;
    const stats = data.distractionStats || {};
    Object.values(stats).forEach(obj => { totalMs += obj.total || 0; });

    if (Object.keys(stats).length === 0) {
      document.getElementById('wastedTimeDisplay').textContent = 'No distraction data yet. Great going! ✨';
    } else {
      const minutes = Math.round(totalMs / 60000);
      document.getElementById('wastedTimeDisplay').textContent =
        `Time wasted today: ${minutes} min across ${Object.keys(stats).length} sites.`;
    }

    drawMiniChart();
  });
});
