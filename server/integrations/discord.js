import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const MSG_FILE = path.join(DATA_DIR, 'discord_messages.json');

function getStoredMessages(userId) {
  try {
    if (fs.existsSync(MSG_FILE)) {
      const raw = fs.readFileSync(MSG_FILE, 'utf-8');
      const all = JSON.parse(raw || '{}');
      const userList = (userId && all[userId]) ? all[userId] : [];
      const defaultList = all['default_user'] || [];
      const combined = [...userList];
      for (const m of defaultList) {
        if (!combined.some(c => c.id === m.id)) {
          combined.push(m);
        }
      }
      if (combined.length === 0) {
        for (const k of Object.keys(all)) {
          if (Array.isArray(all[k])) {
            for (const m of all[k]) {
              if (!combined.some(c => c.id === m.id)) combined.push(m);
            }
          }
        }
      }
      return combined;
    }
  } catch (e) {
    console.warn("Could not read discord_messages.json:", e.message);
  }
  return [];
}

function storeMessage(userId, message) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let all = {};
    if (fs.existsSync(MSG_FILE)) {
      try {
        all = JSON.parse(fs.readFileSync(MSG_FILE, 'utf-8') || '{}');
      } catch (e) {}
    }
    const key = userId || 'default_user';
    if (!all[key]) all[key] = [];
    all[key].unshift(message);
    fs.writeFileSync(MSG_FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (e) {
    console.warn("Could not save to discord_messages.json:", e.message);
  }
}

const DISCORD_SCOPES = ['identify', 'guilds', 'email'];
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3000/discord-callback';

