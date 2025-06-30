// Create floating stop button
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
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
  });
  
  stopBtn.onclick = () => {
    chrome.storage.local.set({ sprintActive: false });
  };
  
  document.body.appendChild(stopBtn);
}

// Block distracting content during focus mode
chrome.storage.local.get(['focusHost'], (data) => {
  if (data.focusHost && !window.location.hostname.includes(data.focusHost)) {
    document.body.innerHTML = `
      <div style="
        display: flex; 
        align-items: center; 
        justify-content: center; 
        height: 100vh; 
        font-size: 20px; 
        color: red; 
        font-family: sans-serif; 
        text-align: center;
        padding: 20px;
      ">
        🚫 Focus Mode Active. Only ${data.focusHost} is allowed.
      </div>
    `;
  }
});