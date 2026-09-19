// router.js
// Robust Client-Side Router for NOVA with Hash Navigation Support

document.addEventListener('DOMContentLoaded', () => {
  const viewContainer = document.getElementById('viewContainer');
  if (!viewContainer) return; // Not on the app page

  function loadView(route) {
    // Clear current view
    viewContainer.innerHTML = '';

    // Update active nav-item in sidebar
    document.querySelectorAll('.sidebar .nav-item').forEach(nav => {
      if (nav.getAttribute('data-route') === route) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });
    
    // Look for template
    const template = document.getElementById(`tpl-${route}`);
    
    if (template) {
      const clone = template.content.cloneNode(true);
      viewContainer.appendChild(clone);
      
      // Re-initialize icons for newly injected DOM
      if (window.lucide) {
        window.lucide.createIcons();
      }

      // Trigger module-specific loaders
      if (route === 'tasks' && window.novaTasks) window.novaTasks.loadTasks();
      if (route === 'projects' && window.novaProjects) window.novaProjects.loadProjects();
      if (route === 'notes' && window.novaNotes) window.novaNotes.loadNotes?.();
      if (route === 'habits' && window.novaHabits) window.novaHabits.loadHabits?.();
      if (route === 'calendar' && window.novaCalendar) window.novaCalendar.loadEvents?.();
      if (route === 'planner' && window.novaPlanner) window.novaPlanner.initPlanner();
      if (route === 'overview' && window.novaOverview) window.novaOverview.loadOverview();
      if (route === 'settings' && window.novaSettings) {
        if (window.novaSettings.initSettingsView) {
          window.novaSettings.initSettingsView();
        } else {
          window.novaSettings.loadProfile?.();
          window.novaSettings.loadIntegrations?.();
        }
      }
      if (route === 'credentials' && window.novaSettings) {
        window.novaSettings.loadCredentialsView?.();
      }
    } else {
      viewContainer.innerHTML = `
        <div class="view-header">
          <h1 style="text-transform: capitalize;">${route}</h1>
        </div>
        <div class="glass-panel" style="padding: 40px; text-align: center; border: 1px dashed var(--border-color);">
          <i data-lucide="wrench" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
          <h3 style="margin-bottom: 8px;">Coming Soon</h3>
          <p class="text-muted">The ${route} view is currently under development.</p>
        </div>
      `;
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }

  window.novaRouter = { loadView };

  // Use event delegation for ALL nav-item clicks (including dynamically placed ones)
  document.querySelector('.sidebar')?.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    
    e.preventDefault();
    const route = item.getAttribute('data-route');
    if (route) {
      window.location.hash = route;
      loadView(route);
    }
  });

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const hashRoute = window.location.hash.replace('#', '').split('?')[0];
    if (hashRoute) loadView(hashRoute);
  });

  // Initial load: prioritize hash route (e.g. #settings), fallback to overview
  const initialHash = window.location.hash.replace('#', '').split('?')[0];
  loadView(initialHash || 'overview');
});
