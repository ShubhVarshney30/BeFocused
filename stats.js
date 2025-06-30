const toggle = document.getElementById('darkModeToggle');

// Dark mode toggle logic
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

// Load and display today's stats only
chrome.storage.local.get([
  'tabSwitchCount',
  'longestFocusStreak',
  'warpTriggeredDays',
  'userPoints',
  'totalPenaltyToday'
], (data) => {
  const switchCount = data.tabSwitchCount || 0;
  const streak = data.longestFocusStreak || 0;
  const warpDays = data.warpTriggeredDays || {};
  const points = data.userPoints || 0;
  const penalty = data.totalPenaltyToday || 0;
  const netPoints = points - penalty;

  const today = new Date().toISOString().split("T")[0];
  const todayTriggers = warpDays[today] || 0;

  document.getElementById('tabSwitches').innerText = switchCount;
  document.getElementById('focusStreak').innerText = `${streak} min`;
  document.getElementById('warpDays').innerText = `${todayTriggers} times today`;
  document.getElementById('pointsEarned').innerText = `${points} pts`;
  document.getElementById('penaltyToday').innerText = `${penalty} coins`;
  document.getElementById('netPoints').innerText = `${netPoints}`;

  if (typeof Chart === 'undefined') {
    console.error("Chart.js not loaded. Make sure chart.min.js is included in stats.html.");
    return;
  }

  // 🟢 Today's Focus vs Distraction Pie Chart
  new Chart(document.getElementById('usageChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Focused Time', 'Distracted Time'],
      datasets: [{
        data: [streak, switchCount / 3], // Approximating distraction time
        backgroundColor: ['#4caf50', '#f44336']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: {
          display: true,
          text: 'Focus vs Distraction (Today)'
        }
      }
    }
  });
});
