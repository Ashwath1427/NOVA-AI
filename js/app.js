// app.js
window.novaCrud = {
  open(title, fields, onSubmit, onDelete = null) {
    const modal = document.getElementById('crudModal');
    const titleEl = document.getElementById('crudModalTitle');
    const fieldsContainer = document.getElementById('crudModalFields');
    const form = document.getElementById('crudModalForm');
    const closeBtn = document.getElementById('crudModalCloseBtn');
    const cancelBtn = document.getElementById('crudModalCancelBtn');
    const deleteBtn = document.getElementById('crudModalDeleteBtn');

    if (!modal) return;

    titleEl.textContent = title;
    fieldsContainer.innerHTML = fields.map(f => {
      let inputHtml = '';
      if (f.type === 'textarea') {
        inputHtml = `<textarea id="${f.id}" ${f.required ? 'required' : ''} style="background:rgba(0,0,0,0.2); border:1px solid var(--border-color); padding:8px 12px; border-radius:var(--radius-md); color:white; min-height:80px;"></textarea>`;
      } else if (f.type === 'select') {
        inputHtml = `<select id="${f.id}" ${f.required ? 'required' : ''} style="background:#1a1a1a; border:1px solid var(--border-color); padding:8px 12px; border-radius:var(--radius-md); color:white;">
          ${f.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
        </select>`;
      } else {
        inputHtml = `<input type="${f.type || 'text'}" id="${f.id}" ${f.required ? 'required' : ''} style="background:rgba(0,0,0,0.2); border:1px solid var(--border-color); padding:8px 12px; border-radius:var(--radius-md); color:white;">`;
      }
      return `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label for="${f.id}" style="font-size: 0.9rem; color: var(--text-secondary);">${f.label}</label>
        ${inputHtml}
      </div>
      `;
    }).join('');

    const closeModal = () => {
      modal.classList.add('hidden');
      form.onsubmit = null;
      if (deleteBtn) deleteBtn.onclick = null;
    };

    if (deleteBtn) {
      if (onDelete) {
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = async (e) => {
          e.preventDefault();
          if (confirm('Are you sure you want to delete this? This action cannot be undone.')) {
            await onDelete();
            closeModal();
          }
        };
      } else {
        deleteBtn.style.display = 'none';
        deleteBtn.onclick = null;
      }
    }

    closeBtn.onclick = (e) => { e.preventDefault(); closeModal(); };
    cancelBtn.onclick = (e) => { e.preventDefault(); closeModal(); };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const values = {};
      fields.forEach(f => {
        values[f.id] = document.getElementById(f.id).value;
      });
      await onSubmit(values);
      closeModal();
    };

    modal.classList.remove('hidden');
  }
};

window.showToast = (message, type = 'default', actionCallback = null, actionText = 'Retry') => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bg = type === 'error' ? 'rgba(255, 50, 50, 0.9)' : type === 'success' ? 'rgba(50, 255, 50, 0.9)' : 'rgba(30, 30, 30, 0.9)';
  toast.style = `background: ${bg}; color: white; padding: 12px 20px; border-radius: 8px; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; display: flex; align-items: center; justify-content: space-between; gap: 12px;`;
  
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  let hideTimeout;

  if (actionCallback) {
    const actionBtn = document.createElement('button');
    actionBtn.textContent = actionText;
    actionBtn.style = 'background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 600;';
    actionBtn.onclick = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
      actionCallback();
    };
    toast.appendChild(actionBtn);
  }
  
  container.appendChild(toast);
  
  // Fade in
  requestAnimationFrame(() => toast.style.opacity = '1');
  
  // Fade out and remove (only if no action, or after longer delay if there is an action)
  hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, actionCallback ? 8000 : 3000);
};

