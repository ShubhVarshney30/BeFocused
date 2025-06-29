// Focus Mode Blocker Content Script
(function() {
  chrome.storage.local.get(['focusSite', 'focusEndTime'], (data) => {
    const now = Date.now();
    if (data.focusSite && data.focusEndTime && now < data.focusEndTime) {
      const allowedUrl = new URL(data.focusSite);
      const currentUrl = window.location;
      // Allow if current origin matches allowed origin
      if (currentUrl.origin !== allowedUrl.origin) {
        // Don't block the block.html page itself
        if (!window.location.pathname.endsWith('block.html')) {
          window.location.href = chrome.runtime.getURL('block.html');
        }
      }
    }
  });
})(); 