export const discord = {
  name: 'discord',
  displayName: 'Discord',
  scopes: DISCORD_SCOPES,

  isConfigured() {
    const id = (process.env.DISCORD_CLIENT_ID || '').trim();
    if (!id || id === '123456789012345678' || id.includes('demo') || id.includes('placeholder')) {
      return false;
    }
    return true;
  },

  /**
   * Validates if an Application ID exists on Discord
   */
  async verifyApplication(clientId) {
    if (!clientId) return { valid: false, error: "Client ID is empty" };
    try {
      const res = await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(clientId)}/rpc`);
      if (res.status === 404) {
        return { valid: false, error: "Discord Application ID does not exist on Discord (Unknown Application)." };
      }
      return { valid: true };
    } catch (e) {
      return { valid: true };
    }
  },

  /**
   * Constructs Discord OAuth2 authorization URL
   */
  getAuthUrl({ clientId, state, redirectUri }) {
    const id = clientId || process.env.DISCORD_CLIENT_ID;
    if (!id) {
      throw new Error("DISCORD_CLIENT_ID is not configured in application settings.");
    }

    const redirect = redirectUri || process.env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI;
    const params = new URLSearchParams({
      client_id: id,
      response_type: 'code',
      redirect_uri: redirect,
      scope: DISCORD_SCOPES.join(' '),
      state: state || 'discord_oauth',
      prompt: 'consent'
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  },

  /**
   * Exchanges authorization code for Discord tokens
   */
  async exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri }) {
    const id = clientId || process.env.DISCORD_CLIENT_ID;
    const secret = clientSecret || process.env.DISCORD_CLIENT_SECRET;

    if (!id) {
      throw new Error("DISCORD_CLIENT_ID is not configured.");
    }

    const redirect = redirectUri || process.env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI;

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect
    });

    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.error || 'Failed to exchange Discord authorization code');
    }

    const expiresIn = data.expires_in || 604800;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      expiresAt: Date.now() + (expiresIn * 1000),
      tokenType: data.token_type || 'Bearer',
      scope: data.scope || DISCORD_SCOPES.join(' ')
    };
  },

  /**
   * Refreshes an expired Discord access token
   */
  async refreshAccessToken({ refreshToken }) {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Discord credentials missing for token refresh.");
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.error || 'Failed to refresh Discord access token');
    }

    const expiresIn = data.expires_in || 604800;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn,
      expiresAt: Date.now() + (expiresIn * 1000),
      scope: data.scope
    };
  },

  /**
   * Intelligently analyzes and triages messages to determine what the user received
   * and what they should be worried about (urgent deadlines, exam changes, critical pings)
   */
  triageMessages(rawMessages = []) {
    const urgentKeywords = [
      'due', 'deadline', 'submission', 'tonight', 'tomorrow', 'urgent', 'asap',
      'exam', 'quiz', 'test', 'rescheduled', 'mandatory', 'cancel', 'failed',
      'warning', 'immediately', 'grade', 'submit', 'final call', 'emergency',
      'important', 'fast', 'now', 'priority', 'finish', 'complete'
    ];

    const triaged = rawMessages.map(msg => {
      const lower = (msg.content || '').toLowerCase();
      let urgency = 'low';
      let urgencyReason = 'General update or casual discussion';

      const hasUrgentKeyword = urgentKeywords.some(kw => lower.includes(kw));
      const hasMention = lower.includes('@everyone') || lower.includes('@here') || msg.isMention;

      if (hasUrgentKeyword && (hasMention || msg.serverName === 'Direct Message')) {
        urgency = 'high';
        urgencyReason = 'Direct urgent message / ping requiring immediate priority';
      } else if (hasUrgentKeyword) {
        urgency = 'high';
        urgencyReason = 'Time-sensitive deadline or academic / project notice';
      } else if (hasMention || lower.includes('question') || lower.includes('help') || lower.includes('review')) {
        urgency = 'medium';
        urgencyReason = 'Requires a response or review when free';
      }

      return {
        ...msg,
        urgency,
        urgencyReason
      };
    });

    // Extract what the user should be worried about
    const highUrgencyItems = triaged.filter(m => m.urgency === 'high');
    const worriedAbout = highUrgencyItems.map(item => {
      let action = item.actionRequired;
      if (!action) {
        if (item.content.toLowerCase().includes('nova')) {
          action = 'Complete and push NOVA update immediately per ' + item.author;
        } else {
          action = 'Review details and complete before deadline';
        }
      }
      return {
        title: item.summary || item.content.slice(0, 80),
        server: item.serverName || 'Direct Message',
        channel: item.channelName || '#general',
        sender: item.author || 'Team Member',
        time: item.timestamp,
        actionRequired: action
      };
    });

    return {
      messages: triaged,
      highUrgencyCount: highUrgencyItems.length,
      mediumUrgencyCount: triaged.filter(m => m.urgency === 'medium').length,
      worriedAbout
    };
  },

  /**
   * Syncs a manual or incoming message into storage
   */
  syncMessage(userId, message) {
    storeMessage(userId, message);
    return true;
  },

  /**
   * Fetches live user profile, guilds, message digest and triage summary from real Discord API
   */
  async fetchContext({ accessToken, credentials = {}, userId }) {
    let userProfile = { username: 'Discord User', id: 'discord_user' };
    let guilds = [];
    let rawMessages = [];

    // 1. Fetch real user profile and guilds via OAuth2 user token if available
    if (accessToken) {
      try {
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (userRes.ok) {
          userProfile = await userRes.json();
        }

        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (guildsRes.ok) {
          guilds = await guildsRes.json();
        }
      } catch (e) {
        console.warn("Could not fetch Discord live user profile:", e.message);
      }
    }

    // 2. Load stored & synced real messages / DMs for this user
    const stored = getStoredMessages(userId || 'default_user');
    rawMessages.push(...stored);

    // 2. Fetch real channel messages via Discord Bot Token if configured
    const botToken = process.env.DISCORD_BOT_TOKEN || credentials?.botToken;
    if (botToken) {
      try {
        // Fetch guilds the bot is in
        const botGuildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
          headers: { 'Authorization': `Bot ${botToken}` }
        });
        if (botGuildsRes.ok) {
          const botGuilds = await botGuildsRes.json();
          if (botGuilds && botGuilds.length > 0) {
            // Read announcements / text channels from up to 3 guilds
            for (const g of botGuilds.slice(0, 3)) {
              const chRes = await fetch(`https://discord.com/api/v10/guilds/${g.id}/channels`, {
                headers: { 'Authorization': `Bot ${botToken}` }
              });
              if (!chRes.ok) continue;
              const channels = await chRes.json();
              const textChannels = (channels || []).filter(c => c.type === 0 || c.type === 5).slice(0, 3);

              for (const ch of textChannels) {
                const msgRes = await fetch(`https://discord.com/api/v10/channels/${ch.id}/messages?limit=15`, {
                  headers: { 'Authorization': `Bot ${botToken}` }
                });
                if (!msgRes.ok) continue;
                const msgs = await msgRes.json();
                if (Array.isArray(msgs)) {
                  for (const m of msgs) {
                    if (m.content && m.content.trim()) {
                      rawMessages.push({
                        id: m.id,
                        serverName: g.name,
                        channelName: '#' + ch.name,
                        author: m.author?.username || 'Discord Member',
                        content: m.content,
                        summary: m.content.slice(0, 90),
                        timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMention: m.mention_everyone || (m.mentions && m.mentions.some(u => u.id === userProfile.id))
                      });
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch real messages via Discord Bot Token:", err.message);
      }
    }

    // 3. Triage only REAL messages
    const triage = this.triageMessages(rawMessages);

    return {
      connected: true,
      status: 'connected',
      user: {
        id: userProfile.id,
        username: userProfile.username,
        discriminator: userProfile.discriminator || '0000',
        avatar: userProfile.avatar ? `https://cdn.discordapp.com/avatars/${userProfile.id}/${userProfile.avatar}.png` : null
      },
      guildCount: guilds.length,
      guilds: (guilds || []).slice(0, 10).map(g => ({ id: g.id, name: g.name, icon: g.icon })),
      unreadMessagesCount: triage.messages.length,
      highUrgencyCount: triage.highUrgencyCount,
      mediumUrgencyCount: triage.mediumUrgencyCount,
      worriedAbout: triage.worriedAbout,
      messages: triage.messages,
      botTokenConfigured: !!botToken,
      lastCheckedAt: new Date().toISOString(),
      source: botToken ? 'discord_bot_live' : (accessToken ? 'discord_oauth' : 'discord_connected')
    };
  }
};
