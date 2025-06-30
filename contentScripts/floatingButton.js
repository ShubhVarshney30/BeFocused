// Enhanced floatingButton.js that works without page refresh
(() => {
  // Check sprint status immediately
  checkSprintStatus();
  
  // Set up storage listener for changes
  chrome.storage.onChanged.addListener((changes) => {
    if ('sprintActive' in changes) {
      if (changes.sprintActive.newValue) {
        createStopButton();
      } else {
        removeStopButton();
      }
    }
    
    if ('focusHost' in changes) {
      checkFocusMode(changes.focusHost.newValue);
    }
  });

  // Check current sprint status
  function checkSprintStatus() {
    chrome.storage.local.get(['sprintActive', 'focusHost'], (data) => {
      if (data.sprintActive) {
        createStopButton();
      }
      if (data.focusHost) {
        checkFocusMode(data.focusHost);
      }
    });
  }

  // Create the stop button
  function createStopButton() {
    if (document.getElementById('floatingStopBtn')) return;

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
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      transition: 'transform 0.2s, opacity 0.2s'
    });

    // Add hover effects
    stopBtn.onmouseenter = () => {
      stopBtn.style.transform = 'scale(1.05)';
      stopBtn.style.opacity = '0.9';
    };
    stopBtn.onmouseleave = () => {
      stopBtn.style.transform = 'scale(1)';
      stopBtn.style.opacity = '1';
    };

    stopBtn.onclick = () => {
      // Visual feedback
      stopBtn.textContent = '⏳ Stopping...';
      stopBtn.style.backgroundColor = '#757575';
      
      chrome.storage.local.set({ sprintActive: false }, () => {
        // Optional: Add confirmation animation
        stopBtn.textContent = '✓ Stopped';
        setTimeout(() => {
          stopBtn.remove();
        }, 1000);
      });
    };
    
    document.body.appendChild(stopBtn);
    
    // Animate appearance
    setTimeout(() => {
      stopBtn.style.transform = 'translateY(0)';
      stopBtn.style.opacity = '1';
    }, 10);
  }

  // Remove the stop button
  function removeStopButton() {
    const btn = document.getElementById('floatingStopBtn');
    if (btn) {
      // Animate removal
      btn.style.transform = 'translateY(20px)';
      btn.style.opacity = '0';
      setTimeout(() => btn.remove(), 200);
    }
  }

  // Check and enforce focus mode
  function checkFocusMode(allowedHost) {
    if (!allowedHost) return;
    
    const currentHost = window.location.hostname;
    if (!currentHost.includes(allowedHost) && !document.getElementById('focus-mode-block')) {
      document.body.innerHTML = `
        <div id="focus-mode-block" style="
          display: flex; 
          flex-direction: column;
          align-items: center; 
          justify-content: center; 
          height: 100vh; 
          font-size: 20px; 
          color: #d32f2f; 
          font-family: sans-serif; 
          text-align: center;
          padding: 20px;
          background: #ffebee;
        ">
          <h2 style="margin-bottom: 20px;">🚫 Focus Mode Active</h2>
          <p style="margin-bottom: 30px;">
            Only <strong>${allowedHost}</strong> is allowed during focus sessions.
          </p>
          <button id="focus-mode-redirect" style="
            padding: 10px 20px;
            background: #388e3c;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
          ">
            Take Me to ${allowedHost}
          </button>
        </div>
      `;

      // Add redirect functionality
      document.getElementById('focus-mode-redirect').addEventListener('click', () => {
        window.location.href = `https://${allowedHost}`;
      });
    }
  }

  // MutationObserver to handle dynamic content
  const observer = new MutationObserver((mutations) => {
    chrome.storage.local.get(['sprintActive', 'focusHost'], (data) => {
      if (data.sprintActive) {
        createStopButton();
      }
      if (data.focusHost) {
        checkFocusMode(data.focusHost);
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();