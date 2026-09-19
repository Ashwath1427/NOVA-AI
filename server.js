import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

import crypto from 'crypto';
import { googleCalendar } from './server/integrations/google-calendar.js';
import { gmail } from './server/integrations/gmail.js';
import { spotify } from './server/integrations/spotify.js';
import { discord } from './server/integrations/discord.js';
import { instagram } from './server/integrations/instagram.js';
import { IntegrationsStore } from './server/integrations-store.js';
import { ContextEngine } from './server/context-engine.js';
import { pkceSessionStore } from './server/pkce-session-store.js';
import { PlannerEngine } from './server/planner-engine.js';
import { EntitlementsService } from './server/entitlements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const integrationsStore = new IntegrationsStore(supabaseAdmin);
const entitlementsService = new EntitlementsService(supabaseAdmin);
const contextEngine = new ContextEngine(supabaseAdmin, integrationsStore, entitlementsService);
const plannerEngine = new PlannerEngine(contextEngine, GEMINI_API_KEY, entitlementsService);

// Helper to authenticate request using Supabase JWT (with localhost dev fallback)
async function authenticateUser(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Please log in." });
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Unauthorized: " + (error?.message || "Invalid session") });
      return null;
    }
    req.user = user;
    req.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    return user;
  } catch (e) {
    res.status(401).json({ error: "Authentication failed: " + e.message });
    return null;
  }
}

// ============================================================
// SUBSCRIPTIONS API
// ============================================================

