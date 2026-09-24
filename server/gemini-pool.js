// server/gemini-pool.js
// Manages Gemini API keys with automatic failover and BYOK (Bring Your Own Key) support

// The pool keys will be loaded from the environment variables NOVA_AI_1, NOVA_AI_2, etc.
const getPoolKeys = () => {
  const keys = [];
  for (let i = 1; i <= 20; i++) {
    const key = process.env[`NOVA_AI_${i}`];
    if (key && key.trim().length > 0) {
      keys.push(key.trim());
    }
  }
  return keys;
};

let currentPoolIndex = 0;

/**
 * Gets the next available public key from the pool.
 */
function getNextPublicKey() {
  const poolKeys = getPoolKeys();
  if (poolKeys.length === 0) {
    console.warn("No public keys found in GEMINI_POOL_KEYS");
    return null;
  }
  const key = poolKeys[currentPoolIndex % poolKeys.length];
  currentPoolIndex = (currentPoolIndex + 1) % poolKeys.length;
  return key;
}

/**
 * Fetches data from Gemini, automatically falling back to a backup key if the public pool hits a rate limit.
 * @param {string} urlBase - The API endpoint without the ?key= parameter (e.g., "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent")
 * @param {object} fetchOptions - Standard fetch options (method, headers, body)
 * @param {string|null} customKey - The user's BYOK custom key (if they are Pro Max)
 * @returns {Promise<Response>}
 */
export async function fetchWithFailover(urlBase, fetchOptions, customKey = null) {
  // If the user provided a custom key, use it exclusively (no failover if their own key is rate-limited)
  if (customKey && customKey.trim() !== '') {
    const url = `${urlBase}?key=${customKey.trim()}`;
    return await fetch(url, fetchOptions);
  }

  // Otherwise, use the public pool with up to 3 retries (failover)
  const MAX_RETRIES = 3;
  let lastResponse = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const key = getNextPublicKey();
    const url = `${urlBase}?key=${key}`;
    
    try {
      const response = await fetch(url, fetchOptions);
      
      // If successful, return immediately
      if (response.ok) {
        return response;
      }
      
      // If it's a 429 Too Many Requests or 500 error, it might be a quota issue on this key.
      if (response.status === 429 || response.status >= 500) {
        console.warn(`Gemini API key at index ${(currentPoolIndex - 1 + PUBLIC_API_KEYS.length) % PUBLIC_API_KEYS.length} failed with status ${response.status}. Failing over...`);
        lastResponse = response;
        continue; // Try the next key
      }
      
      // For other errors (400 Bad Request, 403 Forbidden on our end), return it to the caller
      return response;
      
    } catch (e) {
      console.warn(`Network error with Gemini API key at index ${(currentPoolIndex - 1 + PUBLIC_API_KEYS.length) % PUBLIC_API_KEYS.length}: ${e.message}. Failing over...`);
      if (attempt === MAX_RETRIES - 1) throw e;
    }
  }

  // If all retries failed, return the last response (which is likely a 429)
  return lastResponse;
}
