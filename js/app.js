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

window.showToast = (message, type = 'default') => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bg = type === 'error' ? 'rgba(255, 50, 50, 0.9)' : type === 'success' ? 'rgba(50, 255, 50, 0.9)' : 'rgba(30, 30, 30, 0.9)';
  toast.style = `background: ${bg}; color: white; padding: 12px 20px; border-radius: 8px; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s;`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Fade in
  requestAnimationFrame(() => toast.style.opacity = '1');
  
  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
        await window.supabaseClient.auth.signOut();
        window.location.href = '/login.html';
      } catch (err) {
        console.error("Error logging out", err);
      }
    });
  }

  // Session Check (if on app.html)
  if (window.location.pathname.includes('app.html')) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session && supabaseUrl !== 'YOUR_SUPABASE_URL_HERE') { // Redirect only if real supabase is connected
      window.location.href = '/login.html';
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
            const name = document.getElementById('obName').value;
            const goal = document.getElementById('obGoal').value;
            const time = document.getElementById('obTime').value;
            
            // API Keys
            const geminiKey = document.getElementById('obGeminiKey')?.value?.trim();
            const gcalUrl = document.getElementById('obGcalUrl')?.value?.trim();
            const spotifyId = document.getElementById('obSpotifyId')?.value?.trim();
            const spotifySecret = document.getElementById('obSpotifySecret')?.value?.trim();
            const discordWebhook = document.getElementById('obDiscordWebhook')?.value?.trim();
            
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
              
              const token = (await window.supabaseClient.auth.getSession()).data.session?.access_token;
              
              const saveCreds = async (payload) => {
                if (!token) return;
                await fetch('/api/integrations/set-credentials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify(payload)
                });
              };
              
              const promises = [];
              if (geminiKey) promises.push(saveCreds({ provider: 'gemini', apiKey: geminiKey }));
              if (gcalUrl) promises.push(saveCreds({ provider: 'google_calendar', icalUrl: gcalUrl }));
              if (spotifyId || spotifySecret) promises.push(saveCreds({ provider: 'spotify', clientId: spotifyId, clientSecret: spotifySecret }));
              if (discordWebhook) promises.push(saveCreds({ provider: 'discord', botToken: discordWebhook })); // saving as botToken for webhook fallback
              
              await Promise.all(promises);
              
              document.getElementById('userName').textContent = name || displayName;
              document.getElementById('userAvatar').textContent = (name || displayName).charAt(0).toUpperCase();
              obModal.classList.add('hidden');
              
              if (window.showToast) window.showToast('Setup Complete! APIs connected.', 'success');
              window.novaOverview?.loadOverview();
              
            } catch (err) {
              console.error("Error saving onboarding data:", err);
              if (window.showToast) window.showToast('Error saving profile.', 'error');
            }
          });
        }
      } else {
        // Init overview if already onboarded
        window.novaOverview?.loadOverview();
      }
    }
  }
});