document.addEventListener('DOMContentLoaded', async () => {
  // Command Palette Logic
  const cmdPalette = document.getElementById('commandPalette');
  const cmdInput = document.getElementById('cmdInput');
  const aiCommandInput = document.getElementById('aiCommandInput');

  // Open Command Palette with Cmd/Ctrl + K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
    }
    
    // Close with Escape
    if (e.key === 'Escape' && cmdPalette && !cmdPalette.classList.contains('hidden')) {
      toggleCommandPalette(false);
    }
  });

  // Open Command Palette from topbar click
  if (aiCommandInput) {
    const wrapper = aiCommandInput.closest('.command-input-wrapper');
    if (wrapper) {
      wrapper.addEventListener('click', () => {
        toggleCommandPalette(true);
      });
    }
    // Also allow keyboard users to open it
    aiCommandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCommandPalette(true);
      }
    });
    // Remove the focus stealer so that tab navigation doesn't instantly trap the user
  }

  // Sidebar Toggle (Hamburger menu button with morphing animation)
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  if (sidebarToggleBtn) {
    const updateToggleIconState = () => {
      const appLayout = document.querySelector('.app-layout');
      const sidebar = document.querySelector('.sidebar');
      let isOpen = false;
      if (window.innerWidth <= 768) {
        isOpen = sidebar?.classList.contains('open') || false;
      } else {
        isOpen = !appLayout?.classList.contains('sidebar-collapsed');
      }
      // When sidebar is OPEN: aria-expanded="true" (shows "X" to close)
      // When sidebar is CLOSED: aria-expanded="false" (shows "☰" three lines to open)
      sidebarToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      sidebarToggleBtn.setAttribute('title', isOpen ? 'Close sidebar' : 'Open sidebar');
      sidebarToggleBtn.setAttribute('aria-label', isOpen ? 'Close sidebar' : 'Open sidebar');
    };

    // Initialize correct state on page load
    updateToggleIconState();

    sidebarToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const appLayout = document.querySelector('.app-layout');
      const sidebar = document.querySelector('.sidebar');
      if (window.innerWidth <= 768) {
        sidebar?.classList.toggle('open');
      } else {
        appLayout?.classList.toggle('sidebar-collapsed');
      }
      updateToggleIconState();
    });

    window.addEventListener('resize', updateToggleIconState);
  }

  // Close mobile sidebar on nav click
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        document.querySelector('.sidebar')?.classList.remove('open');
        sidebarToggleBtn?.setAttribute('aria-expanded', 'false');
        sidebarToggleBtn?.setAttribute('title', 'Open sidebar');
      }
    });
  });

  function toggleCommandPalette(forceState) {
    if (!cmdPalette) return;
    
    const isHidden = cmdPalette.classList.contains('hidden');
    const targetState = forceState !== undefined ? forceState : isHidden;
    
    if (targetState) {
      cmdPalette.classList.remove('hidden');
      setTimeout(() => cmdInput.focus(), 100);
    } else {
      cmdPalette.classList.add('hidden');
      cmdInput.value = '';
    }
  }

  // Close palette on backdrop click
  if (cmdPalette) {
    cmdPalette.addEventListener('click', (e) => {
      if (e.target === cmdPalette) {
        toggleCommandPalette(false);
      }
    });
  }

  // Notification Button
  const notificationBtn = document.getElementById('topbarNotificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', () => {
      if (window.showToast) {
        window.showToast('No new notifications at this time.', 'default');
      }
    });
  }

  // Logout Logic
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        window.isIntentionalLogout = true;
        await window.supabaseClient.auth.signOut();
        window.location.href = window.novaPath('login.html?logout=true');
      } catch (err) {
        console.error("Error logging out", err);
      }
    });
  }

  // Session Check (if on app.html)
  if (window.location.pathname.includes('app.html')) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session && supabaseUrl !== 'YOUR_SUPABASE_URL_HERE') { // Redirect only if real supabase is connected
      window.location.href = window.novaPath('login.html');
    } else if (session) {
      const user = session.user;
      
      // Fetch user profile
      const { data: profile, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      const displayName = profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0];
      document.getElementById('userName').textContent = displayName;
      document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();

      // Onboarding Check
      if (profile && !profile.primary_goal) {
        const obModal = document.getElementById('onboardingModal');
        if (obModal) {
          obModal.classList.remove('hidden');
          
          document.getElementById('obSkipBtn').addEventListener('click', () => {
            obModal.classList.add('hidden');
            window.novaOverview?.loadOverview();
          });
          
          document.getElementById('obSaveBtn').addEventListener('click', async () => {
            const name = document.getElementById('obName')?.value?.trim();
            const goal = document.getElementById('obGoal')?.value || 'Work';
            const time = document.getElementById('obTime')?.value || 'Flexible';
            const saveBtn = document.getElementById('obSaveBtn');

            if (saveBtn) {
              saveBtn.disabled = true;
              saveBtn.textContent = 'Setting up...';
            }
            
            try {
              const { error: updateError } = await window.supabaseClient
                .from('profiles')
                .update({
                  full_name: name || displayName,
                  primary_goal: goal,
                  typical_available_time: time
                })
                .eq('id', user.id);
                
              if (updateError) throw updateError;
              
              document.getElementById('userName').textContent = name || displayName;
              document.getElementById('userAvatar').textContent = (name || displayName).charAt(0).toUpperCase();
              obModal.classList.add('hidden');
              
              if (window.showToast) window.showToast(`Welcome to NOVA, ${name || displayName}! Your command center is ready.`, 'success');
              window.novaOverview?.loadOverview();
              
            } catch (err) {
              console.error("Error saving onboarding data:", err);
              if (window.showToast) window.showToast('Error saving profile.', 'error');
            } finally {
              if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Get Started';
              }
            }
          });
        }
      } else {
        // Init overview if already onboarded
        window.novaOverview?.loadOverview();
      }

      // Gemini BYOK Modal Controller
      let pendingAiRetryCallback = null;

      window.openGeminiSetupModal = (retryCallback = null) => {
        pendingAiRetryCallback = retryCallback;
        const modal = document.getElementById('geminiKeyModal');
        if (modal) {
          modal.classList.remove('hidden');
          const input = document.getElementById('geminiModalKeyInput');
          if (input) setTimeout(() => input.focus(), 100);
          if (window.lucide) window.lucide.createIcons();
        }
      };

      const closeGeminiModal = () => {
        const modal = document.getElementById('geminiKeyModal');
        if (modal) modal.classList.add('hidden');
      };

      document.getElementById('closeGeminiModalBtn')?.addEventListener('click', closeGeminiModal);

      document.getElementById('toggleGeminiModalKeyVisibility')?.addEventListener('click', () => {
        const input = document.getElementById('geminiModalKeyInput');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });

      document.getElementById('saveGeminiModalKeyBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('geminiModalKeyInput');
        const saveBtn = document.getElementById('saveGeminiModalKeyBtn');
        const key = (input?.value || '').trim();

        if (!key) {
          if (window.showToast) window.showToast('Please enter your Google Gemini API key.', 'error');
          return;
        }

        if (key.length < 15) {
          if (window.showToast) window.showToast('Please check your Google AI Studio key. It appears too short.', 'error');
          return;
        }

        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
        }

        try {
          const { data: { session: currentSession } } = await window.supabaseClient.auth.getSession();
          const token = currentSession?.access_token;
          if (!token) throw new Error("Authentication required");

          const res = await fetch('/api/integrations/set-credentials', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ provider: 'gemini', apiKey: key })
          });

          if (!res.ok) throw new Error("Failed to save key to server");

          closeGeminiModal();
          if (window.showToast) window.showToast('Gemini API key connected! Full AI unlocked.', 'success');

          if (typeof pendingAiRetryCallback === 'function') {
            const cb = pendingAiRetryCallback;
            pendingAiRetryCallback = null;
            cb();
          }
        } catch (err) {
          console.error("Error saving Gemini key:", err);
          if (window.showToast) window.showToast(err.message || 'Error saving key', 'error');
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Continue';
          }
        }
      });
    }
  }
});

