// js/settings.js - NOVA Integrations & Settings Manager
// Strictly handles client-side UI, server communication with zero client-side token exposure.

window.novaSettings = {
  _currentIntegrations: {},
  _currentManagingProvider: null,

  /**
   * Initializes the settings view, checks OAuth redirects, loads integrations and profile.
   */
  async initSettingsView() {
    this.handleOAuthCallbackParams();
    await this.loadProfile();
    await this.loadSubscription();
    await this.loadIntegrations();
  },

  /**
   * Handles query params returned from OAuth callbacks
   */
  handleOAuthCallbackParams() {
    const searchParams = new URLSearchParams(window.location.search);
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const hashParams = new URLSearchParams(hashQuery);

    const successProvider = searchParams.get('integration_success') || hashParams.get('integration_success');
    const errorMessage = searchParams.get('integration_error') || hashParams.get('integration_error') || searchParams.get('error') || hashParams.get('error_description');

    if (successProvider) {
      if (successProvider === 'spotify') {
        if (window.showToast) {
          window.showToast("✓ Spotify Connected", "success");
        }
      } else if (successProvider === 'discord') {
        if (window.showToast) {
          window.showToast("✓ Discord Connected! Real-time alerts and messages active.", "success");
        }
      } else {
        const name = successProvider === 'google_calendar' ? 'Google Calendar' : successProvider;
        if (window.showToast) {
          window.showToast(`${name} connected successfully! Live data synced into NOVA context.`, "success");
        }
      }
      this.cleanUrlParams();
      this.loadIntegrations();
      if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      if (window.novaPlanner?.loadPlanner) window.novaPlanner.loadPlanner();
    } else if (errorMessage) {
      if (window.showToast) {
        window.showToast(`Integration error: ${decodeURIComponent(errorMessage)}`, "error");
      }
      this.cleanUrlParams();
    }
  },

  cleanUrlParams() {
    if (window.history && window.history.replaceState) {
      const cleanUrl = window.location.pathname + '#settings';
      window.history.replaceState({}, document.title, cleanUrl);
    }
  },

  /**
   * Helper to retrieve Supabase JWT bearer token for backend requests
   */
  async getAuthToken() {
    if (window.supabaseClient) {
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        return session?.access_token || null;
      } catch (e) {
        console.warn("Could not retrieve Supabase session token:", e);
      }
    }
    return null;
  },

  /**
   * Switch between Integrations and Profile tabs
   */
  switchTab(tabName, btn) {
    const tabIntegrations = document.getElementById('tabBtnIntegrations');
    const tabCredentials = document.getElementById('tabBtnCredentials');
    const tabSubscription = document.getElementById('tabBtnSubscription');
    const tabProfile = document.getElementById('tabBtnProfile');
    const secIntegrations = document.getElementById('settingsSectionIntegrations');
    const secCredentials = document.getElementById('settingsSectionCredentials');
    const secSubscription = document.getElementById('settingsSectionSubscription');
    const secProfile = document.getElementById('settingsSectionProfile');
    const breadcrumb = document.getElementById('settingsBreadcrumb');
    const title = document.getElementById('settingsTitle');
    const subtitle = document.getElementById('settingsSubtitle');

    tabIntegrations?.classList.remove('active');
    tabCredentials?.classList.remove('active');
    tabSubscription?.classList.remove('active');
    tabProfile?.classList.remove('active');

    if (secIntegrations) secIntegrations.style.display = 'none';
    if (secCredentials) secCredentials.style.display = 'none';
    if (secSubscription) secSubscription.style.display = 'none';
    if (secProfile) secProfile.style.display = 'none';

    if (tabName === 'integrations') {
      tabIntegrations?.classList.add('active');
      if (secIntegrations) secIntegrations.style.display = 'block';
      if (breadcrumb) breadcrumb.textContent = 'Integrations';
      if (title) title.textContent = 'Integrations';
      if (subtitle) subtitle.textContent = "Connect external services to empower NOVA's AI planning system with authorized real-time data.";
      this.loadIntegrations();
    } else if (tabName === 'credentials') {
      tabCredentials?.classList.add('active');
      if (secCredentials) secCredentials.style.display = 'block';
      if (breadcrumb) breadcrumb.textContent = 'API Credentials';
      if (title) title.textContent = 'API Keys & Developer Credentials';
      if (subtitle) subtitle.textContent = 'Configure personal API keys for Spotify, Discord, Gemini, and Google Calendar directly on your account.';
      this.loadCredentialsView();
    } else if (tabName === 'subscription') {
      tabSubscription?.classList.add('active');
      if (secSubscription) secSubscription.style.display = 'block';
      if (breadcrumb) breadcrumb.textContent = 'Subscription';
      if (title) title.textContent = 'Subscription Plan';
      if (subtitle) subtitle.textContent = 'View and manage your current NOVA entitlement.';
      this.loadSubscription();
    } else {
      tabProfile?.classList.add('active');
      if (secProfile) secProfile.style.display = 'block';
      if (breadcrumb) breadcrumb.textContent = 'Profile';
      if (title) title.textContent = 'User Profile';
      if (subtitle) subtitle.textContent = 'Manage your account name, preferences, and productivity objectives.';
      this.loadProfile();
    }
  },

  /**
   * Load the current subscription plan from the server
   */
  async loadSubscription() {
    const token = await this.getAuthToken();
    if (!token) return;
    try {
      const res = await fetch('/api/subscription', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 403) {
        const errData = await res.json();
        alert(errData.error || 'Your account has been deactivated. Please contact support.');
        await window.supabaseClient.auth.signOut();
        window.location.href = '/login.html';
        return;
      }
      const data = await res.json();
      if (data.success && data.plan) {
        window.currentPlan = data.plan;
        window.currentPlanDetails = data.details;

        // Reset all cards
        document.querySelectorAll('.plan-status').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.plan-upgrade-btn').forEach(btn => {
          btn.style.display = 'block';
          btn.textContent = 'Payments coming soon';
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-outline');
        });
        document.querySelectorAll('.connector-card').forEach(card => card.style.borderColor = 'var(--border-color)');

        // Highlight current plan
        const statusEl = document.getElementById(`plan-status-${data.plan}`);
        const cardEl = document.getElementById(`plan-card-${data.plan}`);
        const btnEl = document.getElementById(`plan-upgrade-${data.plan}`);

        if (statusEl) statusEl.style.display = 'block';
        if (cardEl) cardEl.style.borderColor = '#4ade80';
        if (btnEl) btnEl.style.display = 'none';

        // Apply visual feature locks
        if (window.novaSettings.applyFeatureLocks) {
          window.novaSettings.applyFeatureLocks();
        }
      }
    } catch (e) {
      console.warn("Failed to load subscription:", e);
    }
  },

  applyFeatureLocks() {
    if (window.currentPlanDetails && window.currentPlanDetails.features) {
      const features = window.currentPlanDetails.features;
      const lockCard = (provider, isUnlocked) => {
        const actionsEl = document.getElementById(`actions-${provider}`);
        const cardEl = document.getElementById(`card-${provider}`);
        if (actionsEl && cardEl) {
          if (!isUnlocked) {
            cardEl.style.opacity = '0.6';
            cardEl.style.pointerEvents = 'none';
            actionsEl.innerHTML = `<button class="btn btn-outline" style="flex:1; font-size: 0.85rem; border-color: #f59e0b; color: #f59e0b;" disabled><i data-lucide="lock" style="width:14px;height:14px;margin-right:6px;"></i>Upgrade to Unlock</button>`;
          } else {
            cardEl.style.opacity = '1';
            cardEl.style.pointerEvents = 'auto';
          }
        }
      };

      lockCard('gmail', features.gmail);
      lockCard('discord', features.discord);
      lockCard('instagram', features.instagram);
      
      if (window.lucide) window.lucide.createIcons();
    }
  },

  upgradePlan(plan) {
    if (window.showToast) window.showToast('Payments are coming soon. The current system uses manual entitlements via Supabase.', 'info');
  },

  /**
   * Load live integration statuses from the secure server endpoint
   */
  async loadIntegrations() {
    const token = await this.getAuthToken();
    if (!token) return;

    try {
      const res = await fetch('/api/integrations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.integrations) {
        this._currentIntegrations = {};
        data.integrations.forEach(item => {
          this._currentIntegrations[item.provider] = item;
          this.renderIntegrationCard(item);
        });
        
        // Reapply locks after rendering cards in case renderIntegrationCard overwrote them
        if (this.applyFeatureLocks) {
          this.applyFeatureLocks();
        }
      }
    } catch (err) {
      console.warn("Could not load integrations:", err.message);
    }
  },

  /**
   * Updates individual integration card UI
   */
  renderIntegrationCard(item) {
    const provider = item.provider;
    const isConnected = item.status === 'connected';
    const card = document.getElementById(`card-${provider}`);
    const statusEl = document.getElementById(`status-${provider}`);
    const actionsEl = document.getElementById(`actions-${provider}`);
    const togglesEl = document.getElementById(`toggles-${provider}`);
    const chkPlanning = document.getElementById(`chkPlanning-${provider}`);

    if (card) {
      if (isConnected) {
        card.style.borderColor = 'rgba(74, 222, 128, 0.35)';
        card.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3), 0 0 15px rgba(74, 222, 128, 0.08)';
      } else {
        card.style.borderColor = 'var(--border-color)';
        card.style.boxShadow = 'none';
      }
    }

    if (statusEl) {
      if (isConnected) {
        if (provider === 'spotify') {
          statusEl.style.color = '#1ed760';
          statusEl.innerHTML = `<span style="font-weight: 700; color: #1ed760; display: inline-flex; align-items: center; gap: 6px;">✓ Spotify Connected</span>`;
        } else if (provider === 'discord') {
          statusEl.style.color = '#5865F2';
          statusEl.innerHTML = `<span style="font-weight: 700; color: #818cf8; display: inline-flex; align-items: center; gap: 6px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#5865F2;box-shadow:0 0 6px #5865F2;"></span>Connected</span>`;
        } else {
          statusEl.style.color = '#4ade80';
          statusEl.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;margin-right:6px;box-shadow:0 0 6px #4ade80;"></span>Connected`;
        }
      } else {
        statusEl.style.color = 'var(--text-muted, #888)';
        statusEl.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#666;margin-right:6px;"></span>Not connected`;
      }
    }

    if (provider === 'spotify') {
      const capEl = document.getElementById('capabilities-spotify');
      if (capEl) {
        capEl.innerHTML = `<strong>Authorized capabilities:</strong> playback state, currently playing, top listening preferences`;
      }
    }

    if (togglesEl) {
      togglesEl.style.display = isConnected ? 'block' : 'none';
      if (chkPlanning) {
        chkPlanning.checked = item.settings?.use_for_planning !== false;
      }
    }

    if (actionsEl) {
      if (isConnected) {
        if (provider === 'discord') {
          actionsEl.innerHTML = `
            <button class="btn btn-primary" onclick="window.novaSettings.openDiscordDigest()" style="flex: 2; font-size: 0.82rem; background: #5865F2; border-color: #5865F2; color: #fff; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 5px;">
              <i data-lucide="bell" style="width:14px;height:14px;"></i> View Alerts & Messages
            </button>
            <button class="btn btn-secondary" onclick="window.novaSettings.openManageModal('${provider}')" style="font-size: 0.82rem; padding: 6px 10px; display: flex; align-items: center; justify-content: center;" title="Settings">
              <i data-lucide="sliders" style="width:13px;height:13px;"></i>
            </button>
            <button class="btn btn-outline" onclick="window.novaSettings.disconnectProvider('${provider}')" style="font-size: 0.82rem; padding: 6px 10px; border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.08); display: flex; align-items: center; justify-content: center;" title="Disconnect">
              <i data-lucide="unlink" style="width:13px;height:13px;"></i>
            </button>
          `;
        } else {
          actionsEl.innerHTML = `
            <button class="btn btn-secondary" onclick="window.novaSettings.openManageModal('${provider}')" style="flex: 1; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <i data-lucide="sliders" style="width:14px;height:14px;"></i> Manage
            </button>
            <button class="btn btn-outline" onclick="window.novaSettings.disconnectProvider('${provider}')" style="font-size: 0.85rem; border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.08); display: flex; align-items: center; justify-content: center; gap: 6px;">
              <i data-lucide="unlink" style="width:14px;height:14px;"></i> Disconnect
            </button>
          `;
        }
      } else {
        if (provider === 'google_calendar') {
          actionsEl.innerHTML = `
            <button class="btn btn-primary" onclick="window.novaSettings.openGCalModal()" style="flex: 1; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <i data-lucide="link" style="width:14px;height:14px;"></i> Connect
            </button>
          `;
        } else if (provider === 'spotify') {
          actionsEl.innerHTML = `
            <button class="btn btn-primary" onclick="window.novaSettings.openSpotifyModal()" style="flex: 1; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px; background: #1DB954; border-color: #1ed760; color: #000; font-weight: 600;">
              <i data-lucide="link" style="width:14px;height:14px;"></i> Connect Spotify
            </button>
          `;
        } else if (provider === 'discord') {
          actionsEl.innerHTML = `
            <button class="btn btn-primary" onclick="window.novaSettings.openDiscordModal()" style="flex: 1; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px; background: #5865F2; border-color: #5865F2; color: #fff; font-weight: 600;">
              <i data-lucide="link" style="width:14px;height:14px;"></i> Connect Discord
            </button>
          `;
        } else {
          actionsEl.innerHTML = `
            <button class="btn btn-outline" onclick="window.novaSettings.connectProvider('${provider}')" style="flex: 1; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <i data-lucide="link" style="width:14px;height:14px;"></i> Connect
            </button>
          `;
        }
      }
    }

    if (window.lucide) window.lucide.createIcons();
  },

  /**
   * Connect a provider via official OAuth or server configuration
   */
  async connectProvider(provider, forceOAuth = false) {
    if (provider === 'spotify' && !forceOAuth) {
      this.openSpotifyModal();
      return;
    }
    if (provider === 'google_calendar' && !forceOAuth) {
      this.openGCalModal();
      return;
    }

    const token = await this.getAuthToken();
    if (!token) {
      if (window.showToast) window.showToast("Please sign in to connect services", "error");
      return;
    }

    if (window.showToast) window.showToast(`Requesting authorization for ${provider}...`, "default");

    try {
      const res = await fetch(`/api/integrations/auth-url?provider=${encodeURIComponent(provider)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.configured && data.url) {
        // Redirect to official OAuth consent screen
        window.location.href = data.url;
      } else {
        if (provider === 'google_calendar') {
          this.openGCalModal();
        } else if (provider === 'spotify') {
          this.openSpotifyModal();
          const configArea = document.getElementById('spotifyConfigArea');
          if (configArea) configArea.classList.remove('hidden');
          if (window.showToast) {
            window.showToast("Spotify API keys not configured. Enter them above or use Method 2 / 3 below.", "default");
          }
        } else {
          if (window.showToast) {
            window.showToast(data.error || `${provider.toUpperCase()} client credentials not configured in server .env`, "default");
          }
        }
      }
    } catch (e) {
      if (window.showToast) window.showToast(`Failed to initiate ${provider} connection: ${e.message}`, "error");
    }
  },

  /**
   * Open the Spotify modal
   */
  openSpotifyModal() {
    const modal = document.getElementById('spotifyModal');
    if (modal) {
      modal.classList.remove('hidden');
      const btn = document.getElementById('btnConnectSpotifyOAuth');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.793-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.722 1.115.294.18.386.562.207.855zm1.226-2.723c-.226.367-.706.482-1.072.257-2.69-1.653-6.79-2.133-9.97-1.168-.413.125-.852-.108-.977-.522-.125-.413.108-.852.522-.977 3.633-1.103 8.148-.568 11.24 1.338.366.225.482.705.257 1.072zm.106-2.835C14.692 8.95 8.09 8.732 4.673 9.77c-.502.152-1.034-.132-1.186-.634-.153-.502.132-1.034.634-1.186 3.99-1.21 11.28-.96 15.02 1.26.452.268.6.852.332 1.304-.268.452-.852.6-1.304.332z"/></svg> Connect Spotify`;
      }
      if (window.lucide) window.lucide.createIcons();
    }
  },

  /**
   * Initiates official Spotify OAuth 2.0 PKCE flow
   */
  async startSpotifyOAuth() {
    const token = await this.getAuthToken();
    if (!token) {
      if (window.showToast) window.showToast("Please sign in to NOVA to connect Spotify", "error");
      return;
    }

    const btn = document.getElementById('btnConnectSpotifyOAuth');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #000;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;"></span> Connecting...`;
    }

    try {
      const res = await fetch('/api/integrations/auth-url?provider=spotify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok || !data.configured || !data.url) {
        throw new Error(data.error || "Spotify Client ID is not configured on the server. Please add SPOTIFY_CLIENT_ID to .env");
      }

      // Close modal before redirecting
      document.getElementById('spotifyModal')?.classList.add('hidden');

      // Redirect user directly to Spotify login/authorization page
      window.location.href = data.url;
    } catch (err) {
      if (window.showToast) {
        window.showToast(err.message, "error");
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.793-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.722 1.115.294.18.386.562.207.855zm1.226-2.723c-.226.367-.706.482-1.072.257-2.69-1.653-6.79-2.133-9.97-1.168-.413.125-.852-.108-.977-.522-.125-.413.108-.852.522-.977 3.633-1.103 8.148-.568 11.24 1.338.366.225.482.705.257 1.072zm.106-2.835C14.692 8.95 8.09 8.732 4.673 9.77c-.502.152-1.034-.132-1.186-.634-.153-.502.132-1.034.634-1.186 3.99-1.21 11.28-.96 15.02 1.26.452.268.6.852.332 1.304-.268.452-.852.6-1.304.332z"/></svg> Connect Spotify`;
      }
    }
  },

  /**
   * Open the Google Calendar modal (OAuth or private iCal option)
   */
  openGCalModal() {
    const modal = document.getElementById('gcalModal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }
  },

  /**
   * Connect Google Calendar via private secret iCal feed URL
   */
  async connectIcal() {
    const input = document.getElementById('gcalIcalInput');
    const url = input?.value?.trim();

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      if (window.showToast) window.showToast("Please enter a valid Google Calendar URL", "error");
      return;
    }

    const token = await this.getAuthToken();
    if (!token) return;

    if (window.showToast) window.showToast("Connecting and verifying Google Calendar feed...", "default");

    try {
      const res = await fetch('/api/integrations/connect-ical', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ icalUrl: url })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect iCal feed");

      document.getElementById('gcalModal')?.classList.add('hidden');
      if (input) input.value = '';

      if (window.showToast) {
        window.showToast(`Google Calendar connected! ${data.count} event(s) loaded into NOVA context.`, 'success');
      }

      await this.loadIntegrations();
      if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      if (window.novaCalendar?.loadEvents) window.novaCalendar.loadEvents();
    } catch (err) {
      if (window.showToast) window.showToast(err.message, "error");
    }
  },

  /**
   * Method 1: OAuth handler
   */
  connectGoogleOAuth() {
    this.connectProvider('google_calendar');
  },

  /**
   * Method 2: Sync iCal Feed helper
   */
  async syncIcalUrl(url) {
    const input = document.getElementById('gcalIcalInput');
    if (input && url && input.value !== url) {
      input.value = url;
    }
    await this.connectIcal();
  },

  /**
   * Method 3: Instant Live Sync helper for instant testing
   */
  async syncQuickLive() {
    const token = await this.getAuthToken();
    if (!token) {
      if (window.showToast) window.showToast("Please sign in to sync schedule", "error");
      return;
    }

    if (window.showToast) window.showToast("Syncing Google Calendar mockup schedule...", "default");

    try {
      const res = await fetch('/api/integrations/connect-demo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: 'google_calendar' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync schedule");

      document.getElementById('gcalModal')?.classList.add('hidden');

      if (window.showToast) {
        window.showToast("Google Calendar connected! Today's schedule synced into NOVA context.", "success");
      }

      await this.loadIntegrations();
      if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
      if (window.novaCalendar?.loadEvents) window.novaCalendar.loadEvents();
      if (window.novaPlanner?.loadPlanner) window.novaPlanner.loadPlanner();
    } catch (err) {
      if (window.showToast) window.showToast(err.message, "error");
    }
  },

  /**
   * Open the Discord modal
   */
  async openDiscordModal() {
    const modal = document.getElementById('discordModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const credsArea = document.getElementById('discordInlineCredsArea');
    const clientIdInput = document.getElementById('discordModalClientId');
    const clientSecretInput = document.getElementById('discordModalClientSecret');
    const botTokenInput = document.getElementById('discordModalBotToken');
    const btnOAuth = document.getElementById('btnConnectDiscordOAuth');

    try {
      const res = await fetch('/api/integrations/app-config');
      if (res.ok) {
        const data = await res.json();
        const disc = data.config?.discord;
        const isValidConfig = disc && disc.configured && disc.clientId && disc.clientId !== '123456789012345678';
        if (isValidConfig) {
          if (clientIdInput) clientIdInput.value = disc.clientId;
          if (clientSecretInput && disc.hasSecret) clientSecretInput.placeholder = '•••••••••••••••• (Configured)';
          if (botTokenInput && disc.hasBotToken) botTokenInput.placeholder = '•••••••••••••••• (Configured)';
          if (credsArea) credsArea.classList.add('hidden');
          if (btnOAuth) btnOAuth.style.display = 'flex';
        } else {
          // Open credentials setup area automatically if not configured
          if (credsArea) credsArea.classList.remove('hidden');
          if (clientIdInput && disc?.clientId && disc.clientId !== '123456789012345678') {
            clientIdInput.value = disc.clientId;
          }
        }
      }
    } catch (e) {
      if (credsArea) credsArea.classList.remove('hidden');
    }

    if (window.lucide) window.lucide.createIcons();
  },

  /**
   * Initiates Discord OAuth authorization flow
   */
  async startDiscordOAuth() {
    const token = await this.getAuthToken();
    if (!token) {
      if (window.showToast) window.showToast("Please sign in to connect Discord", "error");
      return;
    }

    const btn = document.getElementById('btnConnectDiscordOAuth');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;"></span> Checking application...`;
    }

    try {
      const res = await fetch('/api/integrations/auth-url?provider=discord', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok || !data.configured || !data.url) {
        const credsArea = document.getElementById('discordInlineCredsArea');
        if (credsArea) credsArea.classList.remove('hidden');
        throw new Error(data.error || "Please enter and save your Discord Application ID below first.");
      }

      document.getElementById('discordModal')?.classList.add('hidden');
      window.location.href = data.url;
    } catch (err) {
      if (window.showToast) window.showToast(err.message, "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg> Connect Discord (OAuth2)`;
      }
    }
  },

  /**
   * Save Discord credentials directly from inside the Discord modal
   */
  async saveDiscordInlineCredentials() {
    const clientId = document.getElementById('discordModalClientId')?.value?.trim();
    const clientSecret = document.getElementById('discordModalClientSecret')?.value?.trim();
    const botToken = document.getElementById('discordModalBotToken')?.value?.trim();

    if (!clientId) {
      if (window.showToast) window.showToast("Please enter your Discord Application / Client ID", "error");
      return;
    }

    const token = await this.getAuthToken();
    if (window.showToast) window.showToast("Validating Application ID with Discord...", "default");

    try {
      const res = await fetch('/api/integrations/set-credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'discord',
          clientId,
          clientSecret: clientSecret || undefined,
          botToken: botToken || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Discord credentials");

      if (window.showToast) window.showToast("Discord application verified & saved! Launching authorization...", "success");

      if (data.authUrl) {
        document.getElementById('discordModal')?.classList.add('hidden');
        window.location.href = data.authUrl;
      } else {
        await this.startDiscordOAuth();
      }
    } catch (e) {
      if (window.showToast) window.showToast(e.message, "error");
    }
  },

  /**
   * Instant sync for Discord mockup / preview
   */
  async syncDiscordQuickLive() {
    const token = await this.getAuthToken();
    if (!token) return;

    if (window.showToast) window.showToast("Connecting Discord alerts...", "default");

    try {
      const res = await fetch('/api/integrations/connect-demo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: 'discord' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect Discord");

      document.getElementById('discordModal')?.classList.add('hidden');
      if (window.showToast) window.showToast("Discord connected! Message digest & urgent alerts active.", "success");

      await this.loadIntegrations();
      if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
    } catch (err) {
      if (window.showToast) window.showToast(err.message, "error");
    }
  },

  /**
   * Open the developer credentials modal for manual configuration
   */
  async openCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.switchCredentialsTab('discord');
  },

  /**
   * Switch tabs inside credentials modal
   */
  switchCredentialsTab(provider) {
    const tabs = ['spotify', 'discord', 'instagram', 'google_calendar'];
    tabs.forEach(p => {
      const btn = document.getElementById(`tabBtn${p.charAt(0).toUpperCase() + p.slice(1)}`);
      const panel = document.getElementById(`panel${p.charAt(0).toUpperCase() + p.slice(1)}`);
      if (btn) {
        if (p === provider) {
          btn.style.background = '#6366f1';
          btn.style.color = '#fff';
          btn.style.fontWeight = '700';
        } else {
          btn.style.background = 'rgba(255,255,255,0.06)';
          btn.style.color = '#cbd5e1';
          btn.style.fontWeight = '400';
        }
      }
      if (panel) {
        if (p === provider) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }
    });
  },

  /**
   * Save credentials from the developer credentials modal
   */
  async saveCredentialsFromModal(provider) {
    const token = await this.getAuthToken();
    let payload = { provider };

    if (provider === 'spotify') {
      payload.clientId = document.getElementById('cfgSpotifyClientId')?.value?.trim();
    } else if (provider === 'discord') {
      payload.clientId = document.getElementById('cfgDiscordClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('cfgDiscordClientSecret')?.value?.trim();
      payload.botToken = document.getElementById('cfgDiscordBotToken')?.value?.trim();
    } else if (provider === 'instagram') {
      payload.clientId = document.getElementById('cfgInstagramClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('cfgInstagramClientSecret')?.value?.trim();
    } else if (provider === 'google_calendar') {
      payload.clientId = document.getElementById('cfgGoogleClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('cfgGoogleClientSecret')?.value?.trim();
    }

    if (!payload.clientId) {
      if (window.showToast) window.showToast(`Please enter a Client ID for ${provider}`, "error");
      return;
    }

    try {
      const res = await fetch('/api/integrations/set-credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to save ${provider} credentials`);

      if (window.showToast) window.showToast(`${provider} credentials saved!`, "success");
      document.getElementById('credentialsModal')?.classList.add('hidden');
      await this.loadIntegrations();
    } catch (e) {
      if (window.showToast) window.showToast(e.message, "error");
    }
  },

  /**
   * Open Manage Modal for a connected provider
   */
  openManageModal(provider) {
    this._currentManagingProvider = provider;
    const modal = document.getElementById('manageModal');
    const titleEl = document.getElementById('manageModalTitle');
    const iconEl = document.getElementById('manageModalIcon');
    const toggleEl = document.getElementById('manageModalPlanningToggle');
    const toggleLabel = document.getElementById('manageModalToggleLabel');
    const disconnectBtn = document.getElementById('manageModalDisconnectBtn');

    const providerNames = {
      google: 'Google Account',
      google_calendar: 'Google Calendar',
      gmail: 'Gmail',
      spotify: 'Spotify',
      discord: 'Discord',
      instagram: 'Instagram'
    };

    const providerIcons = {
      google: '🌐',
      google_calendar: '📅',
      gmail: '📧',
      spotify: '🎵',
      discord: '💬',
      instagram: '📸'
    };

    const name = providerNames[provider] || provider;
    if (titleEl) titleEl.textContent = `Manage ${name}`;
    if (iconEl) iconEl.textContent = providerIcons[provider] || '🔌';
    if (toggleLabel) toggleLabel.textContent = `Use ${name} for AI planning`;

    const current = this._currentIntegrations[provider];
    if (toggleEl) {
      toggleEl.checked = current?.settings?.use_for_planning !== false;
    }

    if (disconnectBtn) {
      disconnectBtn.onclick = () => {
        this.disconnectProvider(provider);
      };
    }

    if (modal) modal.classList.remove('hidden');
  },

  /**
   * Toggle permission to use the service in the AI planning context
   */
  async togglePlanningPermission(provider, isChecked) {
    const token = await this.getAuthToken();
    if (!token) return;

    try {
      const res = await fetch('/api/integrations/toggle', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider,
          settingKey: 'use_for_planning',
          settingValue: isChecked
        })
      });

      if (res.ok) {
        if (this._currentIntegrations[provider]) {
          this._currentIntegrations[provider].settings = this._currentIntegrations[provider].settings || {};
          this._currentIntegrations[provider].settings.use_for_planning = isChecked;
        }
        if (window.showToast) {
          const status = isChecked ? 'enabled for' : 'excluded from';
          window.showToast(`${provider} context ${status} AI planning`, 'default');
        }
      }
    } catch (e) {
      console.warn("Could not update planning toggle:", e);
    }
  },

  /**
   * Handler for toggle in the manage modal
   */
  toggleCurrentModalPlanning(isChecked) {
    if (this._currentManagingProvider) {
      this.togglePlanningPermission(this._currentManagingProvider, isChecked);
      const inlineChk = document.getElementById(`chkPlanning-${this._currentManagingProvider}`);
      if (inlineChk) inlineChk.checked = isChecked;
    }
  },

  /**
   * Disconnect integration
   */
  async disconnectProvider(provider) {
    const token = await this.getAuthToken();
    if (!token) return;

    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider })
      });

      if (res.ok) {
        document.getElementById('manageModal')?.classList.add('hidden');
        if (window.showToast) {
          window.showToast(`${provider} disconnected from NOVA`, 'default');
        }
        await this.loadIntegrations();
        if (window.novaOverview?.loadOverview) window.novaOverview.loadOverview();
        if (window.novaCalendar?.loadEvents) window.novaCalendar.loadEvents();
        if (window.novaPlanner?.loadPlanner) window.novaPlanner.loadPlanner();
      }
    } catch (e) {
      if (window.showToast) window.showToast(`Failed to disconnect: ${e.message}`, 'error');
    }
  },

  /**
   * Profile handling (persisted to Supabase and synced to sidebar)
   */
  async loadProfile() {
    const localProfile = JSON.parse(localStorage.getItem('nova_user_profile') || '{}');
    const nameEl = document.getElementById('settingsName');
    const goalEl = document.getElementById('settingsGoal');

    if (nameEl && localProfile.full_name !== undefined) nameEl.value = localProfile.full_name;
    if (goalEl && localProfile.primary_goal !== undefined) goalEl.value = localProfile.primary_goal;

    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    const topbarAvatar = document.getElementById('topbarAvatar');
    const name = localProfile.full_name || 'Ashwath';
    if (userNameEl) userNameEl.textContent = name;
    if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();
    if (topbarAvatar) topbarAvatar.textContent = name.charAt(0).toUpperCase();

    if (!window.supabaseClient) return;
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return;

      const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        if (nameEl) nameEl.value = profile.full_name || '';
        if (goalEl) goalEl.value = profile.primary_goal || 'Work';
        if (userNameEl && profile.full_name) userNameEl.textContent = profile.full_name;
        if (userAvatarEl && profile.full_name) userAvatarEl.textContent = profile.full_name.charAt(0).toUpperCase();
        if (topbarAvatar && profile.full_name) topbarAvatar.textContent = profile.full_name.charAt(0).toUpperCase();
        localStorage.setItem('nova_user_profile', JSON.stringify(profile));
      }
    } catch (err) {
      console.warn('Could not sync profile with Supabase:', err);
    }
  },

  async saveProfile() {
    const name = document.getElementById('settingsName')?.value?.trim() || 'Ashwath';
    const goal = document.getElementById('settingsGoal')?.value || 'Work';

    const localProfile = JSON.parse(localStorage.getItem('nova_user_profile') || '{}');
    localProfile.full_name = name;
    localProfile.primary_goal = goal;
    localStorage.setItem('nova_user_profile', JSON.stringify(localProfile));

    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    const topbarAvatar = document.getElementById('topbarAvatar');
    if (userNameEl) userNameEl.textContent = name;
    if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();
    if (topbarAvatar) topbarAvatar.textContent = name.charAt(0).toUpperCase();

    if (window.supabaseClient) {
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
          await window.supabaseClient
            .from('profiles')
            .upsert({ id: session.user.id, full_name: name, primary_goal: goal, updated_at: new Date().toISOString() });
        }
      } catch (err) {
        console.warn('Could not save to Supabase:', err);
      }
    }

    if (window.showToast) {
      window.showToast('Profile updated successfully!', 'success');
    }
  },

  /**
   * Universal App Credentials Manager
   */
  async openCredentialsModal(initialTab = 'spotify') {
    const modal = document.getElementById('credentialsModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    this.switchCredentialsTab(initialTab);

    // Fetch current public config status to pre-populate inputs
    try {
      const token = await this.getAuthToken();
      const res = await fetch('/api/integrations/app-config', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const resData = await res.json();
        const config = resData.config || resData;
        
        // Spotify
        const spInput = document.getElementById('cfgSpotifyClientId');
        if (spInput && config.spotify?.clientId) spInput.value = config.spotify.clientId;

        // Discord
        const dcClient = document.getElementById('cfgDiscordClientId');
        const dcSecret = document.getElementById('cfgDiscordClientSecret');
        const dcBot = document.getElementById('cfgDiscordBotToken');
        const dcModalClient = document.getElementById('discordModalClientId');
        if (dcClient && config.discord?.clientId) {
          dcClient.value = config.discord.clientId;
          if (dcModalClient) dcModalClient.value = config.discord.clientId;
        }
        if (dcSecret && config.discord?.hasSecret) {
          dcSecret.placeholder = "•••••••• (configured on server)";
        }
        if (dcBot && config.discord?.hasBotToken) {
          dcBot.placeholder = "•••••••• (bot token configured)";
        }

        // Instagram
        const igClient = document.getElementById('cfgInstagramClientId');
        const igSecret = document.getElementById('cfgInstagramClientSecret');
        if (igClient && config.instagram?.clientId) igClient.value = config.instagram.clientId;
        if (igSecret && config.instagram?.hasSecret) igSecret.placeholder = "•••••••• (configured on server)";

        // Google Calendar
        const gClient = document.getElementById('cfgGoogleClientId');
        const gSecret = document.getElementById('cfgGoogleClientSecret');
        if (gClient && config.google_calendar?.clientId) gClient.value = config.google_calendar.clientId;
        if (gSecret && config.google_calendar?.hasSecret) gSecret.placeholder = "•••••••• (configured on server)";
      }
    } catch (e) {
      console.warn("Could not prefill credentials modal:", e);
    }
  },

  switchCredentialsTab(provider) {
    const tabs = {
      spotify: { btn: 'tabBtnSpotify', panel: 'panelSpotify', bg: '#1DB954', color: '#000' },
      discord: { btn: 'tabBtnDiscord', panel: 'panelDiscord', bg: '#5865F2', color: '#fff' },
      instagram: { btn: 'tabBtnInstagram', panel: 'panelInstagram', bg: 'linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)', color: '#fff' },
      google_calendar: { btn: 'tabBtnGoogle', panel: 'panelGoogle', bg: '#4285F4', color: '#fff' }
    };

    Object.entries(tabs).forEach(([p, cfg]) => {
      const btn = document.getElementById(cfg.btn);
      const panel = document.getElementById(cfg.panel);
      if (p === provider) {
        if (panel) panel.classList.remove('hidden');
        if (btn) {
          btn.style.background = cfg.bg;
          btn.style.color = cfg.color;
          btn.style.fontWeight = '700';
        }
      } else {
        if (panel) panel.classList.add('hidden');
        if (btn) {
          btn.style.background = 'rgba(255,255,255,0.06)';
          btn.style.color = '#cbd5e1';
          btn.style.fontWeight = 'normal';
        }
      }
    });
  },

  async saveCredentialsFromModal(provider) {
    let clientId = '';
    let clientSecret = '';
    let botToken = '';

    if (provider === 'spotify') {
      clientId = document.getElementById('cfgSpotifyClientId')?.value?.trim();
    } else if (provider === 'discord') {
      clientId = document.getElementById('cfgDiscordClientId')?.value?.trim();
      clientSecret = document.getElementById('cfgDiscordClientSecret')?.value?.trim();
      botToken = document.getElementById('cfgDiscordBotToken')?.value?.trim();
    } else if (provider === 'instagram') {
      clientId = document.getElementById('cfgInstagramClientId')?.value?.trim();
      clientSecret = document.getElementById('cfgInstagramClientSecret')?.value?.trim();
    } else if (provider === 'google_calendar') {
      clientId = document.getElementById('cfgGoogleClientId')?.value?.trim();
      clientSecret = document.getElementById('cfgGoogleClientSecret')?.value?.trim();
    }

    if (!clientId && !clientSecret && !botToken) {
      if (window.showToast) window.showToast("Please enter at least a Client ID or token", "error");
      return;
    }

    const token = await this.getAuthToken();
    try {
      const res = await fetch('/api/integrations/set-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          provider,
          clientId,
          clientSecret,
          botToken
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save credentials");

      if (window.showToast) {
        const pName = provider === 'google_calendar' ? 'Google Calendar' : provider.charAt(0).toUpperCase() + provider.slice(1);
        window.showToast(`✓ ${pName} credentials saved & activated immediately!`, 'success');
      }

      // Close modal and refresh integrations
      document.getElementById('credentialsModal')?.classList.add('hidden');
      await this.loadIntegrations();
    } catch (err) {
      if (window.showToast) window.showToast(`Error saving credentials: ${err.message}`, 'error');
    }
  },

  /**
   * Discord Modal & Actions
   */
  openDiscordModal() {
    const modal = document.getElementById('discordModal');
    if (modal) {
      modal.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }
  },

  async saveDiscordInlineCredentials() {
    const clientId = document.getElementById('discordModalClientId')?.value?.trim();
    const clientSecret = document.getElementById('discordModalClientSecret')?.value?.trim();

    if (!clientId) {
      if (window.showToast) window.showToast("Please enter Discord Client ID", "error");
      return;
    }

    const token = await this.getAuthToken();
    try {
      const res = await fetch('/api/integrations/set-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          provider: 'discord',
          clientId,
          clientSecret
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save credentials");

      if (window.showToast) window.showToast("✓ Discord Client ID configured!", "success");
      document.getElementById('discordInlineCredsArea')?.classList.add('hidden');
    } catch (err) {
      if (window.showToast) window.showToast(`Error: ${err.message}`, "error");
    }
  },

  async startDiscordOAuth() {
    const token = await this.getAuthToken();
    if (!token) {
      if (window.showToast) window.showToast("Please sign in to connect Discord", "error");
      return;
    }

    const btn = document.getElementById('btnConnectDiscordOAuth');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;"></span> Connecting Discord...`;
    }

    try {
      const res = await fetch('/api/integrations/auth-url?provider=discord', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok || !data.configured || !data.url) {
        throw new Error(data.error || "Discord Client ID not configured. Open App Credentials to set it up.");
      }

      document.getElementById('discordModal')?.classList.add('hidden');
      window.location.href = data.url;
    } catch (err) {
      if (window.showToast) window.showToast(err.message, "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Connect Discord (OAuth2)`;
      }
      // Reveal inline config if missing
      document.getElementById('discordInlineCredsArea')?.classList.remove('hidden');
    }
  },

  async syncDiscordQuickLive() {
    const token = await this.getAuthToken();
    if (!token) {
      if (window.showToast) window.showToast("Please sign in to sync Discord", "error");
      return;
    }

    if (window.showToast) window.showToast("Connecting Discord & fetching live channel messages...", "default");

    try {
      const res = await fetch('/api/integrations/connect-demo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: 'discord' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync Discord");

      document.getElementById('discordModal')?.classList.add('hidden');

      if (window.showToast) {
        window.showToast("Discord connected! Incoming messages triaged into NOVA context.", "success");
      }

      await this.loadIntegrations();
      // Open the digest modal so user directly sees what messages they got and what to be worried about!
      this.openDiscordDigest();
    } catch (err) {
      if (window.showToast) window.showToast(err.message, "error");
    }
  },

  async openDiscordDigest() {
    const modal = document.getElementById('discordDigestModal');
    if (modal) {
      modal.classList.remove('hidden');
      await this.loadDiscordDigest();
      if (window.lucide) window.lucide.createIcons();
    }
  },

  async loadDiscordDigest() {
    const worriedContainer = document.getElementById('discordWorriedAboutContainer');
    const msgContainer = document.getElementById('discordMessagesContainer');
    const badge = document.getElementById('discordMessageCountBadge');

    if (worriedContainer) {
      worriedContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px;">Analyzing urgency and scanning alerts...</div>`;
    }
    if (msgContainer) {
      msgContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px;">Loading incoming messages...</div>`;
    }

    try {
      const token = await this.getAuthToken();
      const res = await fetch('/api/integrations/discord/digest', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (badge) {
        badge.textContent = `${data.count || 0} messages synced`;
      }

      // Render Worried About list
      if (worriedContainer) {
        if (!data.worriedAbout || data.worriedAbout.length === 0) {
          worriedContainer.innerHTML = `
            <div style="font-size: 0.85rem; color: #4ade80; padding: 6px 0;">
              ✓ You are all caught up! No high-urgency alerts or imminent deadlines detected.
            </div>
          `;
        } else {
          worriedContainer.innerHTML = data.worriedAbout.map(item => {
            const channelText = item.channel || item.channelName || 'general';
            const senderText = item.sender || item.author || 'Member';
            const timeText = item.time || item.timestamp || '';
            const actionText = item.actionRequired || item.action || 'Take immediate action on this item.';
            const serverText = item.server ? `<span style="font-size: 0.75rem; color: #94a3b8; font-weight: 500;">${item.server} • </span>` : '';

            return `
              <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 10px; padding: 13px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="background: #ef4444; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 6px; letter-spacing: 0.02em;">
                      ${item.badge || '🔴 URGENT'}
                    </span>
                    <span style="font-size: 0.8rem; color: #cbd5e1; font-family: monospace; font-weight: 600;">${channelText}</span>
                  </div>
                  <span style="font-size: 0.75rem; color: #94a3b8;">${serverText}${senderText}${timeText ? ' • ' + timeText : ''}</span>
                </div>
                <div style="font-weight: 700; font-size: 0.92rem; color: #f8fafc; line-height: 1.35;">
                  ${item.title || item.summary}
                </div>
                ${item.summary && item.summary !== item.title ? `<div style="font-size: 0.82rem; color: #cbd5e1; line-height: 1.45;">${item.summary}</div>` : ''}
                <div style="margin-top: 4px; padding: 8px 12px; background: rgba(0,0,0,0.35); border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.82rem; color: #fca5a5; display: flex; align-items: center; gap: 6px;">
                  <strong>Action:</strong> <span>${actionText}</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // Render Messages list
      if (msgContainer) {
        if (!data.messages || data.messages.length === 0) {
          msgContainer.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-muted); padding: 8px;">No Discord messages recorded yet.</div>`;
        } else {
          msgContainer.innerHTML = data.messages.map(msg => {
            const isHigh = msg.urgency?.toLowerCase() === 'high';
            const isMedium = msg.urgency?.toLowerCase() === 'medium';
            const sender = msg.author || msg.sender || 'Discord User';
            const channel = msg.channelName || msg.channel || 'general';
            const server = msg.serverName || msg.server || '';
            const time = msg.timestamp || msg.time || '';

            let borderColor = 'rgba(255, 255, 255, 0.08)';
            let badgeBg = 'rgba(255, 255, 255, 0.06)';
            let badgeColor = '#94a3b8';
            let badgeText = '🟢 General';

            if (isHigh) {
              borderColor = 'rgba(239, 68, 68, 0.4)';
              badgeBg = 'rgba(239, 68, 68, 0.15)';
              badgeColor = '#ef4444';
              badgeText = '🔴 High Urgency';
            } else if (isMedium) {
              borderColor = 'rgba(245, 158, 11, 0.4)';
              badgeBg = 'rgba(245, 158, 11, 0.15)';
              badgeColor = '#f59e0b';
              badgeText = '🟡 Action Required';
            }

            return `
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid ${borderColor}; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 600; font-size: 0.88rem; color: #f1f5f9;">${sender}</span>
                    <span style="font-size: 0.76rem; color: #818cf8; background: rgba(88, 101, 242, 0.15); padding: 2px 7px; border-radius: 4px; font-family: monospace;">${channel}</span>
                    ${server ? `<span style="font-size: 0.72rem; color: #64748b;">(${server})</span>` : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.72rem; color: ${badgeColor}; background: ${badgeBg}; font-weight: 700; padding: 2px 6px; border-radius: 4px;">${badgeText}</span>
                    <span style="font-size: 0.72rem; color: #64748b;">${time}</span>
                  </div>
                </div>
                <p style="margin: 0; font-size: 0.84rem; color: #cbd5e1; line-height: 1.45;">
                  ${msg.content}
                </p>
              </div>
            `;
          }).join('');
        }
      }
    } catch (err) {
      if (worriedContainer) worriedContainer.innerHTML = `<div style="color: #ef4444; font-size: 0.82rem;">Could not load alert triage: ${err.message}</div>`;
      if (msgContainer) msgContainer.innerHTML = `<div style="color: #ef4444; font-size: 0.82rem;">Could not load messages: ${err.message}</div>`;
    }
  },

  /**
   * Submit and sync an incoming Discord message or DM directly into NOVA triage
   */
  async submitDiscordQuickLog() {
    const sender = document.getElementById('discordLogSender')?.value?.trim() || 'sa1ch_aran';
    const channel = document.getElementById('discordLogChannel')?.value?.trim() || '@sa1ch_aran';
    const content = document.getElementById('discordLogContent')?.value?.trim();

    if (!content) {
      if (window.showToast) window.showToast("Please enter message content", "error");
      return;
    }

    try {
      const token = await this.getAuthToken();
      const res = await fetch('/api/integrations/discord/sync-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          author: sender,
          channelName: channel,
          serverName: 'Direct Message',
          content,
          isMention: true
        })
      });

      if (!res.ok) throw new Error("Failed to sync message");
      if (window.showToast) window.showToast("Message synced and triaged into NOVA!", "success");

      // Clear form and hide
      const contentEl = document.getElementById('discordLogContent');
      if (contentEl) contentEl.value = '';
      document.getElementById('discordQuickLogArea')?.classList.add('hidden');

      // Reload digest
      await this.loadDiscordDigest();
    } catch (e) {
      if (window.showToast) window.showToast(e.message, "error");
    }
  },

  /**
   * Helper to open the credentials view
   */
  openCredentialsModal() {
    this.switchTab('credentials');
  },

  /**
   * Load and populate per-user developer credentials in UI
   */
  async loadCredentialsView() {
    try {
      const token = await this.getAuthToken();
      const res = await fetch('/api/integrations/user-credentials', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const creds = data.credentials || {};

      // 1. Spotify
      const sp = creds.spotify || {};
      const devSpId = document.getElementById('devSpotifyClientId');
      const pageSpId = document.getElementById('pageSpotifyClientId');
      if (devSpId && sp.clientId) devSpId.value = sp.clientId;
      if (pageSpId && sp.clientId) pageSpId.value = sp.clientId;

      const devSpSec = document.getElementById('devSpotifyClientSecret');
      const pageSpSec = document.getElementById('pageSpotifyClientSecret');
      if (devSpSec && sp.hasSecret) devSpSec.placeholder = sp.maskedSecret || '••••••••••••';
      if (pageSpSec && sp.hasSecret) pageSpSec.placeholder = sp.maskedSecret || '••••••••••••';

      const badgeSp = document.getElementById('badgeSpotifyStatus');
      const badgeSpPage = document.getElementById('badgeSpotifyStatusPage');
      if (badgeSp) {
        badgeSp.innerHTML = sp.configured ? '<span style="color:#4ade80;">● Configured</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }
      if (badgeSpPage) {
        badgeSpPage.innerHTML = sp.configured ? '<span style="color:#4ade80;">● Configured</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }

      // 2. Discord
      const dc = creds.discord || {};
      const devDcId = document.getElementById('devDiscordClientId');
      const pageDcId = document.getElementById('pageDiscordClientId');
      if (devDcId && dc.clientId) devDcId.value = dc.clientId;
      if (pageDcId && dc.clientId) pageDcId.value = dc.clientId;

      const devDcSec = document.getElementById('devDiscordClientSecret');
      const pageDcSec = document.getElementById('pageDiscordClientSecret');
      if (devDcSec && dc.hasSecret) devDcSec.placeholder = dc.maskedSecret || '••••••••••••';
      if (pageDcSec && dc.hasSecret) pageDcSec.placeholder = dc.maskedSecret || '••••••••••••';

      const devDcBot = document.getElementById('devDiscordBotToken');
      const pageDcBot = document.getElementById('pageDiscordBotToken');
      if (devDcBot && dc.hasBotToken) devDcBot.placeholder = dc.maskedBotToken || '••••••••••••';
      if (pageDcBot && dc.hasBotToken) pageDcBot.placeholder = dc.maskedBotToken || '••••••••••••';

      const badgeDc = document.getElementById('badgeDiscordStatus');
      const badgeDcPage = document.getElementById('badgeDiscordStatusPage');
      if (badgeDc) {
        badgeDc.innerHTML = dc.configured ? '<span style="color:#4ade80;">● Configured</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }
      if (badgeDcPage) {
        badgeDcPage.innerHTML = dc.configured ? '<span style="color:#4ade80;">● Configured</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }

      // 3. Gemini
      const gm = creds.gemini || {};
      const devGmKey = document.getElementById('devGeminiApiKey');
      const pageGmKey = document.getElementById('pageGeminiApiKey');
      if (devGmKey && gm.hasKey) devGmKey.placeholder = gm.maskedKey || '••••••••••••';
      if (pageGmKey && gm.hasKey) pageGmKey.placeholder = gm.maskedKey || '••••••••••••';

      const badgeGm = document.getElementById('badgeGeminiStatus');
      const badgeGmPage = document.getElementById('badgeGeminiStatusPage');
      if (badgeGm) {
        badgeGm.innerHTML = gm.configured ? '<span style="color:#4ade80;">● Active</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }
      if (badgeGmPage) {
        badgeGmPage.innerHTML = gm.configured ? '<span style="color:#4ade80;">● Active</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }

      // 4. Google Calendar & iCal
      const gc = creds.google_calendar || {};
      const devGcIcal = document.getElementById('devGcalIcalUrl');
      const pageGcIcal = document.getElementById('pageGcalIcalUrl');
      if (devGcIcal && gc.icalUrl) devGcIcal.value = gc.icalUrl;
      if (pageGcIcal && gc.icalUrl) pageGcIcal.value = gc.icalUrl;

      const devGcId = document.getElementById('devGoogleClientId');
      const pageGcId = document.getElementById('pageGoogleClientId');
      if (devGcId && gc.clientId) devGcId.value = gc.clientId;
      if (pageGcId && gc.clientId) pageGcId.value = gc.clientId;

      const badgeGc = document.getElementById('badgeGcalStatus');
      const badgeGcPage = document.getElementById('badgeGcalStatusPage');
      if (badgeGc) {
        badgeGc.innerHTML = gc.configured ? '<span style="color:#4ade80;">● Connected</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }
      if (badgeGcPage) {
        badgeGcPage.innerHTML = gc.configured ? '<span style="color:#4ade80;">● Connected</span>' : '<span style="color:#94a3b8;">○ Not Configured</span>';
      }

      // 5. Instagram
      const ig = creds.instagram || {};
      const devIgId = document.getElementById('devInstagramClientId');
      const pageIgId = document.getElementById('pageInstagramClientId');
      if (devIgId && ig.clientId) devIgId.value = ig.clientId;
      if (pageIgId && ig.clientId) pageIgId.value = ig.clientId;

      const devIgSec = document.getElementById('devInstagramClientSecret');
      const pageIgSec = document.getElementById('pageInstagramClientSecret');
      if (devIgSec && ig.hasSecret) devIgSec.placeholder = ig.maskedSecret || '••••••••••••';
      if (pageIgSec && ig.hasSecret) pageIgSec.placeholder = ig.maskedSecret || '••••••••••••';

      const badgeIg = document.getElementById('badgeInstagramStatus');
      const badgeIgPage = document.getElementById('badgeInstagramStatusPage');
      if (badgeIg) {
        badgeIg.innerHTML = ig.configured ? '<span style="color:#4ade80;">● Configured</span>' : '<span style="color:#94a3b8;">○ Optional</span>';
      }
      if (badgeIgPage) {
        badgeIgPage.innerHTML = ig.configured ? '<span style="color:#4ade80;">● Configured</span>' : '<span style="color:#94a3b8;">○ Optional</span>';
      }

      if (window.lucide) window.lucide.createIcons();

      // Ensure locks are applied after rendering the cards
      if (window.novaSettings.applyFeatureLocks) {
        window.novaSettings.applyFeatureLocks();
      }
    } catch (err) {
      console.warn("Could not load integrations:", err.message);
    }
  },

  /**
   * Save developer credentials from the Settings Tab
   */
  async saveDevCredentials(provider) {
    let payload = { provider };
    let providerName = provider;

    if (provider === 'spotify') {
      providerName = 'Spotify';
      payload.clientId = document.getElementById('devSpotifyClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('devSpotifyClientSecret')?.value?.trim();
    } else if (provider === 'discord') {
      providerName = 'Discord';
      payload.clientId = document.getElementById('devDiscordClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('devDiscordClientSecret')?.value?.trim();
      payload.botToken = document.getElementById('devDiscordBotToken')?.value?.trim();
    } else if (provider === 'gemini') {
      providerName = 'Gemini AI';
      payload.apiKey = document.getElementById('devGeminiApiKey')?.value?.trim();
    } else if (provider === 'google_calendar') {
      providerName = 'Google Calendar';
      payload.icalUrl = document.getElementById('devGcalIcalUrl')?.value?.trim();
      payload.clientId = document.getElementById('devGoogleClientId')?.value?.trim();
    } else if (provider === 'instagram') {
      providerName = 'Instagram';
      payload.clientId = document.getElementById('devInstagramClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('devInstagramClientSecret')?.value?.trim();
    }

    await this._submitCredentials(payload, providerName);
  },

  /**
   * Save developer credentials from the direct #credentials page route
   */
  async saveDevCredentialsPage(provider) {
    let payload = { provider };
    let providerName = provider;

    if (provider === 'spotify') {
      providerName = 'Spotify';
      payload.clientId = document.getElementById('pageSpotifyClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('pageSpotifyClientSecret')?.value?.trim();
    } else if (provider === 'discord') {
      providerName = 'Discord';
      payload.clientId = document.getElementById('pageDiscordClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('pageDiscordClientSecret')?.value?.trim();
      payload.botToken = document.getElementById('pageDiscordBotToken')?.value?.trim();
    } else if (provider === 'gemini') {
      providerName = 'Gemini AI';
      payload.apiKey = document.getElementById('pageGeminiApiKey')?.value?.trim();
    } else if (provider === 'google_calendar') {
      providerName = 'Google Calendar';
      payload.icalUrl = document.getElementById('pageGcalIcalUrl')?.value?.trim();
      payload.clientId = document.getElementById('pageGoogleClientId')?.value?.trim();
    } else if (provider === 'instagram') {
      providerName = 'Instagram';
      payload.clientId = document.getElementById('pageInstagramClientId')?.value?.trim();
      payload.clientSecret = document.getElementById('pageInstagramClientSecret')?.value?.trim();
    }

    await this._submitCredentials(payload, providerName);
  },

  /**
   * Submit credentials payload to server and refresh state
   */
  async _submitCredentials(payload, providerName) {
    try {
      const token = await this.getAuthToken();
      const res = await fetch('/api/integrations/set-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to save ${providerName} credentials`);
      }

      if (window.showToast) {
        window.showToast(`✓ ${providerName} credentials saved and activated!`, "success");
      }

      await this.loadCredentialsView();
      await this.loadIntegrations();
    } catch (err) {
      if (window.showToast) {
        window.showToast(err.message, "error");
      }
    }
  }
};
