// js/focus.js
// NOVA 2.0 — FocusForge Execution Engine & Distraction Shield (Phases 8 & 9)
// Adapted from the FocusForge project architecture (Virtual Garden, Circular Chart, Points, Streak, Shield)
// Note: Password requirement removed per user request: "just it blocks, no need of that password thing".

window.novaFocus = {
  session: null,
  timerInterval: null,
  coachInterval: null,

  coachTips: [
    "Deep work requires single-tasking. Stay locked in.",
    "Distractions are temporary, but finished work is permanent.",
    "You're in flow state right now. Protect your attention.",
    "FocusForge Shield is guarding you from high-distraction sites.",
    "One micro-step at a time. Finish this section before looking up.",
    "Momentum builds with every minute of silence."
  ],

  init() {
    this.loadGamificationData();
    this.initExtensionBridge();

    // Check if an active session survived a page reload
    const saved = localStorage.getItem('nova_active_focus_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.taskId) {
          if (!parsed.isPaused && parsed.lastTick) {
            const elapsed = Math.floor((Date.now() - parsed.lastTick) / 1000);
            parsed.remainingSeconds = Math.max(0, parsed.remainingSeconds - elapsed);
          }
          parsed.lastTick = Date.now();
          this.session = parsed;
          this.renderSessionUI();
          this.showOverlay();
          if (!this.session.isPaused) {
            this.startTicker();
          }
        }
      } catch (e) {
        console.warn('Could not restore focus session:', e);
        localStorage.removeItem('nova_active_focus_session');
      }
    }
  },

  initExtensionBridge() {
    window.addEventListener('message', (event) => {
      if (!event.data || !event.data.type) return;
      if (event.data.type === 'FOCUSFORGE_LOADED' || event.data.type === 'FOCUSFORGE_PONG') {
        this.extensionConnected = true;
        const shieldEl = document.getElementById('ffShieldStatus');
        if (shieldEl) {
          shieldEl.innerHTML = '<span style="color: #4ade80;">● FocusForge Extension Connected (Shield Active)</span>';
        }
      }
    });

    window.postMessage({ type: 'NOVA_PING_EXTENSION' }, '*');
  },

  loadGamificationData() {
    const data = JSON.parse(localStorage.getItem('nova_focusforge_stats') || '{}');
    const points = data.points || 50;
    const streak = data.streak || 1;
    const plants = data.plants || ['🌱', '🌿', '🌻'];

    // Update Streak
    const streakEl = document.getElementById('ffStreakCount');
    if (streakEl) streakEl.textContent = String(streak);

    // Update Points & Level
    const ptsEl = document.getElementById('ffPointsCount');
    const levelEl = document.getElementById('ffLevelName');
    const progressEl = document.getElementById('ffLevelProgress');

    let lvl = "Novice";
    let maxPts = 100;
    if (points >= 500) { lvl = "Master"; maxPts = points; }
    else if (points >= 250) { lvl = "Adept"; maxPts = 500; }
    else if (points >= 100) { lvl = "Apprentice"; maxPts = 250; }

    if (levelEl) levelEl.textContent = lvl;
    if (ptsEl) ptsEl.textContent = `${points} pts`;
    if (progressEl) {
      const pct = Math.min(100, Math.max(10, Math.round((points / maxPts) * 100)));
      progressEl.style.width = `${pct}%`;
    }

    // Update Virtual Garden
    const gardenEl = document.getElementById('ffGardenContainer');
    if (gardenEl) {
      gardenEl.innerHTML = plants.map(p => `<span class="ff-plant-emoji">${p}</span>`).join('');
    }
  },

  startSession(task) {
    if (!task) return;

    // Determine estimated duration (default 45 min)
    let durationMins = 45;
    if (task.estimated_minutes && !isNaN(task.estimated_minutes)) {
      durationMins = parseInt(task.estimated_minutes, 10);
    } else if (task.title) {
      const match = task.title.match(/(\d+)\s*(?:min|m\b)/i);
      if (match) durationMins = parseInt(match[1], 10);
    }

    this.session = {
      taskId: task.id,
      taskTitle: task.title,
      taskObjective: task.description || 'Current Focus: Deep work execution. Minimize all other distractions.',
      totalSeconds: durationMins * 60,
      remainingSeconds: durationMins * 60,
      isPaused: false,
      startedAt: Date.now(),
      lastTick: Date.now()
    };

    this.saveSession();
    this.renderSessionUI();
    this.showOverlay();
    this.startTicker();

    // Broadcast focus start to FocusForge Chrome extension
    window.postMessage({
      type: 'NOVA_START_FOCUS',
      duration: durationMins * 60,
      taskTitle: task.title
    }, '*');

    if (window.showToast) {
      window.showToast(`🛡️ FocusForge Active: Distraction shield locked on "${task.title}"`, 'default');
    }
  },

  saveSession() {
    if (this.session) {
      localStorage.setItem('nova_active_focus_session', JSON.stringify(this.session));
    } else {
      localStorage.removeItem('nova_active_focus_session');
    }
  },

  renderSessionUI() {
    if (!this.session) return;

    const titleEl = document.getElementById('focusTaskTitle');
    const objEl = document.getElementById('focusTaskObjective');
    const controlsRow = document.getElementById('focusControlsRow');
    const summaryCard = document.getElementById('focusSummaryCard');

    if (titleEl) titleEl.textContent = this.session.taskTitle;
    if (objEl) objEl.textContent = this.session.taskObjective;
    if (controlsRow) controlsRow.classList.remove('hidden');
    if (summaryCard) summaryCard.classList.add('hidden');

    this.updateTimerDisplay();
    this.updateCircularProgress();
    this.updatePauseButton();
    this.rotateCoachMessage();
  },

  startTicker() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.session || this.session.isPaused) return;

      const now = Date.now();
      const elapsed = Math.floor((now - this.session.lastTick) / 1000);
      this.session.lastTick = now;

      if (elapsed > 0) {
        this.session.remainingSeconds = Math.max(0, this.session.remainingSeconds - elapsed);
        this.updateTimerDisplay();
        this.updateCircularProgress();
        this.saveSession();

        if (this.session.remainingSeconds <= 0) {
          const display = document.getElementById('focusTimerDisplay');
          if (display) display.textContent = "00:00";
          if (window.showToast) {
            window.showToast("🔔 Focus duration finished! Take a break or wrap up.", 'default');
          }
          clearInterval(this.timerInterval);
        }
      }
    }, 1000);

    // Rotate coach advice every 60 seconds
    if (this.coachInterval) clearInterval(this.coachInterval);
    this.coachInterval = setInterval(() => this.rotateCoachMessage(), 60000);
  },

  updateTimerDisplay() {
    const display = document.getElementById('focusTimerDisplay');
    if (!display || !this.session) return;

    const s = this.session.remainingSeconds;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  updateCircularProgress() {
    const circle = document.getElementById('ffProgressCircle');
    if (!circle || !this.session) return;

    const total = this.session.totalSeconds || 2700;
    const rem = this.session.remainingSeconds;
    // Percentage remaining (100 -> 0)
    const pct = Math.max(0, Math.min(100, Math.round((rem / total) * 100)));
    circle.setAttribute('stroke-dasharray', `${pct}, 100`);

    // Dynamic color: Green -> Amber -> Red as time draws to a close
    if (pct < 15) {
      circle.style.stroke = '#ef4444';
    } else if (pct < 40) {
      circle.style.stroke = '#f59e0b';
    } else {
      circle.style.stroke = '#10b981';
    }
  },

  updatePauseButton() {
    const icon = document.getElementById('focusPauseIcon');
    const text = document.getElementById('focusPauseText');
    const stateLabel = document.getElementById('focusStateLabel');
    if (!this.session) return;

    if (this.session.isPaused) {
      if (text) text.textContent = 'Resume';
      if (icon) icon.setAttribute('data-lucide', 'play');
      if (stateLabel) stateLabel.textContent = 'PAUSED';
    } else {
      if (text) text.textContent = 'Pause';
      if (icon) icon.setAttribute('data-lucide', 'pause');
      if (stateLabel) stateLabel.textContent = 'LOCKED IN';
    }
    if (window.lucide) window.lucide.createIcons();
  },

  rotateCoachMessage() {
    const el = document.getElementById('ffCoachMessage');
    if (!el) return;
    const randomTip = this.coachTips[Math.floor(Math.random() * this.coachTips.length)];
    el.textContent = randomTip;
  },

  togglePause() {
    if (!this.session) return;
    // NO PASSWORD REQUIRED!
    this.session.isPaused = !this.session.isPaused;
    this.session.lastTick = Date.now();
    this.saveSession();
    this.updatePauseButton();

    if (this.session.isPaused) {
      clearInterval(this.timerInterval);
      if (window.showToast) window.showToast('⏸ Focus session paused', 'default');
    } else {
      this.startTicker();
      if (window.showToast) window.showToast('▶ Focus session resumed', 'default');
    }
  },

  async completeSession() {
    if (!this.session) return;
    clearInterval(this.timerInterval);
    if (this.coachInterval) clearInterval(this.coachInterval);

    const taskId = this.session.taskId;
    const spentMinutes = Math.max(1, Math.round((this.session.totalSeconds - this.session.remainingSeconds) / 60));

    // Update database status
    if (window.supabaseClient && taskId) {
      try {
        await window.supabaseClient
          .from('tasks')
          .update({
            status: 'Completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', taskId);

        if (window.novaTasks?.loadTasks) window.novaTasks.loadTasks();
        if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      } catch (err) {
        console.warn('Could not mark task completed:', err);
      }
    }

    // Award FocusForge Points & Grow Virtual Garden Plant
    const stats = JSON.parse(localStorage.getItem('nova_focusforge_stats') || '{}');
    const plantTypes = ['🌱', '🌿', '🌲', '🌳', '🌻', '🌸', '🌵'];
    const randomPlant = plantTypes[Math.floor(Math.random() * plantTypes.length)];

    stats.points = (stats.points || 50) + 25;
    stats.plants = stats.plants || ['🌱', '🌿', '🌻'];
    stats.plants.push(randomPlant);
    stats.streak = (stats.streak || 1) + 1;
    localStorage.setItem('nova_focusforge_stats', JSON.stringify(stats));

    this.loadGamificationData();

    // Show Session Complete Summary
    const controlsRow = document.getElementById('focusControlsRow');
    const summaryCard = document.getElementById('focusSummaryCard');
    const summaryStats = document.getElementById('focusSummaryStats');

    if (controlsRow) controlsRow.classList.add('hidden');
    if (summaryCard) summaryCard.classList.remove('hidden');
    if (summaryStats) {
      summaryStats.textContent = `You completed "${this.session.taskTitle}" after ${spentMinutes} minute${spentMinutes !== 1 ? 's' : ''} of deep focus.`;
    }

    localStorage.removeItem('nova_active_focus_session');
    this.session = null;

    // Broadcast focus stop to FocusForge Chrome extension
    window.postMessage({ type: 'NOVA_STOP_FOCUS' }, '*');

    if (window.showToast) {
      window.showToast('🎉 FocusForge: +25 Points & Plant Grown!', 'success');
    }
  },

  exitSession() {
    // NO PASSWORD REQUIRED! Clean confirmation dialog
    if (confirm('Exit FocusForge session? Your timer will stop.')) {
      clearInterval(this.timerInterval);
      if (this.coachInterval) clearInterval(this.coachInterval);
      localStorage.removeItem('nova_active_focus_session');
      this.session = null;
      window.postMessage({ type: 'NOVA_STOP_FOCUS' }, '*');
      this.closeOverlay();
    }
  },

  showOverlay() {
    const overlay = document.getElementById('focusSessionOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }
  },

  closeOverlay() {
    const overlay = document.getElementById('focusSessionOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.novaFocus.init();
});
