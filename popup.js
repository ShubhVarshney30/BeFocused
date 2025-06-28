let sprintIntervalId = null;
let remainingTime = 25 * 60;
const SPRINT_DURATION = 25 * 60;

function startSprintUI() {
  updateSprintButtons(true);
  updateSprintUI();

  if (sprintIntervalId) clearInterval(sprintIntervalId);
  sprintIntervalId = setInterval(() => {
    remainingTime--;
    updateSprintUI();
    if (remainingTime <= 0) {
      stopSprint();
    }
  }, 1000);
}

function stopSprint() {
  if (sprintIntervalId) clearInterval(sprintIntervalId);
  sprintIntervalId = null;

  chrome.storage.local.set({ sprintActive: false, sprintEnd: null });

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

  updateSprintButtons(false);
  document.getElementById('sprintCountdown').textContent = '25:00';
  document.getElementById('sprintProgress').value = 0;
}

function updateSprintUI() {
  const mins = String(Math.floor(remainingTime / 60)).padStart(2, '0');
  const secs = String(remainingTime % 60).padStart(2, '0');
  document.getElementById('sprintCountdown').textContent = `${mins}:${secs}`;
  document.getElementById('sprintProgress').value = SPRINT_DURATION - remainingTime;
}

function updateSprintButtons(isRunning) {
  const startBtn = document.getElementById('startSprintBtn');
  const stopBtn = document.getElementById('stopSprintBtn');
  const timerContainer = document.getElementById('sprintTimerContainer');

  startBtn.style.display = isRunning ? 'none' : 'inline-block';
  stopBtn.style.display = isRunning ? 'inline-block' : 'none';
  timerContainer.style.display = isRunning ? 'block' : 'none';
}

function restoreSprintState() {
  chrome.storage.local.get(['sprintActive', 'sprintEnd'], (data) => {
    if (data.sprintActive && data.sprintEnd) {
      const now = Math.floor(Date.now() / 1000);
      remainingTime = Math.max(0, data.sprintEnd - now);
      if (remainingTime > 0) {
        startSprintUI();
      } else {
        chrome.storage.local.set({ sprintActive: false });
        updateSprintButtons(false);
      }
    } else {
      updateSprintButtons(false);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const tabCountEl = document.getElementById('tabCount');
  const statusMsgEl = document.getElementById('statusMessage');
  const toggleAlert = document.getElementById('toggleAlert');
  const toggleWarp = document.getElementById('toggleWarp');
  const pointsDisplay = document.getElementById('pointsDisplay');
  const startSprintBtn = document.getElementById('startSprintBtn');
  const stopSprintBtn = document.getElementById('stopSprintBtn');

  chrome.storage.local.get(['tabSwitchCount', 'userPoints'], (data) => {
    tabCountEl.textContent = data.tabSwitchCount || 0;
    pointsDisplay.textContent = `Points: ${data.userPoints || 0}`;
    if ((data.tabSwitchCount || 0) > 10) {
      statusMsgEl.textContent = "⚠️ Too many switches!";
      statusMsgEl.classList.add("warning");
    }
  });

  chrome.storage.local.get(['alertsEnabled', 'timeWarpEnabled'], (data) => {
    toggleAlert.checked = data.alertsEnabled ?? true;
    toggleWarp.checked = data.timeWarpEnabled ?? true;
  });

  toggleAlert.addEventListener('change', () => {
    chrome.storage.local.set({ alertsEnabled: toggleAlert.checked });
  });

  toggleWarp.addEventListener('change', () => {
    chrome.storage.local.set({ timeWarpEnabled: toggleWarp.checked });
  });

  startSprintBtn.addEventListener('click', () => {
    remainingTime = SPRINT_DURATION;
    const sprintEnd = Math.floor(Date.now() / 1000) + remainingTime;
    chrome.storage.local.set({ sprintActive: true, sprintEnd });
    startSprintUI();

    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (typeof startSprint === 'function') startSprint();

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
                cursor: 'pointer',
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
              document.body.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 20px; color: red; font-family: sans-serif; text-align: center;">🚫 This content is blocked during Focus Sprint. Please return to study.</div>`;
            }
          }
        });
      }
    });
  });

  stopSprintBtn.addEventListener('click', stopSprint);

  restoreSprintState();
});

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-blur');

  // 1️⃣ Load saved state (defaults to true)
  chrome.storage.sync.get({ blurEnabled: true }, (data) => {
    toggle.checked = data.blurEnabled;
  });

  // 2️⃣ Save state whenever user toggles
  toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ blurEnabled: toggle.checked });
  });
});



// focusmode js editition

/* Focus Mode – popup controller (hostname edition) */
const siteEl   = document.getElementById("fm-site");
const minsEl   = document.getElementById("fm-minutes");
const startBtn = document.getElementById("fm-start");
const stopBtn  = document.getElementById("fm-stop");
const statusEl = document.getElementById("fm-status");

/* ── utilities ──────────────────────────────────────────────── */
function extractHostname(input) {
  // Accept bare domain or full URL
  try {
    if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(input)) {
      input = "https://" + input.trim();
    }
    return new URL(input).hostname;
  } catch {
    return "";
  }
}

function showStatus(host, end) {
  statusEl.textContent =
    `Only “${host}” allowed until ${new Date(end).toLocaleTimeString()}.`;
}

/* ── load active session (if any) ───────────────────────────── */
(async () => {
  const { focusHost, focusEnd } = await chrome.storage.local.get(["focusHost", "focusEnd"]);
  if (focusHost && focusEnd && Date.now() < focusEnd) showStatus(focusHost, focusEnd);
})();

/* ── actions ────────────────────────────────────────────────── */
startBtn.onclick = async () => {
  const host = extractHostname(siteEl.value);
  const mins = parseInt(minsEl.value, 10);

  if (!host || !mins || mins <= 0) {
    alert("Enter a valid domain/URL and time.");
    return;
  }

  const end = Date.now() + mins * 60_000;
  await chrome.storage.local.set({ focusHost: host, focusEnd: end });
  showStatus(host, end);
};

stopBtn.onclick = async () => {
  await chrome.storage.local.remove(["focusHost", "focusEnd"]);
  statusEl.textContent = "Focus Mode disabled.";
};
