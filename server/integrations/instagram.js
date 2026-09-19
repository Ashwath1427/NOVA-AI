// server/integrations/instagram.js
// Server-side module for Instagram Integration

const INSTAGRAM_SCOPES = ['user_profile', 'user_media'];

export const instagram = {
  name: 'instagram',
  displayName: 'Instagram',
  scopes: INSTAGRAM_SCOPES,

  isConfigured() {
    return !!(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);
  },

  getAuthUrl({ clientId, redirectUri, state }) {
    const id = clientId || process.env.INSTAGRAM_CLIENT_ID;
    if (!id) throw new Error("INSTAGRAM_CLIENT_ID is not configured.");
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      scope: INSTAGRAM_SCOPES.join(','),
      response_type: 'code',
      state: state || 'instagram'
    });
    return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
  },

  async fetchContext({ accessToken }) {
    if (!accessToken) return null;
    try {
      const res = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        username: data.username,
        source: 'instagram'
      };
    } catch (e) {
      return null;
    }
  }
};