// Overview module - 100% Real Dynamic Data (Zero Made-Up Data)
// ============================================================
// NOVA 2.0 — SECOND-GENERATION UX & INTELLIGENCE CONTROLLER
// ============================================================

// 1. Interface Mode Controller: Simple vs Power Mode (Phase 12)
window.initNovaInterfaceMode = function() {
  const saved = localStorage.getItem('nova_interface_mode') || 'simple';
  applyNovaInterfaceMode(saved);
};

window.toggleNovaInterfaceMode = function() {
  const current = localStorage.getItem('nova_interface_mode') || 'simple';
  const next = current === 'simple' ? 'power' : 'simple';
  localStorage.setItem('nova_interface_mode', next);
  applyNovaInterfaceMode(next);
  if (window.showToast) {
    window.showToast(`Switched to ${next === 'simple' ? '⚡ Simple Mode' : '🚀 Power Mode'}`, 'default');
  }
};

function applyNovaInterfaceMode(mode) {
  document.body.classList.remove('mode-simple', 'mode-power');
  document.body.classList.add(`mode-${mode}`);

  const label = document.getElementById('sidebarModeLabel');
  if (label) {
    label.textContent = mode === 'simple' ? 'Simple' : 'Power';
  }
};

// Initialize mode immediately and on DOM load
window.initNovaInterfaceMode();
document.addEventListener('DOMContentLoaded', () => {
  window.initNovaInterfaceMode();
});

