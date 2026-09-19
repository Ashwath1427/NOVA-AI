// notes.js
window.novaNotes = {
  notes: [],
  
  async loadNotes() {
    try {
      if (!window.supabaseClient) return;
      const { data, error } = await window.supabaseClient
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      this.notes = data || [];
      this.renderGrid();
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to load notes', 'error');
    }
  },

  renderGrid() {
    const grid = document.getElementById('notesGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (this.notes.length === 0) {
      grid.innerHTML = '<div class="empty-state text-muted" style="grid-column: 1 / -1; text-align: center; padding: 40px;">Capture something worth remembering.</div>';
      return;
    }

    this.notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'note-card glass-panel';
      card.innerHTML = `
        <div class="note-title">${note.title}</div>
        <div class="note-preview">${note.content || ''}</div>
        <div class="note-footer">
          <span>${new Date(note.updated_at).toLocaleDateString()}</span>
        </div>
      `;
      card.onclick = () => this.openNoteModal(note);
      grid.appendChild(card);
    });
  },

  openCreateModal() {
    window.novaCrud.open('New Note', [
      { id: 'title', label: 'Title', required: true },
      { id: 'content', label: 'Content', type: 'textarea' }
    ], async (values) => {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;
      const { error } = await window.supabaseClient.from('notes').insert({
        user_id: session.user.id,
        title: values.title,
        content: values.content
      });
      if (error) {
        if (error.message && error.message.includes('LIMIT_REACHED')) {
          if (window.showToast) window.showToast('You have reached your limit for notes on the ' + (window.currentPlan || 'FREE') + ' plan. Payments coming soon.', 'error');
        } else {
          if (window.showToast) window.showToast('Failed to create note', 'error');
        }
      } else {
        if (window.showToast) window.showToast('Note saved', 'success');
        this.loadNotes();
      }
    });
  },

  openNoteModal(note) {
    if (window.showToast) window.showToast(`View note: ${note.title}`, 'default');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    for (let m of mutations) {
      if (m.target.id === 'viewContainer' && m.addedNodes.length > 0) {
        if (document.querySelector('.notes-grid')) {
          window.novaNotes.loadNotes();
        }
      }
    }
  });
  const vc = document.getElementById('viewContainer');
  if (vc) observer.observe(vc, { childList: true });
});
