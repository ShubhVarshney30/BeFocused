/* Enforce Focus Mode – runs in every tab */
(async () => {
    const { focusHost, focusEnd } = await chrome.storage.local.get(["focusHost", "focusEnd"]);
    if (!focusHost || !focusEnd || Date.now() > focusEnd) return; // no active session
  
    const currentHost = location.hostname;
    const allowed = currentHost === focusHost || currentHost.endsWith("." + focusHost);
  
    if (!allowed) {
      location.replace(chrome.runtime.getURL("block.html"));
    }
  })();
  