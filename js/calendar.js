// calendar.js
window.novaCalendar = {
  events: [],
  
  async loadEvents() {
    try {
      let dbEvents = [];
      if (window.supabaseClient) {
        const now = new Date();
        
        // First, clean up any old Google Calendar events from the database
        // They should only come from the live iCal feed, not stored copies
        await window.supabaseClient
          .from('calendar_events')
          .delete()
          .eq('source', 'Google Calendar');

        const { data, error } = await window.supabaseClient
          .from('calendar_events')
          .select('*')
          .gte('end_time', now.toISOString())
          .order('start_time', { ascending: true });
          
        if (!error && data) dbEvents = data;
      }

      // Merge real Google Calendar events from server API if connected
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
              gcalEvents = json.events.map(e => ({
                id: e.id,
                title: e.title,
                description: e.description,
                start_time: e.startTime,
                end_time: e.endTime || e.startTime,
                source: 'Google Calendar'
              }));
            }
          }
        }
      } catch (ge) {
        console.warn("Could not fetch server Google Calendar events:", ge);
      }

      const nowTime = new Date().getTime();
      this.events = [...dbEvents, ...gcalEvents]
        .filter(ev => new Date(ev.end_time).getTime() >= nowTime)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      this.renderList();
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to load events', 'error');
    }
  },

  async syncGoogleCalendar() {
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) {
        if (window.showToast) window.showToast('Please log in first.', 'error');
        return;
      }

      if (window.showToast) window.showToast('Extracting events from Google Calendar...', 'default');

      const res = await fetch('/api/integrations/google-calendar/events', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch from Google Calendar');
      
      const json = await res.json();
      if (!json.events || json.events.length === 0) {
        if (window.showToast) window.showToast('No upcoming Google Calendar events found.', 'default');
        return;
      }

      // We no longer permanently save them to Supabase here because they are fetched dynamically 
      // in loadEvents(). This prevents duplication and allows deleted Google Calendar events to disappear.
      
      await this.loadEvents();
      if (window.showToast) window.showToast(`Successfully synced ${json.events.length} events from Google Calendar!`, 'success');
      
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Failed to sync calendar: ' + err.message, 'error');
    }
  },


  renderList() {
    const list = document.getElementById('eventsList');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (this.events.length === 0) {
      list.innerHTML = '<div class="empty-state text-muted" style="text-align: center; padding: 40px;">No upcoming events.</div>';
      return;
    }

    this.events.forEach(ev => {
      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      
      const timeString = `${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      const dateString = start.toLocaleDateString();
      const isGCal = ev.source === 'Google Calendar' || (ev.title && ev.title.includes('Google Calendar'));
      const badge = isGCal ? '<span style="font-size:0.75rem; background:rgba(66,133,244,0.18); color:#60a5fa; border:1px solid rgba(66,133,244,0.35); border-radius:12px; padding:2px 8px; margin-left:8px; font-weight:500;">Google Calendar</span>' : '';

      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = `
        <div class="event-time">
          <span>${dateString}</span>
          <span>${timeString}</span>
        </div>
        <div class="event-details">
          <div class="event-title" style="display:flex; align-items:center;">${ev.title} ${badge}</div>
          <div class="event-desc">${ev.description || ''}</div>
        </div>
      `;
      if (!isGCal) {
        item.style.cursor = 'pointer';
        item.onclick = () => this.openEditModal(ev);
      }
      list.appendChild(item);
    });
  },

  openCreateModal() {
    window.novaCrud.open('Add Event', [
      { id: 'title', label: 'Event Title', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
      { id: 'start_time', label: 'Start Time', type: 'datetime-local', required: true },
      { id: 'end_time', label: 'End Time', type: 'datetime-local', required: true }
    ], async (values) => {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;
      const payload = {
        user_id: session.user.id,
        title: values.title,
        description: values.description
      };
      if (values.start_time) payload.start_time = new Date(values.start_time).toISOString();
      if (values.end_time) payload.end_time = new Date(values.end_time).toISOString();
      
      const { error } = await window.supabaseClient.from('calendar_events').insert(payload);
      if (error) {
        if (window.showToast) window.showToast('Failed to create event', 'error');
      } else {
        if (window.showToast) window.showToast('Event added', 'success');
        this.loadEvents();
        if (window.novaOverview?.loadOverview) {
          window.novaOverview.loadOverview();
        }
      }
    });
  },

  openEditModal(ev) {
    window.novaCrud.open('Edit Event', [
      { id: 'title', label: 'Event Title', required: true },
      { id: 'description', label: 'Description', type: 'textarea' },
      { id: 'start_time', label: 'Start Time', type: 'datetime-local', required: true },
      { id: 'end_time', label: 'End Time', type: 'datetime-local', required: true }
    ], async (values) => {
      const payload = {
        title: values.title,
        description: values.description
      };
      if (values.start_time) payload.start_time = new Date(values.start_time).toISOString();
      if (values.end_time) payload.end_time = new Date(values.end_time).toISOString();
      
      const { error } = await window.supabaseClient.from('calendar_events').update(payload).eq('id', ev.id);
      if (error) {
        if (window.showToast) window.showToast('Failed to update event', 'error');
      } else {
        if (window.showToast) window.showToast('Event updated', 'success');
        this.loadEvents();
        if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      }
    }, async () => {
      const { error } = await window.supabaseClient.from('calendar_events').delete().eq('id', ev.id);
      if (error) {
        if (window.showToast) window.showToast('Failed to delete event', 'error');
      } else {
        if (window.showToast) window.showToast('Event deleted', 'success');
        this.loadEvents();
        if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      }
    });

    // Populate fields
    setTimeout(() => {
      if (document.getElementById('title')) document.getElementById('title').value = ev.title || '';
      if (document.getElementById('description')) document.getElementById('description').value = ev.description || '';
      if (document.getElementById('start_time')) document.getElementById('start_time').value = new Date(new Date(ev.start_time).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      if (document.getElementById('end_time')) document.getElementById('end_time').value = new Date(new Date(ev.end_time).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    }, 50);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    for (let m of mutations) {
      if (m.target.id === 'viewContainer' && m.addedNodes.length > 0) {
        if (document.querySelector('.events-list')) {
          window.novaCalendar.loadEvents();
        }
      }
    }
  });
  const vc = document.getElementById('viewContainer');
  if (vc) observer.observe(vc, { childList: true });
});
