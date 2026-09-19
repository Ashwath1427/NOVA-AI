// server/integrations/google-calendar.js
// Server-side module for Google Calendar Integration

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly'
];

export const googleCalendar = {
  name: 'google_calendar',
  displayName: 'Google Calendar',
  scopes: GOOGLE_CALENDAR_SCOPES,

  /**
   * Generates official Google OAuth authorization URL
   */
  getAuthUrl({ clientId, redirectUri, state }) {
    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not configured in server environment.");
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: state || 'google_calendar'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  /**
   * Exchanges authorization code for tokens on the server
   */
  async exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Failed to exchange Google OAuth code');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      expiresAt: Date.now() + (data.expires_in * 1000),
      tokenType: data.token_type,
      scope: data.scope
    };
  },

  /**
   * Refreshes access token if expired
   */
  async refreshAccessToken({ refreshToken, clientId, clientSecret }) {
    if (!refreshToken) throw new Error("No refresh token available");
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      }).toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || 'Failed to refresh Google access token');
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
  },

  /**
   * Fetches real events from Google Calendar API
   */
  async fetchEvents({ accessToken, timeMin, timeMax, maxResults = 25 }) {
    if (!accessToken) throw new Error("No access token provided");

    const params = new URLSearchParams({
      timeMin: timeMin || new Date().toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(maxResults)
    });
    if (timeMax) params.append('timeMax', timeMax);

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to fetch Google Calendar events');
    }

    // Normalize events
    const items = data.items || [];
    return items.map(item => ({
      id: item.id,
      title: item.summary || '(No Title)',
      description: item.description || '',
      startTime: item.start?.dateTime || item.start?.date,
      endTime: item.end?.dateTime || item.end?.date,
      location: item.location || '',
      htmlLink: item.htmlLink || '',
      source: 'google_calendar'
    }));
  },

  /**
   * Support for private iCal (.ics) feed URL as an alternative official sync method
   */
  async fetchIcalEvents(icalUrl, timeMinDate, timeMaxDate) {
    if (!icalUrl) return [];
    const response = await fetch(icalUrl);
    if (!response.ok) throw new Error(`Could not fetch iCal feed: ${response.statusText}`);
    const icalText = await response.text();

    const eventBlocks = icalText.split('BEGIN:VEVENT');
    const events = [];

    const minDate = timeMinDate ? new Date(timeMinDate) : new Date();
    minDate.setHours(0, 0, 0, 0);

    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].split('END:VEVENT')[0];
      const summaryMatch = block.match(/SUMMARY(?:;[^:]*)?:(.*)/i);
      const dtStartMatch = block.match(/DTSTART(?:;[^:]*)?:([^\r\n]+)/i);
      const dtEndMatch = block.match(/DTEND(?:;[^:]*)?:([^\r\n]+)/i);
      const descMatch = block.match(/DESCRIPTION(?:;[^:]*)?:(.*)/i);

      if (summaryMatch && dtStartMatch) {
        const rawStart = dtStartMatch[1].trim();
        let startTime = null;

        // Parse YYYYMMDDTHHMMSSZ or YYYYMMDD
        if (rawStart.includes('T')) {
          const year = rawStart.slice(0, 4);
          const month = rawStart.slice(4, 6);
          const day = rawStart.slice(6, 8);
          const hour = rawStart.slice(9, 11);
          const minute = rawStart.slice(11, 13);
          const second = rawStart.slice(13, 15) || '00';
          startTime = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
        } else if (rawStart.length === 8) {
          startTime = `${rawStart.slice(0, 4)}-${rawStart.slice(4, 6)}-${rawStart.slice(6, 8)}T09:00:00Z`;
        }

        if (startTime) {
          events.push({
            id: 'ical_' + i,
            title: summaryMatch[1].trim(),
            description: descMatch ? descMatch[1].trim() : '',
            startTime: startTime,
            endTime: dtEndMatch ? startTime : null,
            source: 'google_calendar'
          });
        }
      }
    }

    return events;
  }
};
