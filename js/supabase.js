const supabaseUrl = 'https://tklgdluhwpxrvehkddjm.supabase.co'; // Replace with VITE_SUPABASE_URL from .env
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrbGdkbHVod3B4cnZlaGtkZGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mjk1NDgsImV4cCI6MjEwNTMwNTU0OH0.5pbzOWbFGugDNT6YkfV0ECkMhD05RlVMS0TT4dZzKog'; // Replace with VITE_SUPABASE_ANON_KEY from .env

// Prevent crash if not replaced yet during setup
let supabaseInstance;
if (supabaseUrl !== 'YOUR_SUPABASE_URL_HERE' && supabaseUrl.includes('supabase.co')) {
  supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: window.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });
} else {
  console.warn("Supabase is not configured yet. Please configure the URL and Anon Key in js/supabase.js");
  // Mock client for UI work before backend is attached
  supabaseInstance = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signUp: async () => ({ data: {}, error: new Error("Supabase is not configured yet") }),
      signInWithPassword: async () => ({ data: {}, error: new Error("Supabase is not configured yet") }),
      signInWithOAuth: async () => ({ data: {}, error: new Error("Supabase is not configured yet") }),
      signOut: async () => ({ error: null })
    }
  };
}

window.NOVA_BASE_PATH = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : '/NOVA-AI';

window.novaPath = function(path) {
  return `${window.NOVA_BASE_PATH}/${path.replace(/^\/+/, '')}`;
};

window.supabaseClient = supabaseInstance;

// Global deactivation check on page load
(async function checkDeactivation() {
  if (window.location.pathname.includes('login.html')) return;
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) {
      const { data: subs } = await window.supabaseClient
        .from('subscriptions')
        .select('status')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);
        
      const sub = subs && subs.length > 0 ? subs[0] : null;
      if (sub && sub.status === 'deactivated') {
        // Create a polished full-screen overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(10, 10, 10, 0.85); backdrop-filter: blur(12px);
          z-index: 999999; display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: opacity 0.5s ease-in-out;
        `;
        
        const card = document.createElement('div');
        card.style.cssText = `
          background: #111; border: 1px solid #333; border-radius: 16px;
          padding: 40px; text-align: center; max-width: 400px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
          transform: translateY(20px); transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        
        card.innerHTML = `
          <div style="width: 64px; height: 64px; background: rgba(239, 68, 68, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style="color: white; font-size: 20px; font-weight: 600; margin-bottom: 12px; font-family: 'Inter', sans-serif;">Account Deactivated</h2>
          <p style="color: #9ca3af; font-size: 15px; line-height: 1.5; margin-bottom: 24px; font-family: 'Inter', sans-serif;">
            Your access to NOVA has been suspended. Please contact support to resolve this issue.
          </p>
          <div style="width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; margin: 0 auto; animation: spin 1s linear infinite;"></div>
          <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
        
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        
        // Animate in
        requestAnimationFrame(() => {
          overlay.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });

        // Wait 3 seconds, log out, and redirect
        setTimeout(async () => {
          window.isIntentionalLogout = true;
          await window.supabaseClient.auth.signOut();
          window.location.href = window.novaPath('login.html');
        }, 3000);
      }
    }
  } catch (err) {
    console.warn("Could not check deactivation status:", err);
  }
})();

// Listen for auth state changes (removed aggressive logout overlay to prevent unwanted logouts)
if (window.supabaseClient && window.supabaseClient.auth.onAuthStateChange) {
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    // Session is persisted automatically by supabase-js. We ignore SIGNED_OUT to avoid forcing a logout visually if the token temporarily expires.
  });
}
