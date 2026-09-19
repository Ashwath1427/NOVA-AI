// server/pkce-session-store.js
/**
 * Server-side PKCE Session Store interface.
 * Implements in-memory TTL storage for development, structured cleanly so it can
 * later be replaced by a persistent store (e.g. Redis, database) for production.
 */

export class PkceSessionStore {
  /**
   * @param {number} ttlMs Time to live for a PKCE session in milliseconds (default: 15 minutes)
   */
  constructor(ttlMs = 15 * 60 * 1000) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;

    // Periodic cleanup of expired sessions every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Store a PKCE session with associated state
   * @param {string} state Unique CSRF state token
   * @param {Object} data { userId, codeVerifier, provider, ... }
   */
  set(state, data) {
    if (!state) return;
    this.sessions.set(state, {
      ...data,
      createdAt: Date.now()
    });
  }

  /**
   * Retrieve a PKCE session without deleting it
   * @param {string} state
   * @returns {Object|null}
   */
  get(state) {
    if (!state) return null;
    const session = this.sessions.get(state);
    if (!session) return null;

    if (Date.now() - session.createdAt > this.ttlMs) {
      this.sessions.delete(state);
      return null;
    }
    return session;
  }

  /**
   * Atomically retrieve and remove a PKCE session (single-use CSRF/PKCE state)
   * @param {string} state
   * @returns {Object|null}
   */
  take(state) {
    const session = this.get(state);
    if (session) {
      this.sessions.delete(state);
    }
    return session;
  }

  /**
   * Delete a session
   * @param {string} state
   */
  delete(state) {
    if (state) this.sessions.delete(state);
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [state, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.ttlMs) {
        this.sessions.delete(state);
      }
    }
  }

  /**
   * Return number of active sessions (useful for diagnostics)
   */
  size() {
    return this.sessions.size;
  }
}

export const pkceSessionStore = new PkceSessionStore();
