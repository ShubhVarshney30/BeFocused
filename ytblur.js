/* ---------------------------------------------------------------------------
   Blur (or unblur) every thumbnail <img> element in the document.
--------------------------------------------------------------------------- */

let blurEnabled = true; // Updated via chrome.storage

/** Apply correct filter to all current thumbnails. */
const applyBlur = () => {
  document
    .querySelectorAll('ytd-thumbnail img')
    .forEach((img) => (img.style.filter = blurEnabled ? 'blur(10px)' : ''));
};

/** Watch for new thumbnails (YouTube is an SPA). */
const observer = new MutationObserver(applyBlur);
observer.observe(document.body, { childList: true, subtree: true });

/* ---------- Initialise from storage ---------- */
chrome.storage.sync.get({ blurEnabled: true }, (data) => {
  blurEnabled = data.blurEnabled;
  applyBlur();
});

/* ---------- React instantly to popup changes ---------- */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.blurEnabled) {
    blurEnabled = changes.blurEnabled.newValue;
    applyBlur();
  }
});
