document.addEventListener('DOMContentLoaded', () => {
  const thresholdInput = document.getElementById('thresholdInput');
  const enableSound = document.getElementById('enableSound');
  const enableDark = document.getElementById('enableDark');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.local.get(['customThreshold', 'soundEnabled', 'darkMode'], (data) => {
    thresholdInput.value = data.customThreshold || 10;
    enableSound.checked = data.soundEnabled || false;
    enableDark.checked = data.darkMode || false;
  });

  // Save on click
  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      customThreshold: parseInt(thresholdInput.value),
      soundEnabled: enableSound.checked,
      darkMode: enableDark.checked
    }, () => {
      status.textContent = '✅ Settings saved!';
      setTimeout(() => status.textContent = '', 2000);
    });
  });
});
