chrome.storage.local.get("timeWarpEnabled", (data) => {
  if (data.timeWarpEnabled === false) return; // Time-Warp is OFF

  let scrollStartTime = null;
  let scrollTimeout = null;
  let isSlowedDown = false;
  let slowFactor = 1;
  let effectAppliedTime = null;

  function slowScroll(e) {
    e.preventDefault();
    const currentFactor = Math.min(slowFactor, 5);
    window.scrollBy({
      top: e.deltaY / currentFactor,
      left: 0,
      behavior: "smooth"
    });
  }

  function applyVisualEffects(factor) {
    const blur = Math.min(factor, 5);
    const grayscale = Math.min(factor * 10, 100);
    document.body.style.transition = "filter 0.5s ease-in-out";
    document.body.style.filter = "none"; // Reset before applying
    void document.body.offsetWidth; // Force reflow
    document.body.style.filter = `blur(${blur}px) grayscale(${grayscale}%)`;
  }

  function applySlowEffect() {
    if (!isSlowedDown) {
      isSlowedDown = true;
      effectAppliedTime = Date.now();
      window.addEventListener("wheel", slowScroll, { passive: false });
      showNudge();
      trackWarpTrigger(); // Save stats
    }

    const duration = Date.now() - effectAppliedTime;
    slowFactor = 1 + duration / 5000;
    applyVisualEffects(slowFactor);
  }

  function resetScroll() {
    if (isSlowedDown) {
      isSlowedDown = false;
      slowFactor = 1;
      effectAppliedTime = null;
      window.removeEventListener("wheel", slowScroll, { passive: false });
      document.body.style.filter = "none";
    }
  }

  function showNudge() {
    const existing = document.getElementById("warp-nudge");
    if (existing) return;

    const nudge = document.createElement("div");
    nudge.id = "warp-nudge";
    nudge.innerText = "You've been scrolling for a while… Slow down? 💫";
    nudge.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s ease;
      font-family: sans-serif;
    `;
    document.body.appendChild(nudge);
    setTimeout(() => (nudge.style.opacity = 1), 100);
    setTimeout(() => {
      nudge.style.opacity = 0;
      setTimeout(() => nudge.remove(), 1000);
    }, 5000);
  }

  function trackWarpTrigger() {
    chrome.storage.local.get(['warpTriggeredDays'], (data) => {
      const today = new Date().toISOString().split('T')[0];
      const countMap = data.warpTriggeredDays || {};
      countMap[today] = (countMap[today] || 0) + 1;
      chrome.storage.local.set({ warpTriggeredDays: countMap });
    });
  }

  window.addEventListener("scroll", () => {
    if (!scrollStartTime) scrollStartTime = Date.now();

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      scrollStartTime = null;
      resetScroll();
    }, 1000);

    const duration = Date.now() - scrollStartTime;
    if (duration > 10000) {
      applySlowEffect();
    }
  });
});
