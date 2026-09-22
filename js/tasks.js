// tasks.js - 100% Real Database Tasks with Live Status Management, Quick-Actions & Drag-and-Drop
window.novaTasks = {
  tasks: [],
  currentTab: 'All',
  draggedTaskId: null,
  
  async loadTasks() {
    try {
      if (!window.supabaseClient) return;
      const { data, error } = await window.supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      this.tasks = data || [];
      
      // Auto-move Todo tasks to In Progress if due date is today or passed
      const today = new Date().toISOString().split('T')[0];
      const tasksToUpdate = this.tasks.filter(t => t.status === 'Todo' && t.due_date && t.due_date <= today);
      
      if (tasksToUpdate.length > 0) {
        const updateIds = tasksToUpdate.map(t => t.id);
        // Optimistically update local data
        this.tasks.forEach(t => {
          if (updateIds.includes(t.id)) t.status = 'In Progress';
        });
        
        // Update database in background
        window.supabaseClient
          .from('tasks')
          .update({ status: 'In Progress' })
          .in('id', updateIds)
          .then(({ error: updateErr }) => {
            if (updateErr) console.error("Failed to auto-move tasks to In Progress:", updateErr);
          });
      }

      this.renderBoard();
    } catch (err) {
      console.error("Failed to load tasks:", err);
      if (window.showToast) window.showToast('Failed to load tasks: ' + err.message, 'error');
    }
  },

  filterByTab(tab, btn) {
    this.currentTab = tab;
    document.querySelectorAll('#tasksFilterTabs .filter-tab-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.renderBoard();
  },

  renderBoard() {
    const listTodo = document.getElementById('listTodo');
    const listInProgress = document.getElementById('listInProgress');
    const listCompleted = document.getElementById('listCompleted');
    
    if (!listTodo || !listInProgress || !listCompleted) return;

    listTodo.innerHTML = '';
    listInProgress.innerHTML = '';
    listCompleted.innerHTML = '';

    let cTodo = 0, cProg = 0, cComp = 0;
    const today = new Date().toISOString().split('T')[0];

    const filtered = this.tasks.filter(task => {
      if (this.currentTab === 'All') return true;
      if (this.currentTab === 'Today') return task.due_date === today;
      if (this.currentTab === 'Upcoming') return task.due_date && task.due_date > today;
      if (this.currentTab === 'Overdue') return task.due_date && task.due_date < today && task.status !== 'Completed';
      if (this.currentTab === 'Completed') return task.status === 'Completed';
      return true;
    });

    filtered.forEach(task => {
      const card = this.createTaskCard(task);
      if (task.status === 'Todo') { listTodo.appendChild(card); cTodo++; }
      else if (task.status === 'In Progress') { listInProgress.appendChild(card); cProg++; }
      else if (task.status === 'Completed') { listCompleted.appendChild(card); cComp++; }
      else { listTodo.appendChild(card); cTodo++; } // default fallback
    });

    const countTodo = document.getElementById('countTodo');
    const countInProgress = document.getElementById('countInProgress');
    const countCompleted = document.getElementById('countCompleted');

    if (countTodo) countTodo.textContent = cTodo;
    if (countInProgress) countInProgress.textContent = cProg;
    if (countCompleted) countCompleted.textContent = cComp;

    // Rich Empty States
    if (cTodo === 0) {
      listTodo.innerHTML = `
        <div class="task-empty-state">
          <div class="empty-icon-wrap" style="color: #818cf8; background: rgba(99, 102, 241, 0.12);">
            <i data-lucide="check-square" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-title">All tasks cleared</p>
          <p class="empty-desc">Click "+ New Task" above to add items to your queue.</p>
        </div>
      `;
    }

    if (cProg === 0) {
      listInProgress.innerHTML = `
        <div class="task-empty-state">
          <div class="empty-icon-wrap" style="color: #f59e0b; background: rgba(245, 158, 11, 0.14);">
            <i data-lucide="play" style="width: 20px; height: 20px; margin-left: 2px;"></i>
          </div>
          <p class="empty-title">No tasks in progress</p>
          <p class="empty-desc">Click <strong>"▶ Start"</strong> on any task or drag it here when you begin working.</p>
        </div>
      `;
    }

    if (cComp === 0) {
      listCompleted.innerHTML = `
        <div class="task-empty-state">
          <div class="empty-icon-wrap" style="color: #10b981; background: rgba(16, 185, 129, 0.12);">
            <i data-lucide="check-circle-2" style="width: 22px; height: 22px;"></i>
          </div>
          <p class="empty-title">No completed tasks yet</p>
          <p class="empty-desc">Tasks you complete will show up here for your daily record.</p>
        </div>
      `;
    }

    // Initialize HTML5 Drag & Drop listeners on dropzones
    this.setupDropZones();

    if (window.lucide) window.lucide.createIcons();
  },

  createTaskCard(task) {
    const div = document.createElement('div');
    div.className = 'task-card';
    div.draggable = true;
    div.dataset.taskId = task.id;
    
    const isDone = task.status === 'Completed';
    const isProgress = task.status === 'In Progress';
    const pClass = (task.priority || 'medium').toLowerCase();

    // Action button row depending on state
    let actionButtons = '';
    if (task.status === 'Todo') {
      actionButtons = `
        <div class="task-actions-row">
          <button type="button" class="btn-start-task" title="Launch Focus Mode" onclick="event.stopPropagation(); window.novaFocus?.startSession(${JSON.stringify(task).replace(/"/g, '&quot;')});">
            <i data-lucide="play" style="width: 12px; height: 12px;"></i> Focus
          </button>
          <button type="button" class="btn-complete-task" title="Mark Done" onclick="event.stopPropagation(); window.novaTasks.updateTaskStatus('${task.id}', 'Completed');">
            <i data-lucide="check" style="width: 12px; height: 12px;"></i> Done
          </button>
        </div>
      `;
    } else if (isProgress) {
      actionButtons = `
        <div class="task-actions-row">
          <button type="button" class="btn-start-task" title="Open Focus Session" onclick="event.stopPropagation(); window.novaFocus?.startSession(${JSON.stringify(task).replace(/"/g, '&quot;')});">
            <i data-lucide="play" style="width: 12px; height: 12px;"></i> Focus
          </button>
          <button type="button" class="btn-complete-task" title="Mark as Completed" onclick="event.stopPropagation(); window.novaTasks.updateTaskStatus('${task.id}', 'Completed');" style="margin-left: auto;">
            <i data-lucide="check" style="width: 12px; height: 12px;"></i> Complete
          </button>
          <button type="button" class="btn-reopen-task" title="Pause / Move back to Todo" onclick="event.stopPropagation(); window.novaTasks.updateTaskStatus('${task.id}', 'Todo');">
            Pause
          </button>
        </div>
      `;
    } else if (isDone) {
      actionButtons = `
        <div class="task-actions-row">
          <span style="font-size: 0.75rem; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <i data-lucide="check-circle" style="width: 13px; height: 13px;"></i> Done
          </span>
          <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
            <button type="button" class="btn-reopen-task" title="Reopen Task" onclick="event.stopPropagation(); window.novaTasks.updateTaskStatus('${task.id}', 'Todo');">
              <i data-lucide="rotate-ccw" style="width: 11px; height: 11px;"></i> Reopen
            </button>
            <button type="button" class="btn-delete-task" title="Delete Task" onclick="event.stopPropagation(); window.novaTasks.deleteTask('${task.id}');">
              <i data-lucide="trash-2" style="width: 11px; height: 11px;"></i> Delete
            </button>
          </div>
        </div>
      `;
    }

    // Determine estimated duration pill
    let estPill = '';
    if (task.estimated_minutes) {
      estPill = `<span class="text-secondary" style="font-size: 0.74rem; background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 8px;"><i data-lucide="clock" style="width:11px;height:11px;display:inline;vertical-align:-1px;"></i> ~${task.estimated_minutes}m</span>`;
    } else if (task.title) {
      const match = task.title.match(/(\d+)\s*(?:min|m\b)/i);
      if (match) {
        estPill = `<span class="text-secondary" style="font-size: 0.74rem; background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 8px;"><i data-lucide="clock" style="width:11px;height:11px;display:inline;vertical-align:-1px;"></i> ~${match[1]}m</span>`;
      }
    }

    const toggleIcon = isDone ? 'check-circle' : 'circle';
    const toggleColor = isDone ? '#10b981' : '#64748b';
    const nextStatus = isDone ? 'Todo' : 'Completed';

    div.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <button type="button" class="btn-circular-toggle" onclick="event.stopPropagation(); window.novaTasks.updateTaskStatus('${task.id}', '${nextStatus}');" style="background: none; border: none; padding: 0; cursor: pointer; color: ${toggleColor}; margin-top: 2px;">
            <i data-lucide="${toggleIcon}" style="width: 18px; height: 18px; ${isDone ? 'fill: rgba(16, 185, 129, 0.2);' : ''}"></i>
          </button>
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; ${isDone ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${task.title}</h4>
        </div>
      </div>
      ${task.description ? `<p style="margin-left: 28px;">${task.description.substring(0, 80)}${task.description.length > 80 ? '...' : ''}</p>` : ''}
      <div class="task-meta" style="margin-top: 10px; margin-left: 28px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span class="priority-${pClass}" style="padding: 2px 8px; border-radius: 12px; font-size: 0.74rem; font-weight: 600;">${task.priority || 'Medium'}</span>
        ${estPill}
        ${task.due_date ? `<span class="text-muted" style="font-size: 0.78rem; display: flex; align-items: center; gap: 4px;"><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${task.due_date}</span>` : ''}
      </div>
      ${actionButtons}
    `;

    // Card click opens full edit modal
    div.onclick = () => this.openEditModal(task);

    // HTML5 Drag handlers
    div.addEventListener('dragstart', (e) => {
      this.draggedTaskId = task.id;
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
      div.classList.add('is-dragging');
    });

    div.addEventListener('dragend', () => {
      this.draggedTaskId = null;
      div.classList.remove('is-dragging');
      document.querySelectorAll('.task-column').forEach(col => col.classList.remove('drag-over'));
    });

    return div;
  },

  setupDropZones() {
    const columns = [
      { col: document.getElementById('colTodo'), list: document.getElementById('listTodo'), status: 'Todo' },
      { col: document.getElementById('colInProgress'), list: document.getElementById('listInProgress'), status: 'In Progress' },
      { col: document.getElementById('colCompleted'), list: document.getElementById('listCompleted'), status: 'Completed' }
    ];

    columns.forEach(({ col, list, status }) => {
      if (!col || !list) return;

      col.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      };

      col.ondragleave = (e) => {
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over');
        }
      };

      col.ondrop = async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain') || this.draggedTaskId;
        if (taskId) {
          await this.updateTaskStatus(taskId, status);
        }
      };
    });
  },

  async updateTaskStatus(taskId, newStatus) {
    if (!taskId || !newStatus) return;

    // Optimistic UI update
    const task = this.tasks.find(t => t.id === taskId);
    const oldStatus = task ? task.status : null;
    if (task) {
      task.status = newStatus;
      if (newStatus === 'Completed') task.completed_at = new Date().toISOString();
      this.renderBoard();
    }

    try {
      if (!window.supabaseClient) return;

      const { error } = await window.supabaseClient
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'Completed' ? new Date().toISOString() : null
        })
        .eq('id', taskId);

      if (error) throw error;

      // Motivational toast
      if (window.showToast) {
        if (newStatus === 'In Progress') {
          window.showToast('🚀 Task is now In Progress — let\'s crush it!', 'default');
        } else if (newStatus === 'Completed') {
          window.showToast('🎉 Task completed! Awesome work.', 'success');
        } else {
          window.showToast('Task moved to To Do.', 'default');
        }
      }
    } catch (err) {
      console.error("Error updating task status:", err);
      // Revert optimistic update on failure
      if (task && oldStatus) {
        task.status = oldStatus;
        if (oldStatus !== 'Completed') {
          task.completed_at = null;
        }
        this.renderBoard();
      }
      if (window.showToast) {
        window.showToast('Failed to update task: ' + err.message, 'error', () => {
          this.updateTaskStatus(taskId, newStatus);
        });
      }
    }
  },

  async toggleTaskStatus(taskId, currentStatus) {
    const nextStatus = currentStatus === 'Completed' ? 'Todo' : 'Completed';
    await this.updateTaskStatus(taskId, nextStatus);
  },

  async deleteTask(taskId) {
    if (!taskId) return;
    
    // Optimistic UI removal
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;
    const removedTask = this.tasks.splice(index, 1)[0];
    this.renderBoard();

    try {
      if (!window.supabaseClient) return;
      const { error } = await window.supabaseClient.from('tasks').delete().eq('id', taskId);
      if (error) throw error;

      if (window.showToast) window.showToast('Task deleted.', 'default');
      if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
    } catch (err) {
      console.error("Error deleting task:", err);
      // Revert on error
      this.tasks.splice(index, 0, removedTask);
      this.renderBoard();
      if (window.showToast) window.showToast('Failed to delete task: ' + err.message, 'error');
    }
  },

  async clearAllCompleted() {
    const completedTasks = this.tasks.filter(t => t.status === 'Completed');
    if (completedTasks.length === 0) {
      if (window.showToast) window.showToast('No completed tasks to clear.', 'default');
      return;
    }

    if (!confirm(`Are you sure you want to delete all ${completedTasks.length} completed tasks?`)) {
      return;
    }

    // Optimistically remove all completed tasks
    const completedIds = completedTasks.map(t => t.id);
    this.tasks = this.tasks.filter(t => t.status !== 'Completed');
    this.renderBoard();

    try {
      if (!window.supabaseClient) return;
      const { error } = await window.supabaseClient.from('tasks').delete().in('id', completedIds);
      if (error) throw error;

      if (window.showToast) window.showToast(`Cleared ${completedIds.length} completed tasks.`, 'success');
      if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
    } catch (err) {
      console.error("Error clearing completed tasks:", err);
      this.loadTasks();
      if (window.showToast) window.showToast('Failed to clear completed tasks: ' + err.message, 'error');
    }
  },

  async createQuickTask(title) {
    if (!title || !title.trim()) return;
    
    try {
      if (!window.supabaseClient) return;
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;
      
      const payload = {
        user_id: session.user.id,
        title: title.trim(),
        status: 'Todo',
        priority: 'Medium'
      };

      const { error } = await window.supabaseClient.from('tasks').insert([payload]);
      if (error) throw error;
      
      this.loadTasks();
      if (window.showToast) window.showToast('Task added.', 'success');
    } catch (err) {
      console.error("Error creating quick task:", err);
      if (window.showToast) window.showToast('Failed to add task.', 'error');
    }
  },

  openCreateModal() {
    window.novaCrud.open('New Task', [
      { id: 'title', label: 'Title', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
      { id: 'estimated_minutes', label: 'Estimated Time', type: 'select', options: [
        {value: '', label: 'None / Auto-infer'},
        {value: '15', label: '15 min'},
        {value: '30', label: '30 min'},
        {value: '45', label: '45 min'},
        {value: '60', label: '1 hour'},
        {value: '90', label: '1.5 hours'},
        {value: '120', label: '2+ hours'}
      ]},
      { id: 'status', label: 'Status', type: 'select', options: [
        {value: 'Todo', label: 'To Do'},
        {value: 'In Progress', label: 'In Progress'},
        {value: 'Completed', label: 'Completed'}
      ]},
      { id: 'priority', label: 'Priority', type: 'select', options: [
        {value: 'Medium', label: 'Medium'},
        {value: 'Low', label: 'Low'},
        {value: 'High', label: 'High'},
        {value: 'Urgent', label: 'Urgent'}
      ]},
      { id: 'due_date', label: 'Due Date', type: 'date' }
    ], async (values) => {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;

      // Smart estimation inference from title if unspecified (Phase 7)
      let est = values.estimated_minutes ? parseInt(values.estimated_minutes, 10) : null;
      if (!est && values.title) {
        const m = values.title.match(/(\d+)\s*(?:min|m\b)/i);
        if (m) est = parseInt(m[1], 10);
      }

      const payload = {
        user_id: session.user.id,
        title: values.title,
        description: values.description,
        priority: values.priority || 'Medium',
        status: values.status || 'Todo'
      };
      if (values.due_date) payload.due_date = values.due_date;
      if (est) payload.estimated_minutes = est;

      const { error } = await window.supabaseClient.from('tasks').insert(payload);
      if (error) {
        if (error.message && error.message.includes('LIMIT_REACHED')) {
          if (window.showToast) window.showToast('Task limit reached for current plan.', 'error');
        } else {
          if (window.showToast) window.showToast('Failed to create task: ' + error.message, 'error');
        }
      } else {
        if (window.showToast) window.showToast('Task created successfully!', 'success');
        this.loadTasks();
        if (window.novaOverview?.loadOverview) {
          window.novaOverview.loadOverview();
        }
      }
    });
  },

  openEditModal(task) {
    window.novaCrud.open('Edit Task', [
      { id: 'title', label: 'Title', required: true },
      { id: 'estimated_minutes', label: 'Estimated Time', type: 'select', options: [
        {value: '', label: 'None'},
        {value: '15', label: '15 min'},
        {value: '30', label: '30 min'},
        {value: '45', label: '45 min'},
        {value: '60', label: '1 hour'},
        {value: '90', label: '1.5 hours'},
        {value: '120', label: '2+ hours'}
      ]},
      { id: 'status', label: 'Status', type: 'select', options: [
        {value: 'Todo', label: 'To Do'},
        {value: 'In Progress', label: 'In Progress'},
        {value: 'Completed', label: 'Completed'}
      ]},
      { id: 'priority', label: 'Priority', type: 'select', options: [
        {value: 'Medium', label: 'Medium'},
        {value: 'Low', label: 'Low'},
        {value: 'High', label: 'High'},
        {value: 'Urgent', label: 'Urgent'}
      ]},
      { id: 'due_date', label: 'Due Date', type: 'date' }
    ], async (values) => {
      const updateData = {
        title: values.title,
        status: values.status,
        priority: values.priority,
        due_date: values.due_date || null,
        completed_at: values.status === 'Completed' ? new Date().toISOString() : null
      };
      if (values.estimated_minutes) {
        updateData.estimated_minutes = parseInt(values.estimated_minutes, 10);
      }

      const { error } = await window.supabaseClient.from('tasks').update(updateData).eq('id', task.id);

      if (error) {
        if (window.showToast) window.showToast('Failed to update task: ' + error.message, 'error');
      } else {
        if (window.showToast) window.showToast('Task updated!', 'success');
        this.loadTasks();
        if (window.novaOverview?.loadOverview) {
          window.novaOverview.loadOverview();
        }
      }
    }, async () => {
      // onDelete handler
      const { error } = await window.supabaseClient.from('tasks').delete().eq('id', task.id);
      if (error) {
        if (window.showToast) window.showToast('Failed to delete task: ' + error.message, 'error');
      } else {
        if (window.showToast) window.showToast('Task deleted', 'success');
        this.loadTasks();
        if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      }
    });

    // Populate existing values into modal
    setTimeout(() => {
      if (document.getElementById('title')) document.getElementById('title').value = task.title || '';
      if (document.getElementById('status')) document.getElementById('status').value = task.status || 'Todo';
      if (document.getElementById('priority')) document.getElementById('priority').value = task.priority || 'Medium';
      if (document.getElementById('due_date')) document.getElementById('due_date').value = task.due_date || '';
      if (document.getElementById('estimated_minutes')) document.getElementById('estimated_minutes').value = task.estimated_minutes || '';
    }, 50);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    for (let m of mutations) {
      if (m.target.id === 'viewContainer' && m.addedNodes.length > 0) {
        if (document.querySelector('.task-board')) {
          window.novaTasks.loadTasks();
        }
      }
    }
  });
  const vc = document.getElementById('viewContainer');
  if (vc) observer.observe(vc, { childList: true });
});