// 2. The New "Today" Home Experience (Phase 1 & 11)
window.novaOverview = {
  currentFocusTask: null,
  currentFocusReason: '',

  async loadOverview() {
    if (!window.supabaseClient) return;

    // A. Dynamic Greeting with Real User Profile Name
    const greeting = document.getElementById('greeting');
    let userName = 'Ashwath';
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.user) {
        const { data: profile } = await window.supabaseClient
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();
        if (profile?.full_name) userName = profile.full_name;
        else if (session.user.user_metadata?.full_name) userName = session.user.user_metadata.full_name;
        else if (session.user.email) userName = session.user.email.split('@')[0];
      }
    } catch (e) {}

    if (greeting) {
      const hour = new Date().getHours();
      let timeText = "Good evening";
      if (hour < 12) timeText = "Good morning";
      else if (hour < 18) timeText = "Good afternoon";
      greeting.innerHTML = `${timeText}, ${userName} 👋`;
    }

    // B. Fetch Real Tasks
    let tasks = [];
    try {
      const { data, error } = await window.supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) tasks = data;
    } catch (e) {
      console.warn("Could not query tasks:", e);
    }

    const activeTasks = tasks.filter(t => t.status !== 'Completed');

    // C. Fetch Real Calendar Events (Google Calendar + Local DB)
    let todayEvents = [];
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const startOfDay = todayStr + 'T00:00:00.000Z';
      const endOfDay = todayStr + 'T23:59:59.999Z';

      const { data: dbEvents } = await window.supabaseClient
        .from('calendar_events')
        .select('*')
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .order('start_time', { ascending: true });

      let gcalEvents = [];
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
          const res = await fetch('/api/integrations/google-calendar/events', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (res.ok) {
            const json = await res.json();
            if (json.events && json.events.length > 0) {
              gcalEvents = json.events.filter(ev => ev.startTime && ev.startTime.startsWith(todayStr)).map(ev => ({
                id: ev.id,
                title: ev.title,
                start_time: ev.startTime,
                source: 'Google Calendar'
              }));
            }
          }
        }
      } catch (ge) {}

      todayEvents = [...(dbEvents || []), ...gcalEvents].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    } catch (e) {
      console.warn("Could not query calendar events:", e);
    }

    // D. Fetch Real Projects
    let projects = [];
    try {
      const { data, error } = await window.supabaseClient
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) projects = data;
    } catch (e) {}

    // E. Evaluate and Render YOUR FOCUS (Phase 1 & 11)
    this.renderHeroFocus(activeTasks, todayEvents, projects);

    // F. Render Next in Queue
    this.renderNextQueue(activeTasks);

    // G. Render Upcoming Calendar Commitments
    this.renderUpcomingEvents(todayEvents);

    // H. Render Active Projects (Power Mode)
    this.renderProjectsSnapshot(projects, tasks);

    if (window.lucide) window.lucide.createIcons();
  },

  renderHeroFocus(activeTasks, todayEvents, projects) {
    const container = document.getElementById('heroFocusContent');
    if (!container) return;

    if (activeTasks.length === 0) {
      this.currentFocusTask = null;
      container.innerHTML = `
        <div style="padding: 16px 0; text-align: left;">
          <div style="font-size: 1.5rem; margin-bottom: 6px;">🎉</div>
          <div style="font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 4px;">All caught up for today!</div>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 16px;">
            You have zero pending tasks. Take a well-deserved break or plan ahead.
          </p>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.novaTasks?.openCreateModal()">
              + New Task
            </button>
            <button class="btn btn-outline" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.openBrainDumpModal()">
              🧠 Brain Dump
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Smart priority sorting: Overdue/Due Today > Priority > Earliest
    const todayStr = new Date().toISOString().split('T')[0];
    const sorted = [...activeTasks].sort((a, b) => {
      const aDue = a.due_date === todayStr ? 2 : (a.due_date && a.due_date < todayStr ? 3 : 0);
      const bDue = b.due_date === todayStr ? 2 : (b.due_date && b.due_date < todayStr ? 3 : 0);
      if (aDue !== bDue) return bDue - aDue;

      const pWeight = { 'high': 3, 'medium': 2, 'low': 1 };
      const aP = pWeight[(a.priority || 'medium').toLowerCase()] || 2;
      const bP = pWeight[(b.priority || 'medium').toLowerCase()] || 2;
      if (aP !== bP) return bP - aP;

      return new Date(a.created_at) - new Date(b.created_at);
    });

    const focus = sorted[0];
    this.currentFocusTask = focus;

    // Determine estimated duration
    let estMin = 45;
    if (focus.estimated_minutes) estMin = focus.estimated_minutes;
    else if (focus.title) {
      const match = focus.title.match(/(\d+)\s*(?:min|m\b)/i);
      if (match) estMin = match[1];
    }

    // Determine why this was picked (Phase 11)
    let whyReason = '';
    const isDueToday = focus.due_date === todayStr;
    const isOverdue = focus.due_date && focus.due_date < todayStr;
    const isHigh = (focus.priority || '').toLowerCase() === 'high';

    if (isOverdue) whyReason = `This task is overdue and needs immediate resolution (~${estMin} min).`;
    else if (isDueToday && isHigh) whyReason = `Due today with High Priority. Finishing this first eliminates your biggest pressure point.`;
    else if (isDueToday) whyReason = `Scheduled for today (~${estMin} min). Recommended to tackle now before upcoming commitments.`;
    else if (isHigh) whyReason = `Marked High Priority across your backlog (~${estMin} min).`;
    else whyReason = `Highest leverage action in your queue (~${estMin} min) to maintain momentum.`;

    if (todayEvents.length > 0) {
      const nextEv = todayEvents[0];
      const evTime = nextEv.start_time.includes('T') ? new Date(nextEv.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      whyReason += ` You have an open window before your next event${evTime ? ` at ${evTime}` : ''}.`;
    }
    this.currentFocusReason = whyReason;

    const pClass = (focus.priority || 'medium').toLowerCase();
    const pTag = isOverdue ? '⚠️ Overdue' : (isDueToday ? '🔴 Due Today' : `${focus.priority || 'Medium'} Priority`);

    container.innerHTML = `
      <div class="focus-card-title">${focus.title}</div>
      <div class="focus-card-meta">
        <span class="priority-pill ${pClass}">${pTag}</span>
        <span class="text-secondary" style="font-size:0.85rem;"><i data-lucide="clock" style="width:13px; height:13px; display:inline; vertical-align:-2px; margin-right:4px;"></i> ~${estMin} min estimated</span>
        ${focus.due_date ? `<span class="text-muted" style="font-size:0.85rem;">📅 Due: ${focus.due_date}</span>` : ''}
      </div>
      <div class="focus-card-actions">
        <button class="btn-start-focus" onclick="window.startHeroFocus()">
          <i data-lucide="play" style="width:16px; height:16px;"></i>
          <span>Start Focus Mode</span>
        </button>
        <button class="btn-why-focus" onclick="window.toggleFocusWhy()">
          <i data-lucide="help-circle" style="width:15px; height:15px;"></i>
          <span>Why this?</span>
        </button>
        <button class="btn btn-outline" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 12px;" onclick="window.novaOverview.toggleTask('${focus.id}', '${focus.status}')" title="Mark Complete">
          <i data-lucide="check" style="width:15px; height:15px;"></i>
        </button>
      </div>
      <div id="whyExplanationPanel" class="why-explanation-panel hidden">
        <i data-lucide="sparkles" style="width:18px; height:18px; color:#a855f7; flex-shrink:0; margin-top:2px;"></i>
        <div>
          <strong>Why NOVA picked this:</strong> ${whyReason}
        </div>
      </div>
    `;
  },

  renderNextQueue(activeTasks) {
    const list = document.getElementById('todayNextQueueList');
    if (!list) return;

    // Skip the focus task
    const remaining = this.currentFocusTask ? activeTasks.filter(t => t.id !== this.currentFocusTask.id) : activeTasks;

    if (remaining.length === 0) {
      list.innerHTML = `
        <div style="padding: 12px 0; color: var(--text-muted); font-size: 0.85rem;">
          No other queued tasks. When you finish your focus, you're all set!
        </div>
      `;
      return;
    }

    const nextUp = remaining.slice(0, 3);
    list.innerHTML = nextUp.map(t => {
      const pClass = (t.priority || 'medium').toLowerCase();
      let timeText = 'Today';
      if (t.due_date) {
        const today = new Date().toISOString().split('T')[0];
        timeText = t.due_date === today ? 'Today' : t.due_date;
      }
      return `
        <div class="next-task-row">
          <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
            <div class="task-checkbox-custom" title="Mark complete" onclick="window.novaOverview.toggleTask('${t.id}', '${t.status}', event)"></div>
            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              <div style="font-weight:600; font-size:0.9rem; color:#fff;">${t.title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${timeText}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="priority-pill ${pClass}" style="font-size:0.72rem; padding:2px 8px;">${t.priority || 'Med'}</span>
            <button class="btn btn-outline" style="padding:4px 8px; font-size:0.75rem; border-radius:6px;" onclick="window.novaFocus?.startSession(${JSON.stringify(t).replace(/"/g, '&quot;')})" title="Focus on this task">
              ▶
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  renderUpcomingEvents(todayEvents) {
    const list = document.getElementById('todayUpcomingEventsList');
    if (!list) return;

    if (todayEvents.length === 0) {
      list.innerHTML = `
        <div style="padding: 14px 0; color: var(--text-secondary); font-size: 0.85rem;">
          📅 <strong>Clear schedule today!</strong> No calendar meetings or events scheduled.
        </div>
      `;
      return;
    }

    list.innerHTML = todayEvents.map(ev => {
      let timeStr = ev.start_time;
      if (timeStr && timeStr.includes('T')) {
        timeStr = new Date(ev.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
      const titleClean = (ev.title || '').replace('📅 ', '').replace('Google Calendar: ', '');
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:rgba(168,85,247,0.15); color:#c084fc; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">${timeStr}</span>
            <span style="font-size:0.88rem; color:#f1f5f9; font-weight:500;">${titleClean}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderProjectsSnapshot(projects, tasks) {
    const list = document.getElementById('todayProjectsSnapshotList');
    if (!list) return;

    if (projects.length === 0) {
      list.innerHTML = `
        <div style="padding: 10px 0; color: var(--text-muted); font-size: 0.85rem;">
          No active projects.
        </div>
      `;
      return;
    }

    list.innerHTML = projects.slice(0, 3).map(p => {
      const projTasks = tasks.filter(t => t.project_id === p.id);
      let pct = p.progress_percentage || 0;
      if (projTasks.length > 0) {
        const completed = projTasks.filter(t => t.status === 'Completed').length;
        pct = Math.round((completed / projTasks.length) * 100);
      }
      return `
        <div style="margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; font-size:0.84rem; margin-bottom:4px;">
            <span style="color:#fff; font-weight:600;">${p.name}</span>
            <span style="color:var(--text-muted); font-size:0.78rem;">${pct}%</span>
          </div>
          <div class="progress-bar-bg" style="height:6px;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
        </div>
      `;
    }).join('');
  },

  async toggleTask(taskId, currentStatus, e) {
    if (e) e.stopPropagation();
    if (!window.supabaseClient) return;

    const nextStatus = currentStatus === 'Completed' ? 'Todo' : 'Completed';
    try {
      const { error } = await window.supabaseClient
        .from('tasks')
        .update({
          status: nextStatus,
          completed_at: nextStatus === 'Completed' ? new Date().toISOString() : null
        })
        .eq('id', taskId);

      if (error) throw error;
      if (window.showToast) {
        window.showToast(nextStatus === 'Completed' ? 'Task marked completed! 🎉' : 'Task marked as Todo', 'success');
      }

      await this.loadOverview();
      if (window.novaTasks?.loadTasks) window.novaTasks.loadTasks();
    } catch (err) {
      if (window.showToast) window.showToast('Failed to update task: ' + err.message, 'error');
    }
  }
};

// 3. Actions for Hero Focus Card
window.startHeroFocus = function() {
  const focusTask = window.novaOverview.currentFocusTask;
  if (focusTask && window.novaFocus) {
    window.novaFocus.startSession(focusTask);
  } else if (window.showToast) {
    window.showToast('No active task to focus on. Create one first!', 'default');
  }
};

window.toggleFocusWhy = function() {
  const panel = document.getElementById('whyExplanationPanel');
  if (panel) {
    panel.classList.toggle('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
};

// 4. "What Should I Do Now?" Decision Engine (Phase 4)
window.triggerWhatShouldIDoNow = async function() {
  const box = document.getElementById('whatShouldIDoNowBox');
  if (!box) return;

  const focusTask = window.novaOverview.currentFocusTask;
  if (!focusTask) {
    box.classList.remove('hidden');
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; color:#38bdf8; font-size:1rem; margin-bottom:4px;">✨ All Caught Up!</div>
          <p style="margin:0; font-size:0.88rem; color:#cbd5e1;">You have no unfinished tasks right now. Great time for a break or a new project idea.</p>
        </div>
        <button class="btn btn-outline" onclick="document.getElementById('whatShouldIDoNowBox').classList.add('hidden')">Dismiss</button>
      </div>
    `;
    return;
  }

  let estMin = 45;
  if (focusTask.estimated_minutes) estMin = focusTask.estimated_minutes;
  else if (focusTask.title) {
    const m = focusTask.title.match(/(\d+)\s*(?:min|m\b)/i);
    if (m) estMin = m[1];
  }

  box.classList.remove('hidden');
  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
      <div>
        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:#38bdf8; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">
          <i data-lucide="compass" style="width:16px; height:16px;"></i>
          RECOMMENDED ACTION RIGHT NOW
        </div>
        <div style="font-size:1.2rem; font-weight:700; color:#fff; margin-bottom:4px;">${focusTask.title}</div>
        <p style="margin:0 0 14px 0; font-size:0.88rem; color:#cbd5e1; line-height:1.4;">
          ${window.novaOverview.currentFocusReason || `Estimated ~${estMin} min. This is your highest-leverage task to move forward today.`}
        </p>
        <div style="display:flex; gap:10px;">
          <button class="btn-start-focus" onclick="window.startHeroFocus()">
            <i data-lucide="play" style="width:15px; height:15px;"></i>
            <span>Do it Now</span>
          </button>
          <button class="btn btn-outline" onclick="document.getElementById('whatShouldIDoNowBox').classList.add('hidden')">
            Choose something else
          </button>
        </div>
      </div>
      <button class="btn" style="background:transparent; padding:4px;" onclick="document.getElementById('whatShouldIDoNowBox').classList.add('hidden')">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
};

// 5. "I'm Overwhelmed" Relief Mode (Phase 5)
window.triggerOverwhelmedMode = async function() {
  const modal = document.getElementById('overwhelmedModal');
  const content = document.getElementById('overwhelmedContent');
  if (!modal || !content) return;

  // Query active tasks
  let activeTasks = [];
  try {
    const { data } = await window.supabaseClient
      .from('tasks')
      .select('*')
      .neq('status', 'Completed')
      .order('created_at', { ascending: false });
    if (data) activeTasks = data;
  } catch (e) {}

  const totalCount = activeTasks.length;
  if (totalCount === 0) {
    if (window.showToast) window.showToast("You don't have any pending tasks right now! 🎉", 'default');
    return;
  }

  // Select top 3 critical tasks only
  const todayStr = new Date().toISOString().split('T')[0];
  const topThree = [...activeTasks].sort((a, b) => {
    const aDue = a.due_date === todayStr ? 2 : (a.due_date && a.due_date < todayStr ? 3 : 0);
    const bDue = b.due_date === todayStr ? 2 : (b.due_date && b.due_date < todayStr ? 3 : 0);
    if (aDue !== bDue) return bDue - aDue;
    const pWeight = { 'high': 3, 'medium': 2, 'low': 1 };
    return (pWeight[(b.priority || 'medium').toLowerCase()] || 2) - (pWeight[(a.priority || 'medium').toLowerCase()] || 2);
  }).slice(0, 3);

  content.innerHTML = `
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px; margin-bottom:18px;">
      <p style="font-size:0.95rem; color:#f1f5f9; margin-bottom:12px; line-height:1.5;">
        You currently have <strong>${totalCount} unfinished items</strong>. You do <em>not</em> need to solve everything right now.
      </p>
      <div style="font-size:0.84rem; color:#38bdf8; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px;">
        Only focus on these ${topThree.length}:
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${topThree.map((t, idx) => `
          <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.3); padding:12px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.07);">
            <div>
              <div style="font-weight:600; font-size:0.95rem; color:#fff;">${idx + 1}. ${t.title}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${t.due_date ? `Due: ${t.due_date}` : (t.priority || 'Medium priority')}</div>
            </div>
            <button class="btn btn-primary" style="padding:6px 14px; font-size:0.8rem;" onclick="window.closeOverwhelmedModal(); window.novaFocus?.startSession(${JSON.stringify(t).replace(/"/g, '&quot;')})">
              ▶ Start
            </button>
          </div>
        `).join('')}
      </div>
    </div>
    <div style="text-align:center; color:#94a3b8; font-size:0.85rem;">
      🌿 <em>Everything else can safely wait until tomorrow.</em>
    </div>
  `;

  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
};

window.closeOverwhelmedModal = function() {
  const modal = document.getElementById('overwhelmedModal');
  if (modal) modal.classList.add('hidden');
};

// 6. Universal "Tell NOVA" Intent Router (Phase 2)
window.handleTellNovaSubmit = function(text) {
  if (!text || !text.trim()) return;
  const q = text.trim().toLowerCase();
  const raw = text.trim();

  // Route to instant engines if intent matches
  if (q.includes('what should i do') || q.includes('what to do') || q.includes('recommend')) {
    window.triggerWhatShouldIDoNow();
    return;
  }
  if (q.includes('overwhelmed') || q.includes('too much') || q.includes('stressed') || q.includes('panic')) {
    window.triggerOverwhelmedMode();
    return;
  }
  if (q.includes('brain dump') || q.includes('dump')) {
    window.openBrainDumpModal();
    return;
  }
  if (q.includes('plan my day') || q.includes('plan today')) {
    window.location.hash = '#planner';
    document.querySelector('[data-route=planner]')?.click();
    return;
  }

  // Otherwise, send to AI Assistant overlay
  if (window.novaAI?.openAndSend) {
    window.novaAI.openAndSend(raw);
  }
};

// 7. Brain Dump Mode (Phase 3)
window.brainDumpParsedItems = [];

window.openBrainDumpModal = function() {
  const modal = document.getElementById('brainDumpModal');
  const inputView = document.getElementById('brainDumpInputView');
  const reviewView = document.getElementById('brainDumpReviewView');
  const textarea = document.getElementById('brainDumpTextarea');

  if (inputView) inputView.classList.remove('hidden');
  if (reviewView) reviewView.classList.add('hidden');
  if (textarea) textarea.value = '';
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => textarea?.focus(), 100);
  }
};

window.closeBrainDumpModal = function() {
  const modal = document.getElementById('brainDumpModal');
  if (modal) modal.classList.add('hidden');
};

window.resetBrainDumpToInput = function() {
  const inputView = document.getElementById('brainDumpInputView');
  const reviewView = document.getElementById('brainDumpReviewView');
  if (inputView) inputView.classList.remove('hidden');
  if (reviewView) reviewView.classList.add('hidden');
};

window.analyzeBrainDump = function() {
  const textarea = document.getElementById('brainDumpTextarea');
  const rawText = textarea ? textarea.value.trim() : '';

  if (!rawText) {
    if (window.showToast) window.showToast('Please enter your thoughts or tasks first.', 'default');
    return;
  }

  // Split lines or separated commas
  const lines = rawText.split(/\n|,|;/).map(l => l.trim()).filter(l => l.length > 2);
  if (lines.length === 0) {
    if (window.showToast) window.showToast('No actionable items detected.', 'default');
    return;
  }

  // Classify each line
  window.brainDumpParsedItems = lines.map((item, idx) => {
    const lower = item.toLowerCase();
    let type = 'task';
    let clean = item;
    let due = null;

    if (lower.startsWith('note:') || lower.includes('remember that') || lower.includes('idea:')) {
      type = 'note';
      clean = clean.replace(/^(note:|idea:)/i, '').trim();
    } else if (lower.includes('remind me') || lower.includes('call ') || lower.includes('at 7') || lower.includes('at 8') || lower.includes('tomorrow')) {
      type = 'reminder';
      if (lower.includes('tomorrow')) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        due = d.toISOString().split('T')[0];
      }
    } else {
      type = 'task';
      if (lower.includes('tomorrow')) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        due = d.toISOString().split('T')[0];
      }
    }

    return {
      id: idx,
      title: clean,
      type: type,
      due_date: due,
      selected: true
    };
  });

  // Render Review Screen (Never silently mutates data without approval)
  const countEl = document.getElementById('brainDumpFoundCount');
  const listEl = document.getElementById('brainDumpResultsList');
  if (countEl) countEl.textContent = `I found ${window.brainDumpParsedItems.length} items:`;

  if (listEl) {
    listEl.innerHTML = window.brainDumpParsedItems.map((item, idx) => `
      <div class="dump-review-item">
        <input type="checkbox" id="dumpItemCheck_${idx}" ${item.selected ? 'checked' : ''} onchange="window.brainDumpParsedItems[${idx}].selected = this.checked">
        <span class="dump-review-tag ${item.type}">${item.type}</span>
        <span style="flex:1; color:#fff;">${item.title}</span>
        ${item.due_date ? `<span style="font-size:0.75rem; color:var(--text-muted);">📅 Tomorrow</span>` : ''}
      </div>
    `).join('');
  }

  document.getElementById('brainDumpInputView')?.classList.add('hidden');
  document.getElementById('brainDumpReviewView')?.classList.remove('hidden');
};

window.commitBrainDumpItems = async function() {
  const approved = window.brainDumpParsedItems.filter(i => i.selected);
  if (approved.length === 0) {
    if (window.showToast) window.showToast('No items selected to create.', 'default');
    return;
  }

  const btn = document.getElementById('btnConfirmBrainDump');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const userId = session?.user?.id;

    for (const item of approved) {
      if (item.type === 'note') {
        await window.supabaseClient.from('notes').insert([{
          user_id: userId,
          title: item.title.slice(0, 30),
          content: item.title,
          created_at: new Date().toISOString()
        }]);
      } else {
        await window.supabaseClient.from('tasks').insert([{
          user_id: userId,
          title: item.title,
          status: 'Todo',
          priority: item.type === 'reminder' ? 'High' : 'Medium',
          due_date: item.due_date,
          created_at: new Date().toISOString()
        }]);
      }
    }

    if (window.showToast) {
      window.showToast(`✨ Created ${approved.length} items from Brain Dump!`, 'success');
    }

    window.closeBrainDumpModal();
    if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
    if (window.novaTasks?.loadTasks) window.novaTasks.loadTasks();

  } catch (err) {
    console.error('Brain dump commit error:', err);
    if (window.showToast) window.showToast('Failed to save items: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create All Approved';
    }
  }
};


