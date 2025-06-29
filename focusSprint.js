(() => {
  if (window.__focusSprint && window.__focusSprint.initialized) return;

  window.__focusSprint = window.__focusSprint || {};
  if (window.__focusSprint.initialized) return;

  window.__focusSprint.initialized = true;
  window.__focusSprint.sprintActive = false;
  window.__focusSprint.sprintEnd = null;
  window.__focusSprint.sprintInterval = null;

  const SPRINT_DURATION =  25 * 1000; // 25 minutes for testing
  const BREAK_DURATION = 2 * 60 * 1000;

  const DISTRACTION_MESSAGES = [
    "🚫 Stop scrolling! Your time is valuable.",
    "📚 Reminder: You promised to stay focused.",
    "⏳ Time flies! Don't waste it on reels.",
    "💡 Great ideas are built with focus, not distractions.",
    "🔒 Your future self will thank you for this discipline.",
    "❌ You're investing in regret. Choose growth instead.",
    "⚠️ Warning: This path leads to wasted potential."
  ];

  window.addEventListener("load", () => {
    chrome.storage.local.get(['sprintActive'], (data) => {
      if (data.sprintActive) startSprint();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      chrome.storage.local.get('sprintActive', (data) => {
        if (data.sprintActive) {
          blockDistractions();
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
    blockDistractions();

    if (remaining <= 0) finishSprint();
  }

  function finishSprint() {
    clearInterval(window.__focusSprint.sprintInterval);
    window.__focusSprint.sprintActive = false;
    chrome.storage.local.set({ sprintActive: false });
    removeProgressBar();

    // ✅ Reward points
    chrome.storage.local.get(['userPoints'], (data) => {
      let currentPoints = data.userPoints ?? 0;
      currentPoints += 20; // Reward 20 points for successful sprint
      chrome.storage.local.set({ userPoints: currentPoints });
    });

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
      background: linear-gradient(90deg, #00c6ff, #0072ff);
      transition: width 1s linear;
    `;

    const label = document.createElement('div');
    label.id = 'focus-countdown';
    label.style.cssText = `
      position: fixed;
      top: 10px;
      right: 15px;
      color: #0072ff;
      font-size: 14px;
      font-family: Arial, sans-serif;
      background: white;
      padding: 4px 10px;
      border-radius: 6px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
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

    const isBlocked = (
      host.includes('youtube.com') && path.startsWith('/shorts') ||
      host.includes('instagram.com') && path.includes('/reels') ||
      host.includes('facebook.com') && path.includes('/watch') ||
      host.includes('netflix.com')
    );

    if (isBlocked && !document.getElementById('__blockOverlay')) {
      const randomMessage = DISTRACTION_MESSAGES[Math.floor(Math.random() * DISTRACTION_MESSAGES.length)];

      document.body.innerHTML = `
        <div id="__blockOverlay" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: #fff5f5;
          font-family: 'Segoe UI', sans-serif;
          text-align: center;
          color: #c0392b;
        ">
          <img src='https://cdn-icons-png.flaticon.com/512/3075/3075977.png' width="100" alt="focus icon" style="margin-bottom: 20px;" />
          <h2>⏰ Focus Alert</h2>
          <p style="font-size: 18px; max-width: 90%;">${randomMessage}</p>
          <p style="margin-top: 10px; color: #555;">⚠️ Redirecting you to a better place to focus 🎯</p>
          <button id="unlockBtn" style="
            margin-top: 30px;
            padding: 10px 16px;
            background: #d63031;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
          ">I Understand, Let Me Go</button>
        </div>
      `;

      document.getElementById('unlockBtn')?.addEventListener('click', () => {
        window.location.href = 'https://www.youtube.com'; // Redirect to main YouTube (not Shorts)
      });
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