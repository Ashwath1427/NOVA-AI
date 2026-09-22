// auth.js - Authentication handler for login.html & signup
document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const toggleAuthMode = document.getElementById('toggleAuthMode');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const nameGroup = document.getElementById('nameGroup');
  const authOptionsRow = document.getElementById('authOptionsRow');
  const signInBtn = document.getElementById('signInBtn');
  const switchAuthText = document.getElementById('switchAuthText');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const rememberMeCheckbox = document.getElementById('rememberMe');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  let isSignUp = false;

  // 1. Auto-redirect if already logged in and didn't explicitly log out
  const urlParams = new URLSearchParams(window.location.search);
  const isExplicitLogout = urlParams.get('logout') === 'true';
  const hasOnboardingParam = urlParams.get('onboarding') === 'true';

  if (!isExplicitLogout && !hasOnboardingParam && window.supabaseClient && window.supabaseClient.auth) {
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session) {
        window.location.href = window.novaPath('app.html');
        return;
      }
    } catch (e) {
      console.warn("Session check error:", e);
    }
  }

  // 2. Pre-fill remembered email and remember me preference
  const savedEmail = localStorage.getItem('nova_remembered_email');
  const savedRemember = localStorage.getItem('nova_remember_me');

  if (rememberMeCheckbox) {
    rememberMeCheckbox.checked = savedRemember !== 'false';
  }

  if (savedEmail && emailInput) {
    emailInput.value = savedEmail;
    // Auto-focus password so user can just enter password and hit Enter
    if (passwordInput) {
      setTimeout(() => {
        passwordInput.focus();
      }, 150);
    }
  }

  if (toggleAuthMode) {
    toggleAuthMode.addEventListener('click', (e) => {
      e.preventDefault();
      isSignUp = !isSignUp;
      
      if (isSignUp) {
        document.title = "Create your NOVA";
        if (authTitle) authTitle.textContent = "Create your NOVA";
        if (authSubtitle) authSubtitle.textContent = "Start building a more productive you.";
        if (nameGroup) nameGroup.style.display = "flex";
        if (authOptionsRow) authOptionsRow.style.display = "none";
        if (signInBtn) signInBtn.textContent = "Create account";
        if (switchAuthText) switchAuthText.textContent = "Already have an account?";
        toggleAuthMode.textContent = "Log in";
      } else {
        document.title = "Welcome back - NOVA";
        if (authTitle) authTitle.textContent = "Welcome back";
        if (authSubtitle) authSubtitle.textContent = "Your command center is waiting.";
        if (nameGroup) nameGroup.style.display = "none";
        if (authOptionsRow) authOptionsRow.style.display = "flex";
        if (signInBtn) signInBtn.textContent = "Log in";
        if (switchAuthText) switchAuthText.textContent = "Don't have an account?";
        toggleAuthMode.textContent = "Create one";
      }
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email')?.value?.trim();
      if (!email) {
        showToast("Please enter your email address first.", "error");
        return;
      }
      try {
        if (window.supabaseClient) {
          await window.supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.novaPath('login.html')
          });
        }
        showToast("Password reset link sent to your email!", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const fullName = document.getElementById('fullName')?.value?.trim();

      if (signInBtn) {
        signInBtn.disabled = true;
        signInBtn.textContent = isSignUp ? "Creating account..." : "Signing in...";
      }

      try {
        if (isSignUp) {
          // Sign Up
          const { data, error } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName || 'Ashwath' }
            }
          });
          if (error) throw error;

          // Handle Remember Me
          if (rememberMeCheckbox && rememberMeCheckbox.checked) {
            localStorage.setItem('nova_remembered_email', email);
            localStorage.setItem('nova_remember_me', 'true');
          } else {
            localStorage.removeItem('nova_remembered_email');
            localStorage.setItem('nova_remember_me', 'false');
          }

          // Save local profile info immediately
          localStorage.setItem('nova_user_profile', JSON.stringify({
            full_name: fullName || 'Ashwath',
            primary_goal: 'Work'
          }));

          showToast("Account created successfully! Redirecting...", "success");
          setTimeout(() => {
            window.location.href = window.novaPath('app.html');
          }, 1000);
        } else {
          // Sign In
          const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;

          // Handle Remember Me
          if (rememberMeCheckbox && rememberMeCheckbox.checked) {
            localStorage.setItem('nova_remembered_email', email);
            localStorage.setItem('nova_remember_me', 'true');
          } else {
            localStorage.removeItem('nova_remembered_email');
            localStorage.setItem('nova_remember_me', 'false');
          }

          const savedName = data.user?.user_metadata?.full_name || 'Ashwath';
          const localProfile = JSON.parse(localStorage.getItem('nova_user_profile') || '{}');
          localProfile.full_name = localProfile.full_name || savedName;
          localStorage.setItem('nova_user_profile', JSON.stringify(localProfile));

          showToast("Signed in successfully!", "success");
          window.location.href = window.novaPath('app.html');
        }
      } catch (err) {
        showToast(err.message || "An error occurred during authentication", "error");
        if (signInBtn) {
          signInBtn.disabled = false;
          signInBtn.textContent = isSignUp ? "Create account" : "Log in";
        }
      }
    });
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      try {
        const { error } = await window.supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.novaPath('app.html')
          }
        });
        if (error) throw error;
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }
});

// Toast System
function showToast(message, type = 'default') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}
window.showToast = showToast;
