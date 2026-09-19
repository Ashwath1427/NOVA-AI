const supabaseUrl = 'https://tklgdluhwpxrvehkddjm.supabase.co'; // Replace with VITE_SUPABASE_URL from .env
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrbGdkbHVod3B4cnZlaGtkZGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mjk1NDgsImV4cCI6MjEwNTMwNTU0OH0.5pbzOWbFGugDNT6YkfV0ECkMhD05RlVMS0TT4dZzKog'; // Replace with VITE_SUPABASE_ANON_KEY from .env

// Prevent crash if not replaced yet during setup
let supabaseInstance;
if (supabaseUrl !== 'YOUR_SUPABASE_URL_HERE' && supabaseUrl.includes('supabase.co')) {
  supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
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

window.supabaseClient = supabaseInstance;
