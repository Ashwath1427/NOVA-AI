// server/integrations/gmail.js
// Server-side module for Gmail Integration (Read-only metadata & actionable content)

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly'
];

export const gmail = {
  name: 'gmail',
  displayName: 'Gmail',
  scopes: GMAIL_SCOPES,

  /**
   * Generates official Google OAuth authorization URL for Gmail
   */
  getAuthUrl({ clientId, redirectUri, state }) {
    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not configured in server environment.");
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: state || 'gmail'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  /**
   * Fetches important unread or actionable email snippets
   */
  async fetchImportantEmails({ accessToken, maxResults = 10 }) {
    if (!accessToken) throw new Error("No access token provided");

    // Fetch message IDs matching inbox
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:INBOX&maxResults=${maxResults}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const listData = await listRes.json();
    if (!listRes.ok) {
      throw new Error(listData.error?.message || 'Failed to fetch messages from Gmail');
    }

    const messages = listData.messages || [];
    if (messages.length === 0) return [];

    // Fetch metadata for messages
    const emails = [];
    for (const msg of messages.slice(0, 5)) {
      try {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (msgRes.ok) {
          const detail = await msgRes.json();
          const headers = detail.payload?.headers || [];
          const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
          const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
          const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

          // Detect potential deadlines or action items in snippet/subject
          const textToScan = `${subject} ${detail.snippet || ''}`.toLowerCase();
          const hasDeadline = textToScan.includes('deadline') || textToScan.includes('due') || textToScan.includes('urgent') || textToScan.includes('by tomorrow') || textToScan.includes('submit');

          emails.push({
            id: msg.id,
            subject,
            from,
            date,
            snippet: detail.snippet || '',
            hasDeadline,
            source: 'gmail'
          });
        }
      } catch (e) {
        console.warn(`Could not fetch details for msg ${msg.id}:`, e.message);
      }
    }

    return emails;
  }
};
