// server/integrations/spotify.js
// Server-side module for Spotify OAuth 2.0 with PKCE Integration

const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-top-read'
];

const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3000/spotify-callback';

export const spotify = {
  name: 'spotify',
  displayName: 'Spotify',
  scopes: SPOTIFY_SCOPES,

  /**
   * Check if Spotify Client ID is configured in application environment
   */
  isConfigured() {
    return !!process.env.SPOTIFY_CLIENT_ID;
  },

  /**
   * Constructs the official Spotify Authorization URL using Authorization Code with PKCE
   */
  getAuthUrl({ clientId, state, codeChallenge, redirectUri }) {
    const id = clientId || process.env.SPOTIFY_CLIENT_ID;
    if (!id) {
      throw new Error("SPOTIFY_CLIENT_ID is not configured.");
    }
    if (!codeChallenge) {
      throw new Error("PKCE code_challenge is required for Spotify OAuth.");
    }

    const redirect = redirectUri || process.env.SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI;
    const params = new URLSearchParams({
      client_id: id,
      response_type: 'code',
      redirect_uri: redirect,
      scope: SPOTIFY_SCOPES.join(' '),
      state: state || 'spotify_oauth',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  },

  /**
   * Exchanges authorization code for Spotify tokens using PKCE (RFC 7636)
   */
  async exchangePkceCodeForTokens({ clientId, clientSecret, code, codeVerifier, redirectUri }) {
    const id = clientId || process.env.SPOTIFY_CLIENT_ID;
    if (!id) {
      throw new Error("SPOTIFY_CLIENT_ID is not configured.");
    }
    if (!code || !codeVerifier) {
      throw new Error("Authorization code and PKCE code_verifier are required.");
    }

    const redirect = redirectUri || process.env.SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: id,
      code,
      redirect_uri: redirect,
      code_verifier: codeVerifier
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    const secret = clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
    if (secret) {
      const authHeader = Buffer.from(`${id}:${secret}`).toString('base64');
      headers['Authorization'] = `Basic ${authHeader}`;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body: bodyParams.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error_description || data.error || 'Failed to exchange Spotify authorization code';
      throw new Error(errMsg);
    }

    const expiresIn = data.expires_in || 3600;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      expiresAt: Date.now() + (expiresIn * 1000),
      tokenType: data.token_type || 'Bearer',
      scope: data.scope || SPOTIFY_SCOPES.join(' ')
    };
  },

  /**
   * Refreshes an expired Spotify access token using the stored refresh_token
   */
  async refreshAccessToken({ refreshToken }) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      throw new Error("SPOTIFY_CLIENT_ID is not configured.");
    }
    if (!refreshToken) {
      throw new Error("Missing refresh token for Spotify refresh request.");
    }

    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    if (process.env.SPOTIFY_CLIENT_SECRET) {
      const authHeader = Buffer.from(`${clientId}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
      headers['Authorization'] = `Basic ${authHeader}`;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body: bodyParams.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error_description || data.error || 'Failed to refresh Spotify access token';
      throw new Error(errMsg);
    }

    const expiresIn = data.expires_in || 3600;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Spotify may or may not return a new refresh token
      expiresIn,
      expiresAt: Date.now() + (expiresIn * 1000),
      scope: data.scope
    };
  },

  /**
   * Retrieves a valid, active access token for the given user, automatically refreshing if expired
   */
  async getValidAccessToken(userId, integrationsStore) {
    if (!userId || !integrationsStore) return null;

    const record = integrationsStore.get(userId, 'spotify');
    if (!record || record.status !== 'connected' || !record.credentials?.accessToken) {
      return null;
    }

    const { credentials } = record;
    const now = Date.now();
    const expiresAt = credentials.expiresAt || 0;

    // If token is still valid with more than 60s buffer, return it directly
    if (expiresAt - now > 60 * 1000) {
      return credentials.accessToken;
    }

    // Token has expired or is expiring within 60 seconds — refresh it
    if (!credentials.refreshToken) {
      console.warn(`Spotify token expired for user ${userId} and no refresh token available.`);
      integrationsStore.save(userId, 'spotify', {
        ...record,
        status: 'disconnected',
        error: 'Token expired'
      });
      return null;
    }

    try {
      const refreshed = await this.refreshAccessToken({ refreshToken: credentials.refreshToken });
      integrationsStore.save(userId, 'spotify', {
        ...record,
        status: 'connected',
        credentials: {
          ...credentials,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt
        },
        updated_at: new Date().toISOString()
      });
      return refreshed.accessToken;
    } catch (refreshErr) {
      console.error(`Error refreshing Spotify token for user ${userId}:`, refreshErr.message);
      // Mark as disconnected if refresh failed with invalid grant
      if (refreshErr.message.includes('invalid_grant') || refreshErr.message.includes('revoked')) {
        integrationsStore.save(userId, 'spotify', {
          ...record,
          status: 'disconnected',
          error: 'Authorization revoked or expired'
        });
      }
      return null;
    }
  },

  /**
   * Fetches real live Spotify audio context (currently playing track and top listening preferences)
   * Returns { connected: false } if not authorized or disconnected. Never returns fake mock data.
   */
  async fetchContext({ userId, integrationsStore }) {
    const accessToken = await this.getValidAccessToken(userId, integrationsStore);
    if (!accessToken) {
      return { connected: false, status: 'disconnected' };
    }

    let currentlyPlaying = null;
    let topTracks = [];

    // 1. Fetch currently playing track
    try {
      const cpRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (cpRes.status === 200) {
        const cpData = await cpRes.json();
        if (cpData && cpData.item) {
          currentlyPlaying = {
            isPlaying: Boolean(cpData.is_playing),
            trackName: cpData.item.name || 'Unknown Track',
            artistName: cpData.item.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
            albumName: cpData.item.album?.name || '',
            albumArt: cpData.item.album?.images?.[0]?.url || '',
            durationMs: cpData.item.duration_ms || 0,
            progressMs: cpData.progress_ms || 0,
            spotifyUrl: cpData.item.external_urls?.spotify || ''
          };
        }
      } else if (cpRes.status === 204) {
        // No current playback
        currentlyPlaying = null;
      }
    } catch (cpErr) {
      console.warn("Could not fetch currently playing track from Spotify:", cpErr.message);
    }

    // 2. Fetch user top listening preferences (short term)
    try {
      const topRes = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=short_term', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (topRes.ok) {
        const topData = await topRes.json();
        if (Array.isArray(topData.items)) {
          topTracks = topData.items.map((t, idx) => ({
            index: idx + 1,
            title: t.name,
            artist: t.artists?.map(a => a.name).join(', ') || '',
            album: t.album?.name || '',
            albumArt: t.album?.images?.[0]?.url || '',
            durationSec: Math.round((t.duration_ms || 0) / 1000),
            spotifyUrl: t.external_urls?.spotify || ''
          }));
        }
      }
    } catch (topErr) {
      console.warn("Could not fetch top tracks from Spotify:", topErr.message);
    }

    return {
      connected: true,
      status: 'connected',
      currentlyPlaying,
      topTracks,
      trackCount: topTracks.length,
      authorizedScopes: SPOTIFY_SCOPES,
      source: 'spotify_live_oauth'
    };
  }
};
