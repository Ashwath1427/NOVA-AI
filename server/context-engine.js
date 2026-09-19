// server/context-engine.js
// NOVA Normalized Context Engine
// Prepares normalized context for the AI Planner without any credentials, tokens, or raw secrets.

import { googleCalendar } from './integrations/google-calendar.js';
import { gmail } from './integrations/gmail.js';
import { spotify } from './integrations/spotify.js';
import { discord } from './integrations/discord.js';

export class ContextEngine {
  constructor(supabaseClient, integrationsStore, entitlementsService) {
    this.supabase = supabaseClient;
    this.integrationsStore = integrationsStore;
    this.entitlementsService = entitlementsService;
  }

  /**
   * Fetches normalized calendar events (from DB + connected Google Calendar)
   */
  async get_calendar_context(userId, userSettings = {}, scopedSupabase = null, timeRange = null) {
    if (userSettings.use_calendar_planning === false) {
      return [];
    }

    const sb = scopedSupabase || this.supabase;
    const events = [];
    
    let startOfDay, endOfDay;
    if (timeRange) {
      startOfDay = timeRange.start;
      endOfDay = timeRange.end;
    } else {
      const today = new Date().toISOString().split('T')[0];
      startOfDay = today + 'T00:00:00.000Z';
      endOfDay = today + 'T23:59:59.999Z';
    }

    // 1. Supabase calendar events for the authenticated user
    try {
      const { data: dbEvents } = await sb
        .from('calendar_events')
        .select('id, title, description, start_time, end_time')
        .eq('user_id', userId)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .order('start_time', { ascending: true });

      if (dbEvents && dbEvents.length > 0) {
        dbEvents.forEach(e => {
          events.push({
            id: e.id,
            title: e.title,
            description: e.description || '',
            startTime: e.start_time,
            endTime: e.end_time || e.start_time,
            isFixed: true,
            source: 'nova_calendar'
          });
        });
      }
    } catch (e) {
      console.warn("Error fetching DB calendar events:", e.message);
    }

    // 2. Google Calendar events if connected & authorized
    const gcalIntegration = this.integrationsStore.get(userId, 'google_calendar');
    const hasGcalFeature = await this.entitlementsService.checkFeature(userId, 'google_calendar');

    if (hasGcalFeature && gcalIntegration && gcalIntegration.status === 'connected' && gcalIntegration.settings?.use_for_planning !== false) {
      try {
        if (gcalIntegration.credentials?.accessToken) {
          const gcalEvents = await googleCalendar.fetchEvents({
            accessToken: gcalIntegration.credentials.accessToken,
            timeMin: startOfDay,
            timeMax: endOfDay
          });
          if (Array.isArray(gcalEvents)) {
            gcalEvents.forEach(ge => {
              events.push({ ...ge, isFixed: true, source: 'google_calendar' });
            });
          }
        } else if (gcalIntegration.credentials?.icalUrl) {
          const icalEvents = await googleCalendar.fetchIcalEvents(gcalIntegration.credentials.icalUrl, startOfDay, endOfDay);
          if (icalEvents && icalEvents.length > 0) {
            icalEvents.forEach(ie => {
              events.push({ ...ie, isFixed: true, source: 'google_calendar_ical' });
            });
          }
        }
      } catch (e) {
        console.warn("Error fetching Google Calendar context:", e.message);
      }
    }

    return events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }

  /**
   * Fetches important emails with potential deadlines
   */
  async get_gmail_context(userId, userSettings = {}) {
    if (userSettings.use_gmail_planning === false) {
      return [];
    }

    const hasGmailFeature = await this.entitlementsService.checkFeature(userId, 'gmail');
    if (!hasGmailFeature) return [];

    const gmailIntegration = this.integrationsStore.get(userId, 'gmail');
    if (!gmailIntegration || gmailIntegration.status !== 'connected' || gmailIntegration.settings?.use_for_planning === false) {
      return [];
    }

    try {
      if (gmailIntegration.credentials?.accessToken) {
        return await gmail.fetchImportantEmails({
          accessToken: gmailIntegration.credentials.accessToken,
          maxResults: 5
        });
      }
    } catch (e) {
      console.warn("Error fetching Gmail context:", e.message);
    }
    return [];
  }

