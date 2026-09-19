// projects.js - 100% Real Database Driven (Zero Made-Up Data)
window.novaProjects = {
  projects: [],
  
  async loadProjects() {
    try {
      if (!window.supabaseClient) return;
      const { data, error } = await window.supabaseClient
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      this.projects = data || [];
      this.renderGrid();
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to load projects: ' + err.message, 'error');
    }
  },

  renderGrid() {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (this.projects.length === 0) {
      grid.innerHTML = `
        <div class="glass-panel" style="grid-column: 1 / -1; text-align: center; padding: 48px 24px;">
          <div style="font-size: 2.2rem; margin-bottom: 12px;">📁</div>
          <h3 style="margin-bottom: 8px; font-weight: 600;">No projects created yet</h3>
          <p class="text-secondary" style="margin-bottom: 20px; font-size: 0.92rem; max-width: 420px; margin-left: auto; margin-right: auto;">
            Create your real projects to organize tasks, track deadlines, and monitor your progress.
          </p>
          <button class="btn btn-primary" onclick="window.novaProjects.openCreateModal()" style="display: inline-flex; align-items: center; gap: 8px;">
            <i data-lucide="plus"></i> New Project
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.projects.forEach(project => {
      const card = document.createElement('div');
      card.className = 'project-card glass-panel';
      const pct = project.progress_percentage || 0;
      card.innerHTML = `
        <div class="project-header">
          <div>
            <div class="project-title">${project.name}</div>
            <span class="project-status">${project.status || 'Active'}</span>
          </div>
        </div>
        <div class="project-desc">${project.description || 'No description provided.'}</div>
        <div>
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="project-footer">
            <span>${pct}% completed</span>
            ${project.deadline ? `<span><i data-lucide="clock" style="width:12px;height:12px;"></i> ${new Date(project.deadline).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
      `;
      card.onclick = () => this.openProjectModal(project);
      grid.appendChild(card);
    });
    
    if (window.lucide) window.lucide.createIcons();
  },

  openCreateModal() {
    window.novaCrud.open('New Project', [
      { id: 'name', label: 'Project Name', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
      { id: 'deadline', label: 'Deadline', type: 'date' }
    ], async (values) => {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;
      const payload = {
        user_id: session.user.id,
        name: values.name,
        description: values.description,
        status: 'Active'
      };
      if (values.deadline) payload.deadline = values.deadline;

      const { error } = await window.supabaseClient.from('projects').insert(payload);
      if (error) {
        if (error.message && error.message.includes('LIMIT_REACHED')) {
          if (window.showToast) window.showToast('You have reached your limit for projects on the ' + (window.currentPlan || 'FREE') + ' plan. Payments coming soon.', 'error');
        } else {
          if (window.showToast) window.showToast('Failed to create project: ' + error.message, 'error');
        }
      } else {
        if (window.showToast) window.showToast('Project created successfully!', 'success');
        this.loadProjects();
        if (window.novaOverview?.loadOverview) {
          window.novaOverview.loadOverview();
        }
      }
    });
  },

  async openProjectModal(project) {
    const modal = document.getElementById('projectDetailModal');
    if (!modal) return;
    
    document.getElementById('projectDetailTitle').textContent = project.name;
    document.getElementById('projectDetailDesc').textContent = project.description || 'No description provided.';
    
    const closeBtn = document.getElementById('projectDetailCloseBtn');
    const deleteBtn = document.getElementById('projectDetailDeleteBtn');
    const addTaskBtn = document.getElementById('projectDetailAddTaskBtn');
    const tasksList = document.getElementById('projectDetailTasksList');
    
    const closeModal = () => modal.classList.add('hidden');
    closeBtn.onclick = closeModal;
    
    // Delete Project
    deleteBtn.onclick = async () => {
      if (confirm('Are you sure you want to delete this project? All associated tasks will lose their project association.')) {
        try {
          const { error } = await window.supabaseClient.from('projects').delete().eq('id', project.id);
          if (error) throw error;
          if (window.showToast) window.showToast('Project deleted', 'success');
          closeModal();
          this.loadProjects();
          if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
        } catch (err) {
          if (window.showToast) window.showToast('Failed to delete project: ' + err.message, 'error');
        }
      }
    };
    
    // Load Project Tasks
    const loadProjectTasks = async () => {
      try {
        const { data, error } = await window.supabaseClient.from('tasks').select('*').eq('project_id', project.id).order('created_at', { ascending: false });
        if (error) throw error;
        tasksList.innerHTML = '';
        if (!data || data.length === 0) {
          tasksList.innerHTML = '<div class="text-muted" style="font-size: 0.85rem; padding: 12px 0;">No tasks for this project yet.</div>';
          return;
        }
        data.forEach(task => {
          const isDone = task.status === 'Completed';
          const card = document.createElement('div');
          card.className = 'glass-panel';
          card.style.padding = '12px';
          card.style.display = 'flex';
          card.style.alignItems = 'center';
          card.style.justifyContent = 'space-between';
          card.innerHTML = `
            <div style="flex:1; margin-right: 12px; cursor: pointer; ${isDone ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
              <div style="font-size: 0.95rem; font-weight: 500;">${task.title}</div>
              ${task.due_date ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Due: ${task.due_date}</div>` : ''}
            </div>
            <button class="btn-check-task" title="${isDone ? 'Mark as Todo' : 'Mark Complete'}" style="background: ${isDone ? '#10b981' : 'rgba(255,255,255,0.08)'}; border: 1px solid ${isDone ? '#10b981' : 'rgba(255,255,255,0.2)'}; width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; font-size: 0.75rem;">
              ${isDone ? '✓' : ''}
            </button>
          `;
          
          card.querySelector('div').onclick = () => {
            closeModal();
            if (window.novaTasks?.openEditModal) window.novaTasks.openEditModal(task);
          };
          
          card.querySelector('.btn-check-task').onclick = async (e) => {
            e.stopPropagation();
            if (window.novaTasks?.toggleTaskStatus) {
              await window.novaTasks.toggleTaskStatus(task.id, task.status);
              await window.novaProjects.updateProjectProgress(project.id);
              loadProjectTasks();
            }
          };
          
          tasksList.appendChild(card);
        });
      } catch (err) {
        tasksList.innerHTML = '<div class="text-muted" style="color: #ef4444;">Failed to load tasks.</div>';
      }
    };
    
    // Add Task to Project
    addTaskBtn.onclick = () => {
      window.novaCrud.open('New Project Task', [
        { id: 'title', label: 'Title', required: true },
        { id: 'description', label: 'Description', type: 'textarea' },
        { id: 'priority', label: 'Priority', type: 'select', options: [
          {value: 'Medium', label: 'Medium'}, {value: 'Low', label: 'Low'}, {value: 'High', label: 'High'}, {value: 'Urgent', label: 'Urgent'}
        ]},
        { id: 'due_date', label: 'Due Date', type: 'date' }
      ], async (values) => {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;
        const payload = {
          user_id: session.user.id,
          project_id: project.id,
          title: values.title,
          description: values.description,
          priority: values.priority || 'Medium',
          status: 'Todo'
        };
        if (values.due_date) payload.due_date = values.due_date;
        const { error } = await window.supabaseClient.from('tasks').insert(payload);
        if (error) {
          if (error.message && error.message.includes('LIMIT_REACHED')) {
            if (window.showToast) window.showToast('You have reached your limit for tasks on the ' + (window.currentPlan || 'FREE') + ' plan. Payments coming soon.', 'error');
          } else {
            if (window.showToast) window.showToast('Failed to create task', 'error');
          }
        } else {
          if (window.showToast) window.showToast('Task added to project!', 'success');
          await window.novaProjects.updateProjectProgress(project.id);
          loadProjectTasks();
          if (window.novaTasks?.loadTasks) window.novaTasks.loadTasks();
        }
      });
    };
    
    await loadProjectTasks();
    modal.classList.remove('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    for (let m of mutations) {
      if (m.target.id === 'viewContainer' && m.addedNodes.length > 0) {
        if (document.querySelector('.projects-grid')) {
          window.novaProjects.loadProjects();
        }
      }
    }
  });
  const vc = document.getElementById('viewContainer');
  if (vc) observer.observe(vc, { childList: true });
});