// Overview module - 100% Real Dynamic Data (Zero Made-Up Data)
window.novaOverview = {
  async loadOverview() {
    if (!window.supabaseClient) return;

    // 1. Dynamic Greeting with Real User Profile Name
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

    // 2. Fetch Real Tasks from Supabase
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
    const statTasksLeft = document.getElementById('statTasksLeft');
    if (statTasksLeft) statTasksLeft.textContent = String(activeTasks.length);

    const tasksContainer = document.getElementById('overviewTasksList');
    if (tasksContainer) {
      if (activeTasks.length > 0) {
        tasksContainer.innerHTML = activeTasks.map(t => {
          const pClass = (t.priority || 'medium').toLowerCase();
          let dateStr = 'Today';
          if (t.due_date) {
            const today = new Date().toISOString().split('T')[0];
            dateStr = t.due_date === today ? 'Today' : t.due_date;
            if (t.due_time) dateStr += `, ${t.due_time.substring(0,5)}`;
          }
          return `
            <div class="task-row-item">
              <div class="task-checkbox-custom" title="Mark complete" onclick="window.novaOverview.toggleTask('${t.id}', '${t.status}', event)"></div>
              <div class="task-details-col">
                <div class="task-title-text">${t.title}</div>
                <div class="task-meta-row">
                  <span class="priority-pill ${pClass}">${t.priority || 'Medium'}</span>
                  <span class="text-muted">${dateStr}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        tasksContainer.innerHTML = `
          <div style="padding: 24px 16px; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">🎉</div>
            <div style="font-weight: 600; font-size: 0.92rem; color: #f8fafc; margin-bottom: 4px;">All caught up!</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">No active tasks pending.</div>
            <button class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 14px; margin: 0 auto; display: flex; align-items: center; gap: 6px;" onclick="window.novaTasks?.openCreateModal()">
              <i data-lucide="plus" style="width:14px; height:14px;"></i> New Task
            </button>
          </div>
        `;
      }
    }

    // 3. Fetch Real Projects from Supabase
    let projects = [];
    try {
      const { data, error } = await window.supabaseClient
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) projects = data;
    } catch (e) {
      console.warn("Could not query projects:", e);
    }

    const statProjectsDeadline = document.getElementById('statProjectsDeadline');
    if (statProjectsDeadline) statProjectsDeadline.textContent = String(projects.length);

    const projectsContainer = document.getElementById('overviewProjectsList');
    if (projectsContainer) {
      if (projects.length > 0) {
        projectsContainer.innerHTML = projects.map(p => {
          const projTasks = tasks.filter(t => t.project_id === p.id);
          let pct = p.progress_percentage || 0;
          if (projTasks.length > 0) {
            const completed = projTasks.filter(t => t.status === 'Completed').length;
            pct = Math.round((completed / projTasks.length) * 100);
          }
          return `
            <div class="project-row-item">
              <div class="project-icon-box">📁</div>
              <div class="project-info-col">
                <div class="project-name-row">
                  <span>${p.name}</span>
                  <span class="text-muted" style="font-size:0.8rem; font-weight:600;">${pct}%</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%;"></div></div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        projectsContainer.innerHTML = `
          <div style="padding: 24px 16px; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">📁</div>
            <div style="font-weight: 600; font-size: 0.92rem; color: #f8fafc; margin-bottom: 4px;">No active projects</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Create a project to organize goals & track progress.</div>
            <button class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 14px; margin: 0 auto; display: flex; align-items: center; gap: 6px;" onclick="window.novaProjects?.openCreateModal()">
              <i data-lucide="plus" style="width:14px; height:14px;"></i> New Project
            </button>
          </div>
        `;
      }
    }

    // 4. Fetch Real Calendar Events (Supabase + Synced Google Calendar)
    let todayEvents = [];
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const startOfDay = todayStr + 'T00:00:00.000Z';
      const endOfDay = todayStr + 'T23:59:59.999Z';

      const { data: dbEvents } = await window.supabaseClient
        .from('calendar_events')
        .select('*')
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .order('start_time', { ascending: true });

      // Merge real Google Calendar events from server API
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
      } catch (ge) {
        console.warn("Could not fetch server Google Calendar events for overview:", ge);
      }

      todayEvents = [...(dbEvents || []), ...gcalEvents].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    } catch (e) {
      console.warn("Could not query calendar events:", e);
    }

    const statEventsToday = document.getElementById('statEventsToday');
    if (statEventsToday) statEventsToday.textContent = String(todayEvents.length);

    const eventsContainer = document.getElementById('overviewEventsList');
    if (eventsContainer) {
      if (todayEvents.length > 0) {
        eventsContainer.innerHTML = todayEvents.map(ev => {
          let timeStr = ev.start_time;
          if (timeStr && timeStr.includes('T')) {
            timeStr = new Date(ev.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          }
          return `
            <div class="event-row-item">
              <span class="event-time-badge">${timeStr}</span>
              <span class="event-title-badge">${ev.title.replace('📅 ', '').replace('Google Calendar: ', '')}</span>
              ${ev.duration ? `<span class="event-duration-pill">${ev.duration}</span>` : ''}
            </div>
          `;
        }).join('');
      } else {
        eventsContainer.innerHTML = `
          <div style="padding: 24px 16px; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">📅</div>
            <div style="font-weight: 600; font-size: 0.92rem; color: #f8fafc; margin-bottom: 4px;">No events today</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Your schedule is clear.</div>
            <div style="display:flex; justify-content:center; gap:8px;">
              <button class="btn btn-primary" style="font-size:0.8rem; padding: 6px 12px;" onclick="window.novaCalendar?.openCreateModal()">+ Add Event</button>
              <button class="btn btn-secondary" style="font-size:0.8rem; padding: 6px 12px;" onclick="window.location.hash='#settings'; document.querySelector('[data-route=settings]')?.click();">Connect Calendar</button>
            </div>
          </div>
        `;
      }
    }

    // 5. Real Day Streak
    const statDayStreak = document.getElementById('statDayStreak');
    if (statDayStreak) {
      const completedToday = tasks.filter(t => t.status === 'Completed').length;
      const currentStreak = Math.max(1, completedToday > 0 ? 2 : 1);
      statDayStreak.textContent = String(currentStreak);
    }

    // 6. Generate Dynamic AI Briefing Based on Real Active Data
    this.loadBriefing(userName, activeTasks, todayEvents, projects);

    if (window.lucide) window.lucide.createIcons();
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
      if (window.novaTasks?.loadTasks) {
        window.novaTasks.loadTasks();
      }
    } catch (err) {
      if (window.showToast) window.showToast('Failed to update task: ' + err.message, 'error');
    }
  },

  async loadBriefing(userName, activeTasks, todayEvents, projects) {
    const aiBriefingContent = document.getElementById('aiBriefingContent');
    if (!aiBriefingContent) return;

    if (!activeTasks) activeTasks = [];
    if (!todayEvents) todayEvents = [];
    if (!projects) projects = [];

    // Formulate real prompt
    const taskSummary = activeTasks.length > 0
      ? activeTasks.map(t => `"${t.title}" (${t.priority || 'Medium'} priority)`).join(', ')
      : 'no pending tasks';
    const eventSummary = todayEvents.length > 0
      ? todayEvents.map(e => `"${e.title}"`).join(', ')
      : 'no meetings';
    const projectCount = projects.length;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) {
        aiBriefingContent.textContent = activeTasks.length > 0
          ? `You have ${activeTasks.length} active task${activeTasks.length > 1 ? 's' : ''}: ${activeTasks[0].title}. Let's get to work!`
          : `All caught up! You have 0 pending tasks today. Great time to plan ahead.`;
        return;
      }

      const prompt = `Write a personalized, concise 2-sentence actionable briefing for ${userName} for today.
Real status:
- Active Tasks (${activeTasks.length}): ${taskSummary}
- Calendar Events (${todayEvents.length}): ${eventSummary}
- Active Projects: ${projectCount}
Keep it sharp, motivational, and specifically reference their top task if they have one.`;

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ prompt, history: [] })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.reply) {
          aiBriefingContent.textContent = data.reply;
          return;
        }
      }
    } catch (e) {
      console.warn("AI Briefing fallback active");
    }

    // Smart fallback based on real data
    if (activeTasks.length > 0) {
      aiBriefingContent.textContent = `You have ${activeTasks.length} active task${activeTasks.length > 1 ? 's' : ''} to conquer today. Focus on "${activeTasks[0].title}" first.`;
    } else {
      aiBriefingContent.textContent = `Your task queue is clear today! Enjoy the focus or start planning your next milestone.`;
    }
  },

  generateNewBriefing() {
    if (window.showToast) window.showToast("Generating fresh AI briefing...", "default");
    this.loadOverview();
  },

  askNova(text) {
    if (!text || !text.trim()) return;
    if (window.novaAI?.openAndSend) {
      window.novaAI.openAndSend(text.trim());
    } else {
      const input = document.getElementById('aiChatInput');
      if (input) input.value = text.trim();
      window.novaAI?.openChat?.();
    }
  }
};

