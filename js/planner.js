// js/planner.js - NOVA One-Click AI Day Execution System
// Real-time integration with Google Calendar, Supabase tasks, deterministic validation,
// persistent day state in daily_plans, and execution HUD.

window.novaPlanner = {
  currentPlan: null,
  activeHudTimer: null,
  isGenerating: false,

  /**
   * Main initializer called when navigating to the Planner view
   */
  async initPlanner() {
    this.updateFormattedDate();
    await this.loadTodayPlan();

    // Attach 'C' keyboard shortcut for Quick Complete
    if (!this.hasAttachedKeydown) {
      document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input or textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
          return;
        }
        if (e.key === 'c' || e.key === 'C') {
          const hud = document.getElementById('plannerActiveHud');
          if (hud && !hud.classList.contains('hidden')) {
            const btn = document.getElementById('btnCompleteHudTask');
            if (btn) btn.click();
          }
        }
      });
      this.hasAttachedKeydown = true;
    }
  },

  loadPlanner() {
    return this.initPlanner();
  },

  updateFormattedDate() {
    const el = document.getElementById('plannerFormattedDate');
    if (el) {
      const now = new Date();
      el.textContent = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(now);
    }
  },

  /**
   * Loads today's plan from the server / Supabase daily_plans table
   */
  async loadTodayPlan() {
    const timelineEl = document.getElementById('plannerTimeline');
    if (!timelineEl) return;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) {
        timelineEl.innerHTML = `
          <div style="text-align: center; padding: 48px 24px; color: var(--text-muted);">
            Please sign in to view and execute your daily plan.
          </div>
        `;
        return;
      }

      // Fetch today's plan and summary metrics
      const res = await fetch('/api/planner/today', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      this.updateSummaryMetrics(data.summary);

      if (data.exists && data.plan && Array.isArray(data.plan.blocks) && data.plan.blocks.length > 0) {
        this.currentPlan = data.plan;
        this.renderTimeline(data.plan.blocks);
        this.setupPlanControls(true, data.plan.activeDayStarted);

        if (data.plan.activeDayStarted) {
          const hud = document.getElementById('plannerActiveHud');
          if (hud) hud.classList.remove('hidden');
          this.startHudTicker();
        } else {
          const hud = document.getElementById('plannerActiveHud');
          if (hud) hud.classList.add('hidden');
        }
      } else {
        this.currentPlan = null;
        const completeCard = document.getElementById('plannerDayCompleteCard');
        if (completeCard) completeCard.classList.add('hidden');
        const hud = document.getElementById('plannerActiveHud');
        if (hud) hud.classList.add('hidden');
        this.setupPlanControls(false, false);
        this.renderEmptyState();
      }
    } catch (err) {
      console.error("Error loading today's plan:", err);
      timelineEl.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #f87171;">
          <p style="margin-bottom: 12px;">Failed to load daily plan.</p>
          <button class="btn btn-secondary btn-sm" onclick="window.novaPlanner.loadTodayPlan()">Retry</button>
        </div>
      `;
    }
  },

  /**
   * Updates the compact metric header strip
   */
  updateSummaryMetrics(summary) {
    if (!summary) return;
    const availEl = document.getElementById('metricAvailableTime');
    const fixedEl = document.getElementById('metricFixedCount');
    const taskEl = document.getElementById('metricTaskCount');
    const deadEl = document.getElementById('metricDeadlineCount');

    if (availEl) availEl.textContent = summary.availableTime || 'N/A';
    if (fixedEl) fixedEl.textContent = summary.fixedCount ?? '0';
    if (taskEl) taskEl.textContent = summary.taskCount ?? '0';
    if (deadEl) deadEl.textContent = summary.deadlineCount ?? '0';
  },

  /**
   * Updates CTA button state based on plan status
   */
  setupPlanControls(hasPlan, isStarted) {
    const primaryBtn = document.getElementById('btnPrimaryPlan');
    const primaryText = document.getElementById('btnPrimaryPlanText');
    const replanBtn = document.getElementById('btnReplanSecondary');

    if (!primaryBtn || !primaryText) return;

    if (!hasPlan) {
      primaryText.textContent = '✨ Plan My Day';
      primaryBtn.onclick = () => this.planMyDay(true);
      primaryBtn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
      primaryBtn.style.opacity = '1';
      if (replanBtn) replanBtn.classList.add('hidden');
    } else if (isStarted) {
      primaryText.textContent = '▶ Day In Progress';
      primaryBtn.onclick = () => {
        const hud = document.getElementById('plannerActiveHud');
        if (hud) hud.scrollIntoView({ behavior: 'smooth' });
      };
      primaryBtn.style.background = 'linear-gradient(135deg, #16a34a, #22c55e)';
      primaryBtn.style.opacity = '0.9';
      if (replanBtn) replanBtn.classList.remove('hidden');
    } else {
      primaryText.textContent = '▶ Start My Day';
      primaryBtn.onclick = () => this.startMyDay();
      primaryBtn.style.background = 'linear-gradient(135deg, #16a34a, #22c55e)';
      primaryBtn.style.opacity = '1';
      if (replanBtn) replanBtn.classList.remove('hidden');
    }
  },

  /**
   * Empty state when no plan has been generated yet
   */
  renderEmptyState() {
    const timelineEl = document.getElementById('plannerTimeline');
    if (!timelineEl) return;

    const completeCard = document.getElementById('plannerDayCompleteCard');
    if (completeCard) completeCard.classList.add('hidden');
    const hud = document.getElementById('plannerActiveHud');
    if (hud) hud.classList.add('hidden');

    timelineEl.innerHTML = `
      <div style="text-align: center; padding: 48px 24px;">
        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 1.6rem;">
          ✨
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-bottom: 8px;">
          Your day hasn't been planned yet
        </h3>
        <p style="font-size: 0.9rem; color: #94a3b8; max-width: 480px; margin: 0 auto 24px auto; line-height: 1.5;">
          Click <strong>Plan My Day</strong> to let NOVA cross-reference your real Google Calendar events, pending tasks, and priorities to generate an optimal, conflict-free schedule.
        </p>
        <button class="btn btn-primary" onclick="window.novaPlanner.planMyDay(true)" style="padding: 12px 28px; font-weight: 600; font-size: 0.95rem; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4); border: none;">
          ✨ Plan My Day
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  },

  /**
   * Helper delay for progress state animation
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Generates a new plan with realistic 6-step progress feedback
   */
  async planMyDay(force = true) {
    if (this.isGenerating) return;
    this.isGenerating = true;

    const progressState = document.getElementById('plannerProgressState');
    const progressMsg = document.getElementById('plannerProgressMessage');
    const primaryBtn = document.getElementById('btnPrimaryPlan');

    if (progressState) progressState.classList.remove('hidden');
    if (primaryBtn) primaryBtn.disabled = true;

    const steps = [
      "Checking your calendar...",
      "Analyzing pending tasks & deadlines...",
      "Checking Spotify audio preferences...",
      "Synthesizing collision-free time blocks...",
      "Validating schedule constraints...",
      "Finalizing your daily plan..."
    ];

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) throw new Error("Please log in to generate your plan.");

      // Start API generation in background while cycling progress messages
      const generatePromise = fetch('/api/planner/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ force })
      });

      // Display the 6 progress steps
      for (let i = 0; i < steps.length; i++) {
        if (progressMsg) progressMsg.textContent = steps[i];
        await this.wait(400);
      }

      const res = await generatePromise;
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.code === 'TRIAL_EXHAUSTED' || res.status === 403) {
          if (window.openGeminiSetupModal) {
            window.openGeminiSetupModal(() => {
              this.generatePlan(force);
            });
          }
          return;
        }
        throw new Error(errJson.error || `Server error ${res.status}`);
      }

      const json = await res.json();
      if (!json.plan || !Array.isArray(json.plan.blocks)) {
        throw new Error("Invalid plan structure received from server.");
      }

      this.currentPlan = json.plan;
      const completeCard = document.getElementById('plannerDayCompleteCard');
      if (completeCard) completeCard.classList.add('hidden');
      this.renderTimeline(json.plan.blocks);
      this.setupPlanControls(true, json.plan.activeDayStarted || false);

      if (window.showToast) {
        window.showToast('✨ Daily plan generated and saved for today!', 'success');
      }
    } catch (err) {
      console.error("Plan generation error:", err);
      if (window.showToast) {
        window.showToast('Failed to plan day: ' + err.message, 'error');
      }
    } finally {
      this.isGenerating = false;
      if (progressState) progressState.classList.add('hidden');
      if (primaryBtn) primaryBtn.disabled = false;
    }
  },

  /**
   * Starts active day execution HUD and persists state in Supabase
   */
  async startMyDay() {
    if (!this.currentPlan) {
      await this.planMyDay(false);
      return;
    }

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;

      // Persist day start in Supabase daily_plans
      await fetch('/api/planner/block-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ blockId: 'start_day', status: 'started' })
      });

      this.currentPlan.activeDayStarted = true;
      this.setupPlanControls(true, true);

      const hud = document.getElementById('plannerActiveHud');
      if (hud) {
        hud.classList.remove('hidden');
        hud.scrollIntoView({ behavior: 'smooth' });
      }

      this.startHudTicker();

      if (window.showToast) {
        window.showToast('🚀 Day started! Your current focus block is active.', 'success');
      }
    } catch (e) {
      console.warn("Could not record day start:", e);
    }
  },

  /**
   * Starts a recurring timer to update the Active Day HUD countdown and progress bar
   */
  startHudTicker() {
    if (this.activeHudTimer) clearInterval(this.activeHudTimer);
    this.updateActiveHud();
    this.activeHudTimer = setInterval(() => {
      this.updateActiveHud();
    }, 20000); // Check every 20 seconds
  },

  /**
   * Converts a 12-hour or ISO time string into minutes from midnight
   */
  timeStrToMinutes(str) {
    if (!str) return 0;
    if (str.includes('T')) {
      const d = new Date(str);
      return d.getHours() * 60 + d.getMinutes();
    }
    const match = str.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
    if (!match) return 0;
    let h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    const mer = match[3] ? match[3].toUpperCase() : null;
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  },

  /**
   * Evaluates current clock time against plan blocks and refreshes NOW / NEXT HUD
   */
  updateActiveHud() {
    if (!this.currentPlan || !Array.isArray(this.currentPlan.blocks)) return;

    const blocks = this.currentPlan.blocks;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Find the current active uncompleted block
    let activeBlock = null;
    let activeIdx = -1;

    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].status !== 'completed' && blocks[i].status !== 'skipped') {
        activeBlock = blocks[i];
        activeIdx = i;
        break;
      }
    }

    const hudEl = document.getElementById('plannerActiveHud');
    const completeCard = document.getElementById('plannerDayCompleteCard');

    // If there are no blocks in the plan at all
    if (blocks.length === 0) {
      if (hudEl) hudEl.classList.add('hidden');
      if (completeCard) completeCard.classList.add('hidden');
      if (this.activeHudTimer) clearInterval(this.activeHudTimer);
      return;
    }

    // If all blocks are completed or skipped
    if (!activeBlock) {
      if (hudEl) hudEl.classList.add('hidden');
      if (completeCard) {
        completeCard.classList.remove('hidden');
        this.renderCompletionStats(blocks);
      }
      if (this.activeHudTimer) clearInterval(this.activeHudTimer);
      return;
    }

    if (completeCard) completeCard.classList.add('hidden');
    if (hudEl) hudEl.classList.remove('hidden');

    const nextBlock = activeIdx + 1 < blocks.length ? blocks[activeIdx + 1] : null;

    // 1. Populate NOW panel
    const nowTitleEl = document.getElementById('hudNowTitle');
    const nowCatEl = document.getElementById('hudNowCategory');
    const nowTimeEl = document.getElementById('hudNowTime');
    const nowRemEl = document.getElementById('hudNowRemaining');
    const nowProgressEl = document.getElementById('hudNowProgressBar');
    const nowSpotifyEl = document.getElementById('hudNowSpotify');
    const completeBtn = document.getElementById('btnCompleteHudTask');

    if (nowTitleEl) nowTitleEl.textContent = activeBlock.title;
    if (nowCatEl) {
      let icon = '🎯';
      if (activeBlock.type === 'calendar') icon = '📅';
      else if (activeBlock.type === 'workout') icon = '⚡';
      else if (activeBlock.type === 'break') icon = '☕';
      nowCatEl.textContent = `${icon} ${activeBlock.category || activeBlock.type}`;
    }
    if (nowTimeEl) nowTimeEl.textContent = `${activeBlock.startTime} — ${activeBlock.endTime}`;

    // Progress bar & time remaining calculation
    const startMin = this.timeStrToMinutes(activeBlock.startTime);
    const endMin = this.timeStrToMinutes(activeBlock.endTime);
    const totalDuration = Math.max(15, endMin - startMin);

    let remainingMins = endMin - nowMinutes;
    let progressPct = 0;

    if (nowMinutes < startMin) {
      const waitMins = startMin - nowMinutes;
      if (nowRemEl) nowRemEl.textContent = `Starts in ${waitMins}m`;
      progressPct = 5;
    } else if (remainingMins > 0) {
      if (nowRemEl) nowRemEl.textContent = `${remainingMins}m remaining`;
      progressPct = Math.min(95, Math.max(10, Math.round(((nowMinutes - startMin) / totalDuration) * 100)));
    } else {
      if (nowRemEl) nowRemEl.textContent = 'Time elapsed • Wrapping up';
      progressPct = 100;
    }

    if (nowProgressEl) nowProgressEl.style.width = `${progressPct}%`;

    // Spotify focus track attachment
    if (nowSpotifyEl) {
      if (activeBlock.spotifyFocus && activeBlock.spotifyFocus.title) {
        nowSpotifyEl.classList.remove('hidden');
        nowSpotifyEl.innerHTML = `
          <a href="https://open.spotify.com/search/${encodeURIComponent(activeBlock.spotifyFocus.title + ' ' + (activeBlock.spotifyFocus.artist || ''))}" target="_blank" style="display: flex; align-items: center; justify-content: space-between; background: rgba(29, 185, 84, 0.1); border: 1px solid rgba(29, 185, 84, 0.3); padding: 8px 14px; border-radius: 8px; text-decoration: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(29, 185, 84, 0.2)'" onmouseout="this.style.background='rgba(29, 185, 84, 0.1)'">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #1DB954; font-size: 1.1rem;">🎵</span>
              <div>
                <span style="font-weight: 600; font-size: 0.82rem; color: #f8fafc;">${activeBlock.spotifyFocus.title}</span>
                <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 4px;">• ${activeBlock.spotifyFocus.artist || 'Focus Soundtrack'}</span>
              </div>
            </div>
            <span style="font-size: 0.72rem; color: #4ade80; font-weight: 600; background: rgba(29, 185, 84, 0.2); padding: 2px 8px; border-radius: 10px;">
              ${activeBlock.spotifyFocus.vibe || 'Focus'}
            </span>
          </a>
        `;
      } else {
        nowSpotifyEl.classList.add('hidden');
        nowSpotifyEl.innerHTML = '';
      }
    }

    if (completeBtn) {
      completeBtn.onclick = () => this.completeCurrentBlock(activeBlock.id, activeBlock.taskId);
    }

    // 2. Populate NEXT panel
    const nextTimeEl = document.getElementById('hudNextTime');
    const nextTitleEl = document.getElementById('hudNextTitle');
    const nextCatEl = document.getElementById('hudNextCategory');

    if (nextBlock) {
      if (nextTimeEl) nextTimeEl.textContent = nextBlock.startTime;
      if (nextTitleEl) nextTitleEl.textContent = nextBlock.title;
      if (nextCatEl) nextCatEl.textContent = nextBlock.category || (nextBlock.isFixed ? 'Google Calendar Fixed Event' : 'Next Session');
    } else {
      if (nextTimeEl) nextTimeEl.textContent = 'Evening';
      if (nextTitleEl) nextTitleEl.textContent = 'Day Complete Ahead!';
      if (nextCatEl) nextCatEl.textContent = 'Personal & Wind Down';
    }

    if (window.lucide) window.lucide.createIcons();
  },

  /**
   * Marks a block complete, updates Supabase daily_plans and tasks table
   */
  async completeCurrentBlock(blockId = null, taskId = null) {
    if (!this.currentPlan) return;

    // Identify target block
    let target = null;
    if (blockId) {
      target = this.currentPlan.blocks.find(b => b.id === blockId);
    } else {
      target = this.currentPlan.blocks.find(b => b.status !== 'completed' && b.status !== 'skipped');
    }

    if (!target) return;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/planner/block-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          blockId: target.id,
          status: 'completed',
          taskId: taskId || target.taskId || null
        })
      });

      if (!res.ok) throw new Error("Failed to record completion");

      // Update local state
      target.status = 'completed';

      // Re-render UI
      this.renderTimeline(this.currentPlan.blocks);
      this.updateActiveHud();

      if (window.showToast) {
        window.showToast(`✓ Completed: ${target.title}`, 'success');
      }

      // Sync tasks view if active
      if (target.taskId && window.novaTasks?.fetchTasks) {
        window.novaTasks.fetchTasks();
      }
    } catch (e) {
      console.error("Error completing block:", e);
      if (window.showToast) window.showToast('Could not complete block: ' + e.message, 'error');
    }
  },

  /**
   * Skips a block and transitions immediately to the next block
   */
  async skipCurrentBlock(blockId = null) {
    if (!this.currentPlan) return;

    let target = null;
    if (blockId) {
      target = this.currentPlan.blocks.find(b => b.id === blockId);
    } else {
      target = this.currentPlan.blocks.find(b => b.status !== 'completed' && b.status !== 'skipped');
    }

    if (!target) return;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;

      await fetch('/api/planner/block-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ blockId: target.id, status: 'skipped' })
      });

      target.status = 'skipped';
      this.renderTimeline(this.currentPlan.blocks);
      this.updateActiveHud();

      if (window.showToast) {
        window.showToast(`Skipped: ${target.title}`, 'default');
      }
    } catch (e) {
      console.error("Error skipping block:", e);
    }
  },

  /**
   * Replans remaining hours of the day, preserving completed blocks and fixed events
   */
  async replanRemaining() {
    if (!this.currentPlan) return;

    const replanBtn = document.getElementById('btnReplanSecondary');
    const progressState = document.getElementById('plannerProgressState');
    const progressMsg = document.getElementById('plannerProgressMessage');

    if (replanBtn) replanBtn.disabled = true;
    if (progressState) progressState.classList.remove('hidden');
    if (progressMsg) progressMsg.textContent = "Recalibrating schedule around remaining hours...";

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) throw new Error("Please log in to replan.");

      const completedBlockIds = (this.currentPlan.blocks || [])
        .filter(b => b.status === 'completed')
        .map(b => b.id);

      const res = await fetch('/api/planner/replan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          completedBlockIds,
          currentTime: new Date().toLocaleTimeString()
        })
      });

      if (!res.ok) throw new Error("Replanning failed on server");

      const data = await res.json();
      if (data.plan && Array.isArray(data.plan.blocks)) {
        this.currentPlan = data.plan;
        this.renderTimeline(data.plan.blocks);
        this.updateActiveHud();

        if (window.showToast) {
          window.showToast('🔄 Plan recalibrated! Fixed events and completed tasks preserved.', 'success');
        }
      }
    } catch (err) {
      console.error("Replan error:", err);
      if (window.showToast) window.showToast('Could not replan: ' + err.message, 'error');
    } finally {
      if (replanBtn) replanBtn.disabled = false;
      if (progressState) progressState.classList.add('hidden');
    }
  },

  /**
   * Renders completion statistics when all scheduled blocks are finished
   */
  renderCompletionStats(blocks) {
    const statsEl = document.getElementById('plannerCompletionStats');
    if (!statsEl) return;

    const completed = blocks.filter(b => b.status === 'completed').length;
    const total = blocks.length;

    statsEl.innerHTML = `
      <div style="background: rgba(255,255,255,0.04); padding: 10px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
        <span style="color: var(--text-muted); font-size: 0.8rem; display: block;">Blocks Completed</span>
        <span style="color: #4ade80; font-weight: 700; font-size: 1.1rem;">${completed} / ${total}</span>
      </div>
      <div style="background: rgba(255,255,255,0.04); padding: 10px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
        <span style="color: var(--text-muted); font-size: 0.8rem; display: block;">Execution Rate</span>
        <span style="color: #60a5fa; font-weight: 700; font-size: 1.1rem;">${total > 0 ? Math.round((completed / total) * 100) : 0}%</span>
      </div>
    `;
  },

  /**
   * Renders the timeline cards for each block
   */
  renderTimeline(blocks = []) {
    const timelineEl = document.getElementById('plannerTimeline');
    if (!timelineEl) return;

    if (!blocks || blocks.length === 0) {
      this.renderEmptyState();
      return;
    }

    let html = '<div class="timeline-stream" style="display: flex; flex-direction: column; gap: 14px;">';

    blocks.forEach((block, idx) => {
      const isCompleted = block.status === 'completed';
      const isSkipped = block.status === 'skipped';
      const isCalendar = block.type === 'calendar' || block.isFixed;
      const isWorkout = block.type === 'workout';

      // Badge config
      let badgeLabel = 'Deep Focus';
      let badgeClass = 'badge-focus';
      let badgeStyle = 'background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);';

      if (isCalendar) {
        badgeLabel = 'Google Calendar';
        badgeStyle = 'background: rgba(66, 133, 244, 0.15); color: #60a5fa; border: 1px solid rgba(66, 133, 244, 0.3);';
      } else if (isWorkout) {
        badgeLabel = 'Workout';
        badgeStyle = 'background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3);';
      } else if (block.type === 'break') {
        badgeLabel = 'Break';
        badgeStyle = 'background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3);';
      }

      // Card styling
      let cardBorder = isCompleted
        ? 'border: 1px solid rgba(74, 222, 128, 0.3); background: rgba(74, 222, 128, 0.03); opacity: 0.75;'
        : 'border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.02);';

      let textDecor = isCompleted ? 'text-decoration: line-through; color: #94a3b8;' : 'color: #f8fafc;';

      html += `
        <div class="glass-panel" style="padding: 16px 20px; border-radius: 12px; transition: all 0.2s; ${cardBorder}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
            <div style="flex: 1; min-width: 240px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <span style="font-size: 0.85rem; font-weight: 700; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
                  ⏰ ${block.startTime} — ${block.endTime}
                </span>
                <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 6px; font-weight: 600; ${badgeStyle}">
                  ${badgeLabel}
                </span>
                ${block.duration ? `<span style="font-size: 0.75rem; color: #94a3b8;">(${block.duration})</span>` : ''}
              </div>

              <div style="font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; ${textDecor}">
                ${block.title}
              </div>

              ${block.notes ? `<div style="font-size: 0.82rem; color: #94a3b8; line-height: 1.4;">${block.notes}</div>` : ''}

              ${block.spotifyFocus && block.spotifyFocus.title ? `
                <a href="https://open.spotify.com/search/${encodeURIComponent(block.spotifyFocus.title + ' ' + (block.spotifyFocus.artist || ''))}" target="_blank" style="margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; background: rgba(29, 185, 84, 0.1); border: 1px solid rgba(29, 185, 84, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 0.76rem; text-decoration: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(29, 185, 84, 0.2)'" onmouseout="this.style.background='rgba(29, 185, 84, 0.1)'">
                  <span style="color: #1DB954;">🎵</span>
                  <span style="color: #f1f5f9; font-weight: 500;">${block.spotifyFocus.title}</span>
                  <span style="color: #64748b;">• ${block.spotifyFocus.artist || 'Focus Track'}</span>
                </a>
              ` : ''}
            </div>

            <!-- Action button for individual block -->
            <div style="display: flex; align-items: center; gap: 8px;">
              ${isCompleted ? `
                <span style="font-size: 0.8rem; font-weight: 600; color: #4ade80; display: flex; align-items: center; gap: 4px; background: rgba(74, 222, 128, 0.1); padding: 6px 12px; border-radius: 6px;">
                  ✓ Completed
                </span>
              ` : isCalendar ? `
                <span style="font-size: 0.75rem; color: #60a5fa; background: rgba(66, 133, 244, 0.1); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(66, 133, 244, 0.2);">
                  🔒 Fixed Time
                </span>
              ` : `
                <button class="btn btn-sm btn-outline" onclick="window.novaPlanner.completeCurrentBlock('${block.id}', ${block.taskId ? `'${block.taskId}'` : 'null'})" style="font-size: 0.78rem; padding: 6px 12px; border-radius: 6px; display: flex; align-items: center; gap: 4px; border-color: rgba(74, 222, 128, 0.4); color: #4ade80;">
                  <i data-lucide="check" style="width: 14px; height: 14px;"></i> Mark Done
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    timelineEl.innerHTML = html;

    const statusEl = document.getElementById('plannerTimelineStatus');
    if (statusEl) {
      const completedCount = blocks.filter(b => b.status === 'completed').length;
      statusEl.textContent = `${completedCount} of ${blocks.length} sessions completed`;
    }

    if (window.lucide) window.lucide.createIcons();
  }
};

// Auto-initialize when viewContainer switches to planner
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    for (let m of mutations) {
      if (m.target.id === 'viewContainer' && m.addedNodes.length > 0) {
        if (document.getElementById('plannerTimeline')) {
          window.novaPlanner.initPlanner();
        }
      }
    }
  });
  const vc = document.getElementById('viewContainer');
  if (vc) observer.observe(vc, { childList: true });
});
