// tasks.js - 100% Real Database Tasks with Live Status Management
window.novaTasks = {
  tasks: [],
  currentTab: 'All',
  
  async loadTasks() {
    try {
      if (!window.supabaseClient) return;
      const { data, error } = await window.supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      this.tasks = data || [];
      this.renderBoard();
    } catch (err) {
      console.error(err);
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
    });

    const countTodo = document.getElementById('countTodo');
    const countInProgress = document.getElementById('countInProgress');
    const countCompleted = document.getElementById('countCompleted');

    if (countTodo) countTodo.textContent = cTodo;
    if (countInProgress) countInProgress.textContent = cProg;
    if (countCompleted) countCompleted.textContent = cComp;

    // Empty states for columns
    if (cTodo === 0) listTodo.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding: 24px; text-align:center;">No tasks to do</div>';
    if (cProg === 0) listInProgress.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding: 24px; text-align:center;">Nothing in progress</div>';
    if (cComp === 0) listCompleted.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding: 24px; text-align:center;">No completed tasks yet</div>';

    if (window.lucide) window.lucide.createIcons();
  },

  createTaskCard(task) {
    const div = document.createElement('div');
    div.className = 'task-card glass-panel';
    div.style.position = 'relative';
    
    const isDone = task.status === 'Completed';
    const pClass = (task.priority || 'medium').toLowerCase();

    div.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; ${isDone ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${task.title}</h4>
        <button type="button" class="btn-check-task" title="${isDone ? 'Mark as Todo' : 'Mark Complete'}" onclick="event.stopPropagation(); window.novaTasks.toggleTaskStatus('${task.id}', '${task.status}')" style="background: ${isDone ? '#10b981' : 'rgba(255,255,255,0.08)'}; border: 1px solid ${isDone ? '#10b981' : 'rgba(255,255,255,0.2)'}; width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; font-size: 0.75rem;">
          ${isDone ? '✓' : ''}
        </button>
      </div>
      ${task.description ? `<p style="margin: 6px 0; font-size: 0.82rem; color: var(--text-muted);">${task.description.substring(0, 70)}${task.description.length > 70 ? '...' : ''}</p>` : ''}
      <div class="task-meta" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
        <span class="priority-${pClass}" style="font-size:0.75rem; padding: 2px 8px; border-radius: 12px;">${task.priority || 'Medium'}</span>
        ${task.due_date ? `<span class="text-muted" style="font-size: 0.78rem; display: flex; align-items: center; gap: 4px;"><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${task.due_date}</span>` : ''}
      </div>
    `;
    div.onclick = () => this.openEditModal(task);
    return div;
  },

  async toggleTaskStatus(taskId, currentStatus) {
    if (!window.supabaseClient) return;
    const nextStatus = currentStatus === 'Completed' ? 'Todo' : 'Completed';
    try {
      const { error } = await window.supabaseClient.from('tasks').update({
        status: nextStatus,
        completed_at: nextStatus === 'Completed' ? new Date().toISOString() : null
      }).eq('id', taskId);

      if (error) throw error;
      if (window.showToast) window.showToast(nextStatus === 'Completed' ? 'Task completed! 🎉' : 'Task moved to Todo', 'success');
      this.loadTasks();
      if (window.novaOverview?.loadOverview) {
        window.novaOverview.loadOverview();
      }
    } catch (err) {
      if (window.showToast) window.showToast('Failed to update task: ' + err.message, 'error');
    }
  },

  openCreateModal() {
    window.novaCrud.open('New Task', [
      { id: 'title', label: 'Title', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
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
      const payload = {
        user_id: session.user.id,
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
      { id: 'status', label: 'Status', type: 'select', options: [
        {value: 'Todo', label: 'Todo'},
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
      const { error } = await window.supabaseClient.from('tasks').update({
        title: values.title,
        status: values.status,
        priority: values.priority,
        due_date: values.due_date || null,
        completed_at: values.status === 'Completed' ? new Date().toISOString() : null
      }).eq('id', task.id);

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

    // Populate existing values into the modal
    setTimeout(() => {
      if (document.getElementById('title')) document.getElementById('title').value = task.title || '';
      if (document.getElementById('status')) document.getElementById('status').value = task.status || 'Todo';
      if (document.getElementById('priority')) document.getElementById('priority').value = task.priority || 'Medium';
      if (document.getElementById('due_date')) document.getElementById('due_date').value = task.due_date || '';
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