app.get('/api/subscription', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;
  try {
    const planData = await entitlementsService.getUserPlan(user.id, req.supabase);
    res.json({ success: true, plan: planData.plan, details: planData.details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// INTEGRATIONS API LAYER
// ============================================================

// 1. List user integrations (Credentials stripped!)
app.get('/api/integrations', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const list = integrationsStore.list(user.id);
    res.json({ success: true, integrations: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get OAuth Authorization URL
app.get('/api/integrations/auth-url', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const { provider } = req.query;
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const state = JSON.stringify({ userId: user.id, provider });

  try {
    const hasFeature = await entitlementsService.checkFeature(user.id, provider);
    if (!hasFeature) {
      return res.json({ configured: false, error: `The ${provider} integration is not available on your current plan.` });
    }

    if (provider === 'google_calendar') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return res.json({
          configured: false,
          error: "GOOGLE_CLIENT_ID is not configured in server .env. You can connect via Google Calendar private iCal feed URL below."
        });
      }
      const url = googleCalendar.getAuthUrl({ clientId, redirectUri, state });
      return res.json({ configured: true, url });
    }
    else if (provider === 'gmail') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return res.json({
          configured: false,
          error: "GOOGLE_CLIENT_ID is not configured in server .env."
        });
      }
      const url = gmail.getAuthUrl({ clientId, redirectUri, state });
      return res.json({ configured: true, url });
    }
    else if (provider === 'spotify') {
      const userCreds = integrationsStore.getUserCredentials(user.id, 'spotify');
      const clientId = userCreds.clientId || process.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        return res.json({
          configured: false,
          error: "Spotify Client ID is not configured. Please enter your Spotify Client ID in the API Credentials tab."
        });
      }

      // Generate cryptographically secure CSRF state token
      const state = crypto.randomBytes(24).toString('hex');
      // Generate PKCE code_verifier (32 random bytes -> 43 characters base64url)
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      // Compute SHA-256 code_challenge
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      // Save to server-side PKCE session store
      pkceSessionStore.set(state, {
        userId: user.id,
        codeVerifier,
        clientId,
        clientSecret: userCreds.clientSecret || process.env.SPOTIFY_CLIENT_SECRET,
        provider: 'spotify'
      });

      const redirectUri = userCreds.redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/spotify-callback';
      const url = spotify.getAuthUrl({
        clientId,
        state,
        codeChallenge,
        redirectUri
      });

      return res.json({
        configured: true,
        url,
        clientId
      });
    }
    else if (provider === 'discord') {
      const userDiscord = integrationsStore.getUserCredentials(user.id, 'discord');
      const dcClientId = userDiscord.clientId || process.env.DISCORD_CLIENT_ID;
      if (!dcClientId) {
        return res.json({
          configured: false,
          error: "Discord Application / Client ID is not configured. Please add it in the API Credentials tab."
        });
      }
      const discordRedirect = userDiscord.redirectUri || process.env.DISCORD_REDIRECT_URI || 'http://127.0.0.1:3000/discord-callback';
      const url = discord.getAuthUrl({ clientId: dcClientId, redirectUri: discordRedirect, state });
      return res.json({ configured: true, url, clientId: dcClientId });
    }
    else if (provider === 'instagram') {
      const userIg = integrationsStore.getUserCredentials(user.id, 'instagram');
      const igId = userIg.clientId || process.env.INSTAGRAM_CLIENT_ID;
      if (!igId) {
        return res.json({ configured: false, error: "INSTAGRAM_CLIENT_ID is not configured. Please add it in the API Credentials tab." });
      }
      const url = instagram.getAuthUrl({ redirectUri, state });
      return res.json({ configured: true, url });
    }

    res.status(400).json({ error: "Unknown provider: " + provider });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. OAuth Callback Handler
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/app.html#settings?error=${encodeURIComponent(error)}`);
  }

  try {
    let stateObj = {};
    try { stateObj = JSON.parse(state); } catch(e) {}

    const userId = stateObj.userId;
    const provider = stateObj.provider || 'google_calendar';
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    const tokens = await googleCalendar.exchangeCodeForTokens({
      code,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    });

    integrationsStore.save(userId, provider, {
      status: 'connected',
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      credentials: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      },
      settings: { use_for_planning: true }
    });

    res.redirect(`/app.html#settings?integration_success=${provider}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`/app.html#settings?integration_error=${encodeURIComponent(err.message)}`);
  }
});

// 3.5 Spotify OAuth 2.0 with PKCE Callback Handler (http://127.0.0.1:3000/spotify-callback)
async function handleSpotifyCallback(req, res) {
  const { code, state, error, error_description } = req.query;

  // Handle authorization denial or cancellation
  if (error) {
    console.warn("Spotify authorization denied or failed:", error, error_description);
    const errMsg = error_description || (error === 'access_denied' ? 'Spotify authorization was cancelled or denied.' : error);
    return res.redirect(`/app.html#settings?integration_error=${encodeURIComponent(errMsg)}`);
  }

  // State / CSRF verification
  if (!state) {
    return res.redirect(`/app.html#settings?integration_error=${encodeURIComponent('Missing OAuth state parameter.')}`);
  }

  // Atomically take and invalidate the PKCE session
  const session = pkceSessionStore.take(state);
  if (!session) {
    return res.redirect(`/app.html#settings?integration_error=${encodeURIComponent('Security verification failed: OAuth state is invalid or has expired.')}`);
  }

  if (!code) {
    return res.redirect(`/app.html#settings?integration_error=${encodeURIComponent('Missing authorization code from Spotify.')}`);
  }

  try {
    const userSpotify = integrationsStore.getUserCredentials(session.userId, 'spotify');
    const redirectUri = userSpotify.redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/spotify-callback';
    const tokens = await spotify.exchangePkceCodeForTokens({
      clientId: session.clientId || userSpotify.clientId,
      clientSecret: session.clientSecret || userSpotify.clientSecret,
      code,
      codeVerifier: session.codeVerifier,
      redirectUri
    });

    integrationsStore.save(session.userId, 'spotify', {
      status: 'connected',
      scopes: tokens.scope ? tokens.scope.split(' ') : spotify.scopes,
      credentials: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      },
      settings: { use_for_planning: true },
      connectedAt: new Date().toISOString()
    });

    res.redirect(`/app.html#settings?integration_success=spotify`);
  } catch (err) {
    console.error("Spotify PKCE token exchange error:", err);
    res.redirect(`/app.html#settings?integration_error=${encodeURIComponent('Spotify token exchange failed: ' + err.message)}`);
  }
}

