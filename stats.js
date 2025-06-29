// stats.js

const toggle = document.getElementById('darkModeToggle');

// Load saved theme
chrome.storage.local.get('darkMode', (data) => {
  if (data.darkMode) {
    document.body.classList.add('dark');
    toggle.checked = true;
  }
});

toggle.addEventListener('change', () => {
  const isDark = toggle.checked;
  document.body.classList.toggle('dark', isDark);
  chrome.storage.local.set({ darkMode: isDark });
});

// Load stats and render chart
chrome.storage.local.get([
  'tabSwitchCount',
  'longestFocusStreak',
  'warpTriggeredDays',
  'userPoints'
], (data) => {
  const switchCount = data.tabSwitchCount || 0;
  const streak = data.longestFocusStreak || 0;
  const warpDays = data.warpTriggeredDays || {};
  const points = data.userPoints || 0;

  const today = new Date().toISOString().split("T")[0];
  const todayTriggers = warpDays[today] || 0;

  document.getElementById('tabSwitches').innerText = switchCount;
  document.getElementById('focusStreak').innerText = `${streak} min`;
  document.getElementById('warpDays').innerText = `${todayTriggers} times today`;

  // Optional: Add points display if using a stat block
  const pointsEl = document.getElementById('pointsEarned');
  if (pointsEl) {
    pointsEl.innerText = `${points} pts`;
  }

  new Chart(document.getElementById('usageChart'), {
    type: 'doughnut',
    data: {
      labels: ['Focused Time', 'Distracted Time'],
      datasets: [{
        data: [streak, switchCount / 3],
        backgroundColor: ['#4caf50', '#f44336']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        },
        title: {
          display: true,
          text: 'Focus vs Distraction'
        }
      }
    }
  });
});
