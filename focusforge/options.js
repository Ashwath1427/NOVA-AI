document.addEventListener('DOMContentLoaded', () => {
  const blocklistEl = document.getElementById('blocklist');
  const newSiteInput = document.getElementById('new-site');
  const addSiteBtn = document.getElementById('add-site-btn');
  const dailyGoalInput = document.getElementById('daily-goal');
  const sessionLengthInput = document.getElementById('session-length');
  const lockPasswordInput = document.getElementById('lock-password');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const resetBtn = document.getElementById('reset-btn');
  
  let currentBlocklist = [];

  // Toast Helper
  function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Load Data
  chrome.storage.local.get(["blocklist", "settings"], (data) => {
    currentBlocklist = data.blocklist || [];
    renderBlocklist();
    
    if (data.settings) {
      dailyGoalInput.value = Math.floor((data.settings.dailyGoal || 7200) / 60);
      sessionLengthInput.value = Math.floor((data.settings.sessionLength || 1500) / 60);
    }
  });

  function renderBlocklist() {
    blocklistEl.innerHTML = '';
    currentBlocklist.forEach((site, index) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${site}</span> <button class="remove-btn" data-index="${index}">Remove</button>`;
      blocklistEl.appendChild(li);
    });

    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.getAttribute('data-index');
        currentBlocklist.splice(idx, 1);
        saveBlocklist();
      });
    });
  }

  function saveBlocklist() {
    chrome.storage.local.set({ blocklist: currentBlocklist }, () => {
      renderBlocklist();
      // Background script should re-evaluate rules when blocklist changes
      // In a real app we'd trigger a message, or background can listen to storage changes
    });
  }

  addSiteBtn.addEventListener('click', () => {
    const site = newSiteInput.value.trim().toLowerCase();
    if (site && !currentBlocklist.includes(site)) {
      currentBlocklist.push(site);
      newSiteInput.value = '';
      saveBlocklist();
    }
  });

  saveSettingsBtn.addEventListener('click', () => {
    const dailyGoal = parseInt(dailyGoalInput.value) * 60; // in seconds
    const sessionLength = parseInt(sessionLengthInput.value) * 60; // in seconds
    chrome.storage.local.set({ settings: { dailyGoal, sessionLength } }, () => {
      showToast("Settings saved!");
    });
  });

  resetBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset all progress, points, and streaks?")) {
      const defaultSettings = {
        blocklist: ["instagram.com", "youtube.com", "reddit.com"],
        dailyUsage: {},
        focusSessions: [],
        points: 0,
        level: "Novice",
        streak: 0,
        unclaimedReward: false,
        lastRewardPoints: 0,
        settings: { dailyGoal: 7200, sessionLength: 25 * 60, password: "" }
      };
      chrome.storage.local.set(defaultSettings, () => {
        showToast("Progress reset!");
        location.reload();
      });
    }
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    chrome.storage.local.get(null, (data) => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = "focusforge-data.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  });
});