app.get('/spotify-callback', handleSpotifyCallback);
app.get('/api/auth/spotify/callback', handleSpotifyCallback);

// 3.6 Discord OAuth2 Callback Handler (http://127.0.0.1:3000/discord-callback)
async function handleDiscordCallback(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.warn("Discord authorization denied or failed:", error, error_description);
    return res.redirect(`/app.html#settings?integration_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`/app.html#settings?integration_error=Missing%20authorization%20code%20from%20Discord`);
  }

  let userId = 'current_user';
  try {
    const parsed = JSON.parse(state);
    userId = parsed.userId || userId;
  } catch(e) {
    userId = state || userId;
  }

  try {
    const userDiscord = integrationsStore.getUserCredentials(userId, 'discord');
    const redirectUri = userDiscord.redirectUri || process.env.DISCORD_REDIRECT_URI || 'http://127.0.0.1:3000/discord-callback';
    const tokens = await discord.exchangeCodeForTokens({
      clientId: userDiscord.clientId || process.env.DISCORD_CLIENT_ID,
      clientSecret: userDiscord.clientSecret || process.env.DISCORD_CLIENT_SECRET,
      code,
      redirectUri
    });

    integrationsStore.save(userId, 'discord', {
      status: 'connected',
      scopes: tokens.scope ? tokens.scope.split(' ') : discord.scopes,
      credentials: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      },
      settings: { use_for_planning: true },
      connectedAt: new Date().toISOString()
    });

    res.redirect(`/app.html#settings?integration_success=discord`);
  } catch (err) {
    console.error("Discord token exchange error:", err);
    res.redirect(`/app.html#settings?integration_error=${encodeURIComponent('Discord connection failed: ' + err.message)}`);
  }
}

app.get('/discord-callback', handleDiscordCallback);
app.get('/api/auth/discord/callback', handleDiscordCallback);

// 4. Connect Private iCal Feed URL for Google Calendar
app.post('/api/integrations/connect-ical', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const { icalUrl } = req.body;
  if (!icalUrl || !icalUrl.trim()) {
    return res.status(400).json({ error: "Valid iCal URL is required" });
  }

  try {
    // Validate by fetching today's events
    const testEvents = await googleCalendar.fetchIcalEvents(icalUrl);

    integrationsStore.save(user.id, 'google_calendar', {
      status: 'connected',
      scopes: ['ical_sync'],
      credentials: { icalUrl: icalUrl.trim() },
      settings: { use_for_planning: true }
    });

    res.json({ success: true, count: testEvents.length, message: "Google Calendar connected via private iCal feed" });
  } catch (err) {
    res.status(400).json({ error: "Failed to connect iCal feed: " + err.message });
  }
});

// 4.5 Connect Instant Live Sync Demo Schedule for Google Calendar / Discord
app.post('/api/integrations/connect-demo', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const { provider } = req.body;
  const targetProvider = provider || 'google_calendar';

  integrationsStore.save(user.id, targetProvider, {
    status: 'connected',
    scopes: ['quick_demo_sync'],
    credentials: { demo: true },
    settings: { use_for_planning: true }
  });

  res.json({ success: true, message: `${targetProvider} connected via Instant Live Sync!` });
});

// 4.6 Get Public App Credentials Configuration (Zero secrets exposed)
// 4.6 Get Server & Per-User Integration Credentials (Secrets properly masked)
app.get('/api/integrations/app-config', async (req, res) => {
  let userId = 'default_user';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) userId = data.user.id;
    } catch (e) {}
  }
  const creds = integrationsStore.getAllUserCredentials(userId);
  res.json({
    success: true,
    config: creds,
    credentials: creds
  });
});

app.get('/api/integrations/user-credentials', async (req, res) => {
  let userId = 'default_user';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) userId = data.user.id;
    } catch (e) {}
  }
  const creds = integrationsStore.getAllUserCredentials(userId);
  res.json({
    success: true,
    credentials: creds
  });
});

