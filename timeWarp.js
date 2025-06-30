chrome.storage.local.get("timeWarpEnabled", (data) => {
  if (data.timeWarpEnabled === false) return;

  // State variables
  let scrollStartTime = null;
  let scrollTimeout = null;
  let isSlowedDown = false;
  let slowFactor = 1;
  let effectAppliedTime = null;
  let blurTimeout = null;

  // Smooth scroll handler
  function slowScroll(e) {
    e.preventDefault();
    const currentFactor = Math.min(slowFactor, 5);
    window.scrollBy({ top: e.deltaY / currentFactor, behavior: "smooth" });
  }

  // Visual effects with gradual blur
  function applyVisualEffects(factor) {
    if (factor >= 2) { // Blur starts after 5s of slow-scrolling (15s total)
      const blur = Math.min((factor - 2) * 1.5, 5); // 0px → 5px
      const grayscale = Math.min((factor - 2) * 30, 100); // 0% → 100%
      document.body.style.transition = "filter 0.5s ease";
      document.body.style.filter = `blur(${blur}px) grayscale(${grayscale}%)`;
    }
  }

  // Enable slow-scroll + effects
  function applySlowEffect() {
    if (!isSlowedDown) {
      isSlowedDown = true;
      effectAppliedTime = Date.now();
      window.addEventListener("wheel", slowScroll, { passive: false });
      showNudge();
      trackWarpTrigger();

      // Delay blur by 5s after slow-scroll starts
      blurTimeout = setTimeout(() => {
        if (isSlowedDown) applyVisualEffects(2);
      }, 5000);
    }

    // Update intensity
    slowFactor = 1 + (Date.now() - effectAppliedTime) / 5000;
    if (slowFactor >= 2) applyVisualEffects(slowFactor);
  }

  // Reset with smooth fade-out
  function resetScroll() {
    if (isSlowedDown) {
      isSlowedDown = false;
      slowFactor = 1;
      effectAppliedTime = null;
      clearTimeout(blurTimeout);
      window.removeEventListener("wheel", slowScroll);

      // Smooth transition to clear effects
      document.body.style.transition = "filter 3s ease-out";
      document.body.style.filter = "none";

      // Cleanup after transition
      const onTransitionEnd = () => {
        document.body.style.transition = "";
        document.body.removeEventListener("transitionend", onTransitionEnd);
      };
      document.body.addEventListener("transitionend", onTransitionEnd);
    }
  }

  // UI Nudge
  function showNudge() {
    const existing = document.getElementById("warp-nudge");
    if (existing) return;

    const nudge = document.createElement("div");
    nudge.id = "warp-nudge";
    nudge.textContent = "You've been scrolling a while... Breathe. 🌿";
    nudge.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.5s;
      font-family: -apple-system, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    document.body.appendChild(nudge);
    setTimeout(() => (nudge.style.opacity = 1), 100);
    setTimeout(() => {
      nudge.style.opacity = 0;
      setTimeout(() => nudge.remove(), 1000);
    }, 5000);
  }

  // Stats tracking
  function trackWarpTrigger() {
    chrome.storage.local.get(['warpTriggeredDays'], (data) => {
      const today = new Date().toISOString().split('T')[0];
      const countMap = data.warpTriggeredDays || {};
      countMap[today] = (countMap[today] || 0) + 1;
      chrome.storage.local.set({ warpTriggeredDays: countMap });
    });
  }

  // Scroll detection
  window.addEventListener("scroll", () => {
    if (!scrollStartTime) scrollStartTime = Date.now();

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      scrollStartTime = null;
      resetScroll();
    }, 1000);

    if (Date.now() - scrollStartTime > 10000) {
      applySlowEffect();
    }
  }, { passive: true });
});