  /**
   * Fetches normalized active tasks
   */
  async get_task_context(userId, scopedSupabase = null) {
    const sb = scopedSupabase || this.supabase;
    try {
      const { data: tasks } = await sb
        .from('tasks')
        .select('id, title, description, priority, due_date, due_time, status')
        .eq('user_id', userId)
        .neq('status', 'Completed')
        .order('priority', { ascending: false });

      return (tasks || []).map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        priority: t.priority || 'Medium',
        dueDate: t.due_date || 'Today',
        dueTime: t.due_time || null,
        status: t.status
      }));
    } catch (e) {
      console.warn("Error fetching task context:", e.message);
      return [];
    }
  }

  /**
   * Fetches normalized active projects
   */
  async get_project_context(userId, scopedSupabase = null) {
    const sb = scopedSupabase || this.supabase;
    try {
      const { data: projects } = await sb
        .from('projects')
        .select('id, name, description, deadline, progress_percentage')
        .eq('user_id', userId)
        .order('deadline', { ascending: true });

      return (projects || []).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        deadline: p.deadline || null,
        progress: p.progress_percentage || 0
      }));
    } catch (e) {
      console.warn("Error fetching project context:", e.message);
      return [];
    }
  }

  /**
   * Fetches normalized active habits
   */
  async get_habit_context(userId, scopedSupabase = null) {
    const sb = scopedSupabase || this.supabase;
    try {
      const { data: habits } = await sb
        .from('habits')
        .select('id, name, frequency, is_active')
        .eq('user_id', userId)
        .eq('is_active', true);

      return (habits || []).map(h => ({
        id: h.id,
        name: h.name,
        frequency: h.frequency
      }));
    } catch (e) {
      console.warn("Error fetching habit context:", e.message);
      return [];
    }
  }

  /**
   * Fetches relevant notes and reminders
   */
  async get_notes_context(userId, scopedSupabase = null) {
    const sb = scopedSupabase || this.supabase;
    try {
      const { data: notes } = await sb
        .from('notes')
        .select('id, title, content, is_pinned')
        .eq('user_id', userId)
        .order('is_pinned', { ascending: false })
        .limit(5);

      return (notes || []).map(n => ({
        id: n.id,
        title: n.title,
        content: n.content?.slice(0, 150) || '',
        isPinned: n.is_pinned
      }));
    } catch (e) {
      console.warn("Error fetching notes context:", e.message);
      return [];
    }
  }

  /**
   * Fetches active Spotify playback or focus playlist audio context
   */
  async get_spotify_context(userId, userSettings = {}) {
    if (userSettings.use_spotify_planning === false) {
      return null;
    }

    const hasSpotifyFeature = await this.entitlementsService.checkFeature(userId, 'spotify');
    if (!hasSpotifyFeature) return null;

    const spotifyIntegration = this.integrationsStore.get(userId, 'spotify');
    if (!spotifyIntegration || spotifyIntegration.status !== 'connected' || spotifyIntegration.settings?.use_for_planning === false) {
      return null;
    }

    try {
      const context = await spotify.fetchContext({
        userId,
        integrationsStore: this.integrationsStore
      });
      return context && context.connected ? context : null;
    } catch (e) {
      console.warn("Error fetching Spotify context:", e.message);
      return null;
    }
  }

  /**
   * Fetches active Discord alerts and urgent mentions
   */
  async get_discord_context(userId, userSettings = {}) {
    if (userSettings.use_discord_planning === false) {
      return [];
    }

    const hasDiscordFeature = await this.entitlementsService.checkFeature(userId, 'discord');
    if (!hasDiscordFeature) return [];

    const discordIntegration = this.integrationsStore.get(userId, 'discord');
    if (!discordIntegration || discordIntegration.status !== 'connected' || discordIntegration.settings?.use_for_planning === false) {
      return null;
    }

    try {
      return await discord.fetchContext({
        accessToken: discordIntegration.credentials?.accessToken,
        credentials: discordIntegration.credentials,
        userId
      });
    } catch (e) {
      console.warn("Error fetching Discord context:", e.message);
      return null;
    }
  }

  /**
   * Aggregates all normalized context for the AI Planner
   */
  async get_full_planning_context(userId, userSettings = {}, scopedSupabase = null) {
    const sb = scopedSupabase || this.supabase;
    const [calendar, importantEmails, tasks, projects, habits, notes, audioContext, discordAlerts] = await Promise.all([
      this.get_calendar_context(userId, userSettings, sb),
      this.get_gmail_context(userId, userSettings),
      this.get_task_context(userId, sb),
      this.get_project_context(userId, sb),
      this.get_habit_context(userId, sb),
      this.get_notes_context(userId, sb),
      this.get_spotify_context(userId, userSettings),
      this.get_discord_context(userId, userSettings)
    ]);

    return {
      calendar,
      importantEmails,
      tasks,
      projects,
      habits,
      notes,
      audioContext,
      discordAlerts,
      timestamp: new Date().toISOString()
    };
  }
}