// 4.7 Configure API Client Credentials into per-user store and server runtime
app.post('/api/integrations/set-credentials', async (req, res) => {
  let user = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data } = await supabaseAdmin.auth.getUser(token);
      user = data?.user;
    } catch (e) {}
  }
  if (!user && (req.hostname === 'localhost' || req.hostname === '127.0.0.1')) {
    user = { id: 'default_user', email: 'admin@localhost' };
  }
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Sign in required to configure credentials." });
  }

  const { provider, clientId, clientSecret, botToken, apiKey, icalUrl } = req.body;
  if (!provider) {
    return res.status(400).json({ error: "Provider is required." });
  }

  // Pre-validate Discord application if clientId is provided
  if (provider === 'discord' && clientId) {
    const trimmedId = clientId.trim();
    const verification = await discord.verifyApplication(trimmedId);
    if (!verification.valid) {
      return res.status(400).json({
        error: "Unknown Application: The Discord Application ID (" + trimmedId + ") was not found on Discord. Please make sure you copied the Application ID (not bot user ID) from https://discord.com/developers/applications."
      });
    }
  }

  // Save into per-user persistent credentials store
  const savedCreds = integrationsStore.saveUserCredentials(user.id, provider, {
    clientId,
    clientSecret,
    botToken,
    apiKey,
    icalUrl
  });

  const upper = provider.toUpperCase();
  if (clientId) process.env[`${upper}_CLIENT_ID`] = clientId.trim();
  if (clientSecret) process.env[`${upper}_CLIENT_SECRET`] = clientSecret.trim();
  if (botToken) process.env[`${upper}_BOT_TOKEN`] = botToken.trim();
  if (provider === 'gemini' && apiKey) {
    process.env.GEMINI_API_KEY = apiKey.trim();
    if (plannerEngine) plannerEngine.geminiApiKey = apiKey.trim();
  }
  if (provider === 'google_calendar' && icalUrl) {
    integrationsStore.save(user.id, 'google_calendar', {
      status: 'connected',
      scopes: ['ical_sync'],
      credentials: { icalUrl: icalUrl.trim() }
    });
  }

  // Also persist to .env file as fallback
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    const updateOrAppend = (key, val) => {
      if (!val) return;
      if (envContent.includes(`${key}=`)) {
        envContent = envContent.replace(new RegExp(`${key}=.*`), `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };

    if (clientId) updateOrAppend(`${upper}_CLIENT_ID`, clientId.trim());
    if (clientSecret) updateOrAppend(`${upper}_CLIENT_SECRET`, clientSecret.trim());
    if (botToken) updateOrAppend(`${upper}_BOT_TOKEN`, botToken.trim());
    if (provider === 'gemini' && apiKey) updateOrAppend('GEMINI_API_KEY', apiKey.trim());

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
  } catch (err) {
    console.warn("Could not write to .env file:", err.message);
  }

  let authUrl = null;
  if (provider === 'discord' && discord.isConfigured()) {
    const discordRedirect = process.env.DISCORD_REDIRECT_URI || 'http://127.0.0.1:3000/discord-callback';
    const oauthState = JSON.stringify({ userId: user.id, provider: 'discord' });
    authUrl = discord.getAuthUrl({ redirectUri: discordRedirect, state: oauthState });
  }

  const updatedConfig = integrationsStore.getAllUserCredentials(user.id);

  res.json({
    success: true,
    message: `${provider.replace('_', ' ')} credentials saved successfully for your account!`,
    credentials: updatedConfig[provider],
    authUrl
  });
});

// 5. Get Google Calendar Events for NOVA Calendar & Overview Display (Zero tokens exposed)
app.get('/api/integrations/google-calendar/events', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const timeRange = {
      start: now.toISOString(),
      end: thirtyDaysFromNow.toISOString()
    };
    
    const events = await contextEngine.get_calendar_context(user.id, {}, null, timeRange);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.5 Get Spotify Context (Real Currently Playing track & Top Listening Preferences)
app.get('/api/integrations/spotify/context', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const audioContext = await spotify.fetchContext({
      userId: user.id,
      integrationsStore
    });
    res.json({ success: true, audioContext });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.6 Get Discord Message Digest & Urgent Alerts Triage
app.get('/api/integrations/discord/digest', async (req, res) => {
  let userId = 'default_user';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) userId = user.id;
    } catch (e) {}
  }

  try {
    const discordRecord = integrationsStore.get(userId, 'discord');
    const digest = await discord.fetchContext({
      accessToken: discordRecord?.credentials?.accessToken,
      credentials: discordRecord?.credentials,
      userId
    });
    res.json({
      success: true,
      digest,
      count: digest.unreadMessagesCount || digest.messages?.length || 0,
      worriedAbout: digest.worriedAbout || [],
      messages: digest.messages || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.7 Ingest / Sync Incoming Discord Message or Direct Message
app.post('/api/integrations/discord/sync-message', async (req, res) => {
  let userId = 'default_user';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) userId = user.id;
    } catch (e) {}
  }

  const { content, author, channelName, serverName, timestamp, isMention } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const newMsg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    serverName: serverName || 'Direct Message',
    channelName: channelName || '@sa1ch_aran',
    author: author || 'sa1ch_aran',
    content: content.trim(),
    summary: `${author || 'sa1ch_aran'}: ${content.trim().slice(0, 80)}`,
    timestamp: timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMention: isMention !== undefined ? !!isMention : true
  };

  discord.syncMessage(userId, newMsg);
  if (userId !== 'default_user') {
    discord.syncMessage('default_user', newMsg);
  }

  res.json({ success: true, message: newMsg });
});

// 6. Toggle Integration Settings (e.g. use_for_planning)
app.post('/api/integrations/toggle', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const { provider, settingKey, settingValue } = req.body;
  if (!provider || !settingKey) {
    return res.status(400).json({ error: "provider and settingKey are required" });
  }

  try {
    const updated = integrationsStore.toggleSetting(user.id, provider, settingKey, settingValue);
    res.json({ success: true, settings: updated?.settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Disconnect Integration
app.post('/api/integrations/disconnect', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const { provider } = req.body;
  if (!provider) {
    return res.status(400).json({ error: "provider is required" });
  }

  try {
    integrationsStore.disconnect(user.id, provider);
    res.json({ success: true, message: `Disconnected ${provider}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Normalized Context for AI Planner (Zero secrets!)
app.get('/api/context/planning', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const context = await contextEngine.get_full_planning_context(user.id, {}, req.supabase || supabaseAdmin);
    res.json({ success: true, context });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PLANNER ENGINE API (One-Click Day Execution)
// ============================================================

// 8.1 Get today's plan & compact summary metrics
app.get('/api/planner/today', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const result = await plannerEngine.getTodayPlan(user.id, req.supabase || supabaseAdmin);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8.2 One-click plan generation with deterministic validation (Idempotent)
app.post('/api/planner/generate', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const force = req.body?.force === true;
    const plan = await plannerEngine.generateDailyPlan(user.id, req.supabase || supabaseAdmin, { force });
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8.3 Dynamic replanning for missed tasks or remaining hours
app.post('/api/planner/replan', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  try {
    const updatedPlan = await plannerEngine.replanRemainingDay(user.id, req.supabase || supabaseAdmin, req.body || {});
    res.json({ success: true, plan: updatedPlan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8.4 Update block status (and sync with Supabase tasks table if completed)
app.post('/api/planner/block-action', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const { blockId, status, taskId } = req.body;
  if (!blockId || !status) {
    return res.status(400).json({ error: "blockId and status are required" });
  }

  try {
    const result = await plannerEngine.updateBlockAction(user.id, req.supabase || supabaseAdmin, { blockId, status, taskId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// AI ENGINE WITH NORMALIZED CONTEXT INJECTION
// ============================================================

const systemPrompt = `You are NOVA, the user's advanced AI executive assistant and personal productivity copilot.
You have direct, real-time access to the user's authorized external integrations and real context, including:
1. Google Calendar: Real meetings, tuitions, classes, and daily schedules.
2. Spotify: The user's active connected playlist, real track names, artists, durations, and categorized workout & focus vibes.
3. Tasks & Projects: Active priorities, deadlines, and deliverables.
4. Discord: Real-time server messages, urgent mentions, and academic/project pings ("discordAlerts.worriedAbout" and "discordAlerts.messages").

CRITICAL BEHAVIOR:
- DISCORD MESSAGES & WHAT TO BE WORRIED ABOUT:
  Whenever the user asks about Discord, messages they received, unread alerts, or what they should be worried about:
  Look directly at "discordAlerts" in REAL USER CONTEXT below.
  1. Clearly tell them: "Here are the messages you received on Discord:"
  2. Highlight "What you should be worried about": Call out high-urgency deadlines, exam changes, or time-sensitive mentions (e.g., assignment submissions due tonight, team requests, quiz announcements).
  3. Offer clear action items to mitigate the worry (e.g., "Would you like me to schedule a focus block at 8 PM to finish the Calculus assignment?").

- WORKOUT & SONG PLANNING:
  Whenever the user asks to plan a workout, workout songs, exercise routine, or daily schedule with music:
  Look directly at "audioContext" in REAL USER CONTEXT below.
  The user has connected their real Spotify playlist (titled in "audioContext.activePlaylist").
  Structure a complete, motivating, high-energy workout plan tailored to their goals, explicitly assigning their real Spotify tracks to each phase:
  1. Phase 1: Dynamic Warmup & Pre-Workout Mobility (5-10 min) -> Assign tracks like "Irumudi Kattu", "Mallepoola Pallaki", or "Monica".
  2. Phase 2: Peak Intensity, PR Push & Heavy Sets (20-30 min) -> Assign high-intensity tracks like "On The Floor", "Starboy", "Raga of Revenge", or "Jamaican (Bam Bam)".
  3. Phase 3: Accessory Lifts, Conditioning & Core -> Assign tracks like "Chikiri Chikiri", "Finding Her", or "Chuttamalle".
  4. Phase 4: Cooldown, Deep Stretching & Recovery (5-10 min) -> Assign calming tracks like "Sunflower", "Die With A Smile", or "Sailor Song".
  List the exact exercises, sets, reps, and matching songs with timing!

- DAILY SCHEDULE & CALENDAR:
  Whenever the user asks about their calendar, schedule, meetings, tuition, or time:
  Directly reference their connected Google Calendar events (e.g., Math Tuition, NOVA Project Review, Family Time) with exact times from "calendar".

- MUSIC & PLAYLIST RECOMMENDATIONS:
  Whenever the user asks about their playlist, songs, or what to listen to while working or coding NOVA:
  Directly reference the actual tracks from their connected Spotify playlist ("audioContext.activePlaylist.tracks") and explain why it fits their current workflow.

- NEVER say "I don't have direct access to your local music library or streaming apps". You DO have direct authorized access to their connected Spotify playlist, Google Calendar, and Discord.
- Keep your tone sharp, motivating, executive-level, and concise.`;

app.post('/api/ai', async (req, res) => {
  try {
    const user = await authenticateUser(req, res);
    if (!user) return;

    const { prompt, history } = req.body;

    // Always inject the user's authorized real context (Google Calendar, Spotify, Tasks, Projects)
    let planningContextStr = '';
    try {
      const normContext = await contextEngine.get_full_planning_context(user.id);
      planningContextStr = `\n\nREAL USER CONTEXT (Authorized & Normalized Real-Time Data):\n${JSON.stringify(normContext, null, 2)}`;
    } catch (err) {
      console.warn("Could not retrieve context for AI prompt:", err.message);
    }

    const contents = [];
    if (history && history.length > 0) contents.push(...history);
    contents.push({ role: "user", parts: [{ text: prompt + planningContextStr }] });

    const geminiPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: contents
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    const geminiData = await response.json();
    if (geminiData.error) throw new Error(geminiData.error.message);

    const candidate = geminiData.candidates?.[0];
    let replyText = "";
    if (candidate && candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) replyText += part.text;
      }
    }

    res.json({ reply: replyText });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

const PORT = 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`NOVA local server running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log("Shutting down");
  server.close();
  process.exit(0);
});
