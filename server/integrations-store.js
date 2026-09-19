// server/integrations-store.js
// Server-side persistent storage for user integrations
// Ensures sensitive OAuth tokens are stored safely on the server and NEVER exposed to the frontend.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'integrations.json');
const USER_CREDS_FILE = path.join(DATA_DIR, 'user_credentials.json');

function maskSecret(secret) {
  if (!secret) return '';
  if (secret.length <= 6) return '••••••';
  return '••••••••' + secret.slice(-4);
}

export class IntegrationsStore {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.memoryStore = new Map();
    this.initFileStore();
  }

  initFileStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(FILE_PATH)) {
        const raw = fs.readFileSync(FILE_PATH, 'utf-8');
        const data = JSON.parse(raw || '{}');
        for (const [key, val] of Object.entries(data)) {
          this.memoryStore.set(key, val);
        }
      }
    } catch (e) {
      console.warn("Could not initialize file store for integrations:", e.message);
    }
  }

  saveToFile() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj = {};
      for (const [k, v] of this.memoryStore.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not persist integrations to disk:", e.message);
    }
  }

  getKey(userId, provider) {
    return `${userId}:${provider}`;
  }

  /**
   * Returns list of integrations for a user, with ALL credentials stripped out for security.
   */
  list(userId) {
    const list = [];
    const providers = ['google', 'google_calendar', 'gmail', 'spotify', 'discord', 'instagram'];

    for (const p of providers) {
      const rec = this.get(userId, p);
      if (rec) {
        list.push({
          provider: rec.provider,
          status: rec.status || 'disconnected',
          scopes: rec.scopes || [],
          settings: rec.settings || { use_for_planning: true },
          last_synced_at: rec.last_synced_at || null,
          created_at: rec.created_at,
          updated_at: rec.updated_at
        });
      } else {
        list.push({
          provider: p,
          status: 'disconnected',
          scopes: [],
          settings: { use_for_planning: true },
          last_synced_at: null
        });
      }
    }
    return list;
  }

  get(userId, provider) {
    const direct = this.memoryStore.get(this.getKey(userId, provider));
    if (direct && direct.status === 'connected' && (direct.credentials?.accessToken || direct.credentials?.icalUrl)) {
      return direct;
    }
    if (direct && direct.status === 'connected') {
      return direct;
    }
    return null;
  }

  save(userId, provider, { status = 'connected', scopes = [], credentials = {}, settings = { use_for_planning: true } }) {
    const key = this.getKey(userId, provider);
    const existing = this.memoryStore.get(key) || {};

    const record = {
      userId,
      provider,
      status,
      scopes: scopes.length > 0 ? scopes : (existing.scopes || []),
      credentials: {
        ...(existing.credentials || {}),
        ...credentials
      },
      settings: {
        ...(existing.settings || {}),
        ...settings
      },
      last_synced_at: new Date().toISOString(),
      created_at: existing.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.memoryStore.set(key, record);
    this.saveToFile();

    // Also attempt Supabase upsert asynchronously if table exists
    if (this.supabase) {
      try {
        Promise.resolve(
          this.supabase.from('integrations').upsert({
            user_id: userId,
            provider,
            status,
            scopes: record.scopes,
            settings: { ...record.settings, last_synced_at: record.last_synced_at },
            updated_at: record.updated_at
          })
        ).then(({ error }) => {
          if (error) console.warn("Supabase integrations upsert warning:", error.message);
        }).catch(err => {
          console.warn("Supabase integrations upsert error:", err?.message || err);
        });
      } catch (err) {
        console.warn("Supabase integrations upsert call error:", err.message);
      }
    }

    return record;
  }

  toggleSetting(userId, provider, settingKey, settingValue) {
    const rec = this.get(userId, provider);
    if (!rec) return null;
    rec.settings = rec.settings || {};
    rec.settings[settingKey] = settingValue;
    rec.updated_at = new Date().toISOString();
    this.memoryStore.set(this.getKey(userId, provider), rec);
    this.saveToFile();
    return rec;
  }

  disconnect(userId, provider) {
    const key = this.getKey(userId, provider);
    const rec = this.memoryStore.get(key);
    if (rec) {
      rec.status = 'disconnected';
      rec.credentials = {};
      rec.updated_at = new Date().toISOString();
      this.memoryStore.set(key, rec);
      this.saveToFile();
    }
    return { success: true };
  }

  /**
   * Reads stored credentials for a user and provider from Supabase (falls back to process.env)
   */
  async getUserCredentials(userId, provider) {
    try {
      if (this.supabase && userId) {
        const { data, error } = await this.supabase
          .from('user_dev_credentials')
          .select('credentials')
          .eq('user_id', userId)
          .eq('provider', provider)
          .single();
        if (!error && data && data.credentials) {
          return data.credentials;
        }
      }
    } catch (e) {
      console.warn("Could not read user credentials from Supabase:", e.message);
    }
    // Fallback: try local JSON file (for local dev)
    try {
      if (fs.existsSync(USER_CREDS_FILE)) {
        const raw = fs.readFileSync(USER_CREDS_FILE, 'utf-8');
        const all = JSON.parse(raw || '{}');
        const userCreds = (userId && all[userId] && all[userId][provider]) ? all[userId][provider] : null;
        if (userCreds) return userCreds;
        const defaultCreds = (all['default_user'] && all['default_user'][provider]) ? all['default_user'][provider] : null;
        if (defaultCreds) return defaultCreds;
      }
    } catch (e) {
      console.warn("Could not read user credentials file:", e.message);
    }
    return {};
  }

  /**
   * Saves credentials specifically for this user into Supabase (and local file as fallback)
   */
  async saveUserCredentials(userId, provider, creds = {}) {
    // Clean the creds - remove masked/empty values
    const cleanCreds = {};
    for (const [k, val] of Object.entries(creds)) {
      if (val !== undefined && val !== null && val !== '' && !String(val).startsWith('••••')) {
        cleanCreds[k] = String(val).trim();
      }
    }

    // Save to Supabase
    try {
      if (this.supabase && userId && userId !== 'default_user') {
        // First get existing credentials to merge
        const { data: existing } = await this.supabase
          .from('user_dev_credentials')
          .select('credentials')
          .eq('user_id', userId)
          .eq('provider', provider)
          .single();

        const mergedCreds = { ...(existing?.credentials || {}), ...cleanCreds };

        await this.supabase
          .from('user_dev_credentials')
          .upsert({
            user_id: userId,
            provider,
            credentials: mergedCreds,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,provider' });

        return mergedCreds;
      }
    } catch (e) {
      console.warn("Could not save user credentials to Supabase:", e.message);
    }

    // Fallback: save to local JSON file (for local dev)
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      let all = {};
      if (fs.existsSync(USER_CREDS_FILE)) {
        try {
          all = JSON.parse(fs.readFileSync(USER_CREDS_FILE, 'utf-8') || '{}');
        } catch (e) {}
      }
      const key = userId || 'default_user';
      if (!all[key]) all[key] = {};
      if (!all[key][provider]) all[key][provider] = {};

      for (const [k, val] of Object.entries(cleanCreds)) {
        all[key][provider][k] = val;
      }
      fs.writeFileSync(USER_CREDS_FILE, JSON.stringify(all, null, 2), 'utf-8');
      return all[key][provider];
    } catch (e) {
      console.warn("Could not save user credentials to file:", e.message);
      return {};
    }
  }

  /**
   * Returns all credentials for the UI with secrets properly masked
   */
  async getAllUserCredentials(userId, baseUrl = '') {
    let uCreds = {};

    // Try Supabase first (production)
    try {
      if (this.supabase && userId) {
        const { data, error } = await this.supabase
          .from('user_dev_credentials')
          .select('provider, credentials')
          .eq('user_id', userId);
        if (!error && data && data.length > 0) {
          for (const row of data) {
            uCreds[row.provider] = row.credentials || {};
          }
        }
      }
    } catch (e) {
      console.warn("Could not load dev credentials from Supabase:", e.message);
    }

    // Fallback: local JSON file (for local dev)
    if (Object.keys(uCreds).length === 0) {
      try {
        if (fs.existsSync(USER_CREDS_FILE)) {
          const fileData = JSON.parse(fs.readFileSync(USER_CREDS_FILE, 'utf-8') || '{}');
          uCreds = (userId && fileData[userId]) ? fileData[userId] : (fileData['default_user'] || {});
        }
      } catch (e) {}
    }

    // Spotify
    const sp = uCreds.spotify || {};
    const spClientId = sp.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    const spClientSecret = sp.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
    
    // Discord
    const dc = uCreds.discord || {};
    const dcClientId = dc.clientId || process.env.DISCORD_CLIENT_ID || '';
    const dcSecret = dc.clientSecret || process.env.DISCORD_CLIENT_SECRET || '';
    const dcBotToken = dc.botToken || process.env.DISCORD_BOT_TOKEN || '';

    // Gemini
    const gm = uCreds.gemini || {};
    const gmKey = gm.apiKey || process.env.GEMINI_API_KEY || '';

    // Google Calendar
    const gc = uCreds.google_calendar || uCreds.google || {};
    const gcClientId = gc.clientId || process.env.GOOGLE_CLIENT_ID || '';
    const gcSecret = gc.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
    const gcIcal = gc.icalUrl || '';

    // Instagram
    const ig = uCreds.instagram || {};
    const igClientId = ig.clientId || process.env.INSTAGRAM_CLIENT_ID || '';
    const igSecret = ig.clientSecret || process.env.INSTAGRAM_CLIENT_SECRET || '';

    // Dynamic redirect URIs based on the current host
    const spotifyRedirect = baseUrl ? `${baseUrl}/api/integrations/spotify/callback` : 'http://127.0.0.1:3000/api/integrations/spotify/callback';
    const discordRedirect = baseUrl ? `${baseUrl}/api/integrations/discord/callback` : 'http://127.0.0.1:3000/api/integrations/discord/callback';
    const googleRedirect = baseUrl ? `${baseUrl}/api/auth/google/callback` : 'http://localhost:3000/api/auth/google/callback';

    return {
      spotify: {
        configured: !!spClientId,
        clientId: spClientId,
        hasSecret: !!spClientSecret,
        maskedSecret: maskSecret(spClientSecret),
        redirectUri: spotifyRedirect
      },
      discord: {
        configured: !!dcClientId,
        clientId: dcClientId,
        hasSecret: !!dcSecret,
        maskedSecret: maskSecret(dcSecret),
        hasBotToken: !!dcBotToken,
        maskedBotToken: maskSecret(dcBotToken),
        redirectUri: discordRedirect
      },
      gemini: {
        configured: !!gmKey,
        hasKey: !!gmKey,
        maskedKey: maskSecret(gmKey)
      },
      google_calendar: {
        configured: !!(gcClientId || gcIcal),
        clientId: gcClientId,
        hasSecret: !!gcSecret,
        maskedSecret: maskSecret(gcSecret),
        icalUrl: gcIcal,
        redirectUri: googleRedirect
      },
      instagram: {
        configured: !!igClientId,
        clientId: igClientId,
        hasSecret: !!igSecret,
        maskedSecret: maskSecret(igSecret),
        redirectUri: baseUrl ? `${baseUrl}/instagram-callback` : 'http://127.0.0.1:3000/instagram-callback'
      }
    };
  }
}
