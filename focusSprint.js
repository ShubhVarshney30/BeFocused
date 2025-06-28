(() => {
  if (window.__focusSprint && window.__focusSprint.initialized) return;

  window.__focusSprint = window.__focusSprint || {};
  if (window.__focusSprint.initialized) return;

  window.__focusSprint.initialized = true;
  window.__focusSprint.sprintActive = false;
  window.__focusSprint.sprintEnd = null;
  window.__focusSprint.sprintInterval = null;

  const SPRINT_DURATION = 25 * 60 * 1000;
  const BREAK_DURATION = 2 * 60 * 1000;

  // ✅ Start check when window loads
  window.addEventListener("load", () => {
    chrome.storage.local.get('sprintActive', (data) => {
      if (data.sprintActive) {
        startSprint();
      }
    });
  });

  // ✅ Re-check when user switches back to the tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      chrome.storage.local.get('sprintActive', (data) => {
        if (data.sprintActive) {
          blockDistractions(); // Re-block if needed
        }
      });
    }
  });

  function startSprint() {
    if (window.__focusSprint.sprintActive) return;

    window.__focusSprint.sprintActive = true;
    window.__focusSprint.sprintEnd = Date.now() + SPRINT_DURATION;

    chrome.storage.local.set({ sprintActive: true });

    showProgressBar();
    blockDistractions();
    window.__focusSprint.sprintInterval = setInterval(checkSprint, 1000);
  }

  function checkSprint() {
    const now = Date.now();
    const remaining = Math.max(0, window.__focusSprint.sprintEnd - now);

    updateProgressBar(remaining / SPRINT_DURATION);
    updateCountdownDisplay(remaining);
    blockDistractions(); // Continuously block

    if (remaining <= 0) finishSprint();
  }

  function finishSprint() {
    clearInterval(window.__focusSprint.sprintInterval);
    window.__focusSprint.sprintActive = false;
    chrome.storage.local.set({ sprintActive: false });
    removeProgressBar();
    showBreak();
  }

  function showProgressBar() {
    if (document.getElementById('focus-progress-container')) return;

    const container = document.createElement('div');
    container.id = 'focus-progress-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 8px;
      background: rgba(0, 0, 0, 0.1);
      z-index: 999999;
    `;

    const bar = document.createElement('div');
    bar.id = 'focus-progress';
    bar.style.cssText = `
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #4caf50, #81c784);
      transition: width 1s linear;
    `;

    const label = document.createElement('div');
    label.id = 'focus-countdown';
    label.style.cssText = `
      position: fixed;
      top: 10px;
      right: 15px;
      color: #4caf50;
      font-size: 14px;
      font-family: Arial, sans-serif;
      background: white;
      padding: 2px 6px;
      border-radius: 4px;
      z-index: 9999999;
    `;

    container.appendChild(bar);
    document.body.appendChild(container);
    document.body.appendChild(label);
  }

  function updateProgressBar(ratio) {
    const bar = document.getElementById('focus-progress');
    if (bar) bar.style.width = `${100 * (1 - ratio)}%`;
  }

  function updateCountdownDisplay(ms) {
    const label = document.getElementById('focus-countdown');
    if (label) {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      label.textContent = `🕐 ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  function removeProgressBar() {
    const container = document.getElementById('focus-progress-container');
    const label = document.getElementById('focus-countdown');
    if (container) container.remove();
    if (label) label.remove();
  }

  function blockDistractions() {
    const host = window.location.hostname;
    const path = window.location.pathname;

    const isYouTubeShorts = host.includes('youtube.com') && path.startsWith('/shorts');
    const isInstagramReels = host.includes('instagram.com') && path.includes('/reels');
    const isFacebookWatch = host.includes('facebook.com') && path.includes('/watch');
    const isNetflix = host.includes('netflix.com');

    if (isYouTubeShorts || isInstagramReels || isFacebookWatch || isNetflix) {
      if (!document.getElementById('__blockOverlay')) {
        document.body.innerHTML = `
          <div id="__blockOverlay" style="
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-size: 20px;
            color: red;
            font-family: sans-serif;
            text-align: center;">
            🚫 Entertainment content is blocked during Focus Sprint. Get back to your goals!
          </div>`;
      }
    }
  }

  function showBreak() {
    const breakOverlay = document.createElement('div');
    breakOverlay.id = 'breakOverlay';
    breakOverlay.innerHTML = '<h2 style="color: white; text-align: center; margin-top: 30vh">🎉 Take a 2-min break!</h2>';
    Object.assign(breakOverlay.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      zIndex: 9999999,
    });
    document.body.appendChild(breakOverlay);
    setTimeout(() => breakOverlay.remove(), BREAK_DURATION);
  }

  window.startSprint = startSprint;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sprintActive?.newValue === false) {
      if (window.__focusSprint.sprintActive) {
        clearInterval(window.__focusSprint.sprintInterval);
        window.__focusSprint.sprintActive = false;
        window.__focusSprint.sprintEnd = null;
        removeProgressBar();

        const overlay = document.getElementById('breakOverlay');
        if (overlay) overlay.remove();

        console.log("🚫 Sprint manually stopped.");
      }
    }
  });
})();
