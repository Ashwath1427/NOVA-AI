// habits.js
window.novaHabits = {
  habits: [],
  
  async loadHabits() {
    try {
      if (!window.supabaseClient) return;
      
      const { data, error } = await window.supabaseClient
        .from('habits')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      const { data: entries } = await window.supabaseClient
        .from('habit_entries')
        .select('habit_id, completed_at')
        .order('completed_at', { ascending: false });

      // Compute Streaks & Today's Status
      const todayStr = new Date().toISOString().split('T')[0];
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

      this.habits = (data || []).map(h => {
        const hEntries = (entries || []).filter(e => e.habit_id === h.id);
        const uniqueDates = [...new Set(hEntries.map(e => e.completed_at.split('T')[0]))].sort().reverse();
        
        let streak = 0;
        let isDoneToday = false;
        
        if (uniqueDates.includes(todayStr)) {
          isDoneToday = true;
          streak = 1;
          let checkDate = new Date(yesterdayDate);
          for (let i = 1; i < uniqueDates.length; i++) {
            if (uniqueDates.includes(checkDate.toISOString().split('T')[0])) {
              streak++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
        } else if (uniqueDates.includes(yesterdayStr)) {
          streak = 1;
          let checkDate = new Date(yesterdayDate);
          checkDate.setDate(checkDate.getDate() - 1);
          for (let i = 1; i < uniqueDates.length; i++) {
            if (uniqueDates.includes(checkDate.toISOString().split('T')[0])) {
              streak++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
        }

        return { ...h, streak, isDoneToday };
      });

      this.renderList();
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to load habits', 'error');
    }
  },

  renderList() {
    const list = document.getElementById('habitsList');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (this.habits.length === 0) {
      list.innerHTML = '<div class="empty-state text-muted" style="text-align: center; padding: 40px;">No active habits. Start building consistency.</div>';
      return;
    }

    this.habits.forEach(habit => {
      const item = document.createElement('div');
      item.className = 'habit-item';
      item.innerHTML = `
        <div class="habit-info" style="cursor: pointer; flex: 1;">
          <div class="habit-name">${habit.name}</div>
          <div class="habit-meta">${habit.frequency}</div>
        </div>
        <div class="habit-actions">
          <div class="habit-streak" style="color: ${habit.streak > 0 ? '#f97316' : 'var(--text-muted)'}"><i data-lucide="flame" style="width:16px;height:16px;"></i> ${habit.streak} days</div>
          <button class="btn-check ${habit.isDoneToday ? 'completed' : ''}" onclick="window.novaHabits.toggleHabit('${habit.id}', ${habit.isDoneToday})"><i data-lucide="check" style="width:20px;height:20px;"></i></button>
        </div>
      `;
      
      item.querySelector('.habit-info').onclick = () => this.openEditModal(habit);
      
      list.appendChild(item);
    });
    
    if (window.lucide) window.lucide.createIcons();
  },

  async toggleHabit(id, isCurrentlyDone) {
    if (!window.supabaseClient) return;
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;
      
      if (isCurrentlyDone) {
        // Un-check today (find entry and delete)
        const todayStr = new Date().toISOString().split('T')[0];
        const { data } = await window.supabaseClient.from('habit_entries')
          .select('id, completed_at').eq('habit_id', id);
        const todayEntry = data?.find(e => e.completed_at.startsWith(todayStr));
        if (todayEntry) {
          await window.supabaseClient.from('habit_entries').delete().eq('id', todayEntry.id);
        }
      } else {
        // Check today (insert)
        await window.supabaseClient.from('habit_entries').insert({
          habit_id: id,
          user_id: session.user.id
        });
        if (window.showToast) window.showToast('Habit completed! 🔥', 'success');
      }
      this.loadHabits();
    } catch(e) {
      if (window.showToast) window.showToast('Failed to update habit', 'error');
    }
  },

  openCreateModal() {
    window.novaCrud.open('New Habit', [
      { id: 'name', label: 'Habit Name', required: true },
      { id: 'frequency', label: 'Frequency', type: 'select', options: [
        {value: 'Daily', label: 'Daily'}, {value: 'Weekly', label: 'Weekly'}
      ]}
    ], async (values) => {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;
      const { error } = await window.supabaseClient.from('habits').insert({
        user_id: session.user.id,
        name: values.name,
        frequency: values.frequency || 'Daily'
      });
      if (error) {
        if (error.message && error.message.includes('LIMIT_REACHED')) {
          if (window.showToast) window.showToast('You have reached your limit for habits on the ' + (window.currentPlan || 'FREE') + ' plan. Payments coming soon.', 'error');
        } else {
          if (window.showToast) window.showToast('Failed to create habit', 'error');
        }
      } else {
        if (window.showToast) window.showToast('Habit tracked', 'success');
        this.loadHabits();
      }
    });
  },

  openEditModal(habit) {
    window.novaCrud.open('Edit Habit', [
      { id: 'name', label: 'Habit Name', required: true },
      { id: 'frequency', label: 'Frequency', type: 'select', options: [
        {value: 'Daily', label: 'Daily'}, {value: 'Weekly', label: 'Weekly'}
      ]}
    ], async (values) => {
      const { error } = await window.supabaseClient.from('habits').update({
        name: values.name,
        frequency: values.frequency
      }).eq('id', habit.id);
      
      if (error) {
        if (window.showToast) window.showToast('Failed to update habit', 'error');
      } else {
        if (window.showToast) window.showToast('Habit updated', 'success');
        this.loadHabits();
      }
    }, async () => {
      const { error } = await window.supabaseClient.from('habits').delete().eq('id', habit.id);
      if (error) {
        if (window.showToast) window.showToast('Failed to delete habit', 'error');
      } else {
        if (window.showToast) window.showToast('Habit deleted', 'success');
        this.loadHabits();
      }
    });
    
    setTimeout(() => {
      if(document.getElementById('name')) document.getElementById('name').value = habit.name;
      if(document.getElementById('frequency')) document.getElementById('frequency').value = habit.frequency;
    }, 50);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    for (let m of mutations) {
      if (m.target.id === 'viewContainer' && m.addedNodes.length > 0) {
        if (document.querySelector('.habits-list')) {
          window.novaHabits.loadHabits();
        }
      }
    }
  });
  const vc = document.getElementById('viewContainer');
  if (vc) observer.observe(vc, { childList: true });
});
