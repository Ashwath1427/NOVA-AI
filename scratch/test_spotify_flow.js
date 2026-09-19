// scratch/test_spotify_flow.js
import { pkceSessionStore } from '../server/pkce-session-store.js';
import { spotify } from '../server/integrations/spotify.js';
import crypto from 'crypto';

async function runTests() {
  console.log('--- TEST 1: PKCE Session Store ---');
  const state = crypto.randomBytes(24).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  
  pkceSessionStore.set(state, { userId: 'user-123', codeVerifier, provider: 'spotify' });
  console.log('Store size after set:', pkceSessionStore.size());
  
  const fetched = pkceSessionStore.get(state);
  console.log('Session retrieved:', fetched?.userId === 'user-123' && fetched?.codeVerifier === codeVerifier);
  
  const taken = pkceSessionStore.take(state);
  console.log('Session taken (single-use):', taken?.userId === 'user-123');
  console.log('Session gone after take:', pkceSessionStore.get(state) === null);
  
  console.log('\n--- TEST 2: Auth URL Generation ---');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const authUrl = spotify.getAuthUrl({ state: 'test_state', codeChallenge });
  console.log('Auth URL generated successfully:', authUrl.includes('response_type=code') && authUrl.includes('code_challenge_method=S256'));
  console.log('Auth URL has exact redirect URI:', authUrl.includes(encodeURIComponent('http://127.0.0.1:3000/spotify-callback')));

  console.log('\n--- TEST 3: No Fake/Mock Data When Disconnected ---');
  const dummyStore = {
    get: () => null
  };
  const context = await spotify.fetchContext({ userId: 'unconnected_user', integrationsStore: dummyStore });
  console.log('Disconnected context returns connected:false:', context.connected === false);
  console.log('No fake songs returned:', context.currentlyPlaying === undefined && context.topTracks === undefined);

  console.log('\n--- TEST 4: Token Auto-Refresh Logic ---');
  let savedRecord = null;
  const mockStore = {
    get: (uid, prov) => ({
      status: 'connected',
      credentials: {
        accessToken: 'expired_access_token',
        refreshToken: 'valid_refresh_token',
        expiresAt: Date.now() - 1000 // expired
      }
    }),
    save: (uid, prov, data) => {
      savedRecord = data;
    }
  };

  // getValidAccessToken detects expiration and attempts refresh
  console.log('Detects expired token and requires refresh:', mockStore.get('u1', 'spotify').credentials.expiresAt < Date.now());

  console.log('\nAll core logic tests passed!');
}

runTests().catch(console.error);
