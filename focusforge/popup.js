document.addEventListener('DOMContentLoaded', async () => {
  const timerDisplay = document.getElementById('timer-display');
  const toggleBtn = document.getElementById('toggle-timer-btn');
  const streakCount = document.getElementById('streak-count');
  const levelName = document.getElementById('level-name');
  const pointsCount = document.getElementById('points-count');
  const levelProgress = document.getElementById('level-progress');
  const gardenContainer = document.getElementById('garden-container');
  const focusScoreCircle = document.getElementById('focus-score-circle');
  const focusScoreText = document.getElementById('focus-score-text');
  
  const passwordModal = document.getElementById('password-modal');
  const stopPasswordInput = document.getElementById('stop-password-input');
  const cancelStopBtn = document.getElementById('cancel-stop-btn');
  const confirmStopBtn = document.getElementById('confirm-stop-btn');
  
  const customTimeContainer = document.getElementById('custom-time-container');
  const customTimeInput = document.getElementById('custom-time-input');
  
  let timerInterval;
  let sessionEndTime = 0;
  let isFocusActive = false;
  let requiredPassword = "";

  // Toast Helper
  function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Initialize UI with storage data
  chrome.storage.local.get(["points", "level", "streak", "focusSessions", "dailyUsage", "settings", "unclaimedReward", "lastRewardPoints"], (data) => {
    streakCount.innerText = data.streak || 0;
    levelName.innerText = data.level || "Novice";
    pointsCount.innerText = data.points || 0;
    
    if (data.unclaimedReward) {
      document.getElementById('reward-text').innerText = `+${data.lastRewardPoints || 10} Points & 1 Seed 🌱`;
      document.getElementById('reward-overlay').style.display = 'flex';
      
      document.getElementById('claim-reward-btn').addEventListener('click', () => {
        document.getElementById('reward-overlay').style.display = 'none';
        chrome.storage.local.set({ unclaimedReward: false });
        fireConfetti();
      });
    }
    
    if (data.settings && data.settings.password) {
      requiredPassword = data.settings.password;
    }
    
    if (data.settings && data.settings.sessionLength) {
      const defaultMins = Math.floor(data.settings.sessionLength / 60);
      customTimeInput.value = defaultMins;
      if (!isFocusActive) {
        timerDisplay.innerText = `${defaultMins.toString().padStart(2, '0')}:00`;
      }
    }
    
    // Calculate progress bar (0-500, 500-1500, etc)
    let pts = data.points || 0;
    let max = 500;
    if (pts >= 3000) max = pts; // Maxed out
    else if (pts >= 1500) { pts -= 1500; max = 1500; }
    else if (pts >= 500) { pts -= 500; max = 1000; }
    
    let percent = Math.min(100, Math.max(0, (pts / max) * 100));
    levelProgress.style.width = `${percent}%`;

    // Render Virtual Garden
    const sessions = data.focusSessions || [];
    const today = new Date().toISOString().split('T')[0];
    const todaysSessions = sessions.filter(s => s.date === today && s.completed).length;
    
    gardenContainer.innerHTML = '';
    const plantTypes = ['🌱', '🌿', '🌲', '🌳', '🌻'];
    for (let i = 0; i < todaysSessions; i++) {
      const plant = document.createElement('span');
      plant.innerText = plantTypes[i % plantTypes.length];
      plant.style.fontSize = '18px';
      gardenContainer.appendChild(plant);
    }
    if (todaysSessions === 0) {
      gardenContainer.innerHTML = '<span style="color:var(--text-secondary); font-size: 12px;">Start a session to plant a seed!</span>';
    }

    // Calculate Focus Score
    // Simplified score logic: Based on daily goal vs usage
    const usage = data.dailyUsage || {};
    let totalDistractionTime = 0;
    for (let site in usage) totalDistractionTime += usage[site];
    
    // 2 hours goal = 7200 seconds
    let score = 100 - Math.floor((totalDistractionTime / 7200) * 100);
    score = Math.max(0, Math.min(100, score)); // clamp 0-100
    
    focusScoreText.innerText = score;
    focusScoreCircle.setAttribute('stroke-dasharray', `${score}, 100`);
    
    // Color logic
    if (score < 50) focusScoreCircle.style.stroke = '#ef4444';
    else if (score < 80) focusScoreCircle.style.stroke = '#f59e0b';
    else focusScoreCircle.style.stroke = '#10b981';
  });

  // Check current focus state
  chrome.runtime.sendMessage({ action: "GET_FOCUS_STATE" }, (response) => {
    isFocusActive = response.isFocusActive;
    if (isFocusActive) {
      sessionEndTime = response.sessionEndTime;
      startTimerDisplay();
      toggleBtn.innerText = "Stop Focus";
      toggleBtn.classList.add("active");
      customTimeContainer.style.display = "none";
    }
  });

  // Custom Time Input listener
  customTimeInput.addEventListener('input', () => {
    if (!isFocusActive) {
      let mins = parseInt(customTimeInput.value) || 25;
      timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:00`;
    }
  });

  // Toggle Timer Button
  toggleBtn.addEventListener('click', () => {
    if (isFocusActive) {
      stopFocusSession();
    } else {
      // Start
      let mins = parseInt(customTimeInput.value) || 25;
      const duration = mins * 60; 
      chrome.runtime.sendMessage({ action: "START_FOCUS", duration: duration }, (response) => {
        isFocusActive = true;
        sessionEndTime = response.sessionEndTime;
        startTimerDisplay();
        toggleBtn.innerText = "Stop Focus";
        toggleBtn.classList.add("active");
        customTimeContainer.style.display = "none";
      });
    }
  });

  function stopFocusSession() {
    chrome.runtime.sendMessage({ action: "STOP_FOCUS" }, () => {
      isFocusActive = false;
      clearInterval(timerInterval);
      let mins = parseInt(customTimeInput.value) || 25;
      timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:00`;
      toggleBtn.innerText = "Start Focus";
      toggleBtn.classList.remove("active");
      customTimeContainer.style.display = "flex";
    });
  }

  function startTimerDisplay() {
    clearInterval(timerInterval);
    updateDisplay();
    timerInterval = setInterval(updateDisplay, 1000);
  }

  function updateDisplay() {
    const now = Date.now();
    const remainingMs = sessionEndTime - now;
    
    if (remainingMs <= 0) {
      clearInterval(timerInterval);
      timerDisplay.innerText = "00:00";
      // The background script handles the end logic
      setTimeout(() => window.close(), 2000); // Close popup to force refresh next time
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    
    timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('stats-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'stats.html' });
  });

  function fireConfetti() {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    for (let i = 0; i < 60; i++) {
      const confetti = document.createElement('div');
      confetti.style.position = 'fixed';
      confetti.style.width = '10px';
      confetti.style.height = '10px';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.top = '-20px';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      confetti.style.zIndex = '9999';
      confetti.style.pointerEvents = 'none';
      document.body.appendChild(confetti);

      const fallDuration = Math.random() * 2 + 1.5;
      const horizontalSway = (Math.random() * 150) - 75;

      confetti.animate([
        { transform: `translate3d(0, 0, 0) rotate(0deg)`, opacity: 1 },
        { transform: `translate3d(${horizontalSway}px, 120vh, 0) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], {
        duration: fallDuration * 1000,
        easing: 'cubic-bezier(.37,0,.63,1)',
        fill: 'forwards'
      });

      setTimeout(() => confetti.remove(), fallDuration * 1000);
    }
  }
});
