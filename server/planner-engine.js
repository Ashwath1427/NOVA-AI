// server/planner-engine.js
// NOVA Deterministic AI Day Execution & Scheduling Engine
// Strictly validates conflicts, anchors fixed calendar commitments, enforces Supabase persistence,
// and ensures zero mock data or overlapping intervals.

export class PlannerEngine {
  constructor(contextEngine, geminiApiKey) {
    this.contextEngine = contextEngine;
    this.geminiApiKey = geminiApiKey;
  }

  /**
   * Helper to parse time strings like "09:00 AM", "9:30 AM", "21:30", "2026-09-19T09:30:00Z"
   * into minutes from midnight (0 - 1439).
   */
  parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;

    if (timeStr.includes('T')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 60 + d.getMinutes();
      }
    }

    const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
    if (!match) return 0;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridian = match[3] ? match[3].toUpperCase() : null;

    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  /**
   * Helper to convert minutes from midnight to formatted 12-hour string (e.g. "09:00 AM")
   */
  minutesToTimeString(totalMinutes) {
    totalMinutes = Math.max(0, Math.min(1439, totalMinutes));
    let hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const meridian = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${displayHours}:${displayMinutes} ${meridian}`;
  }

  /**
   * Calculates compact metric summary for the user's current day
   */
  calculateDayMetrics(context) {
    const calendarEvents = context.calendar || [];
    const tasks = context.tasks || [];
    const discordAlerts = context.discordAlerts?.worriedAbout || [];

    // Calculate fixed commitments duration
    let fixedMinutes = 0;
    calendarEvents.forEach(ev => {
      const startMin = this.parseTimeToMinutes(ev.startTime);
      const endMin = ev.endTime ? this.parseTimeToMinutes(ev.endTime) : startMin + 60;
      const dur = Math.max(30, endMin - startMin);
      fixedMinutes += dur;
    });

    // Standard wake day: 14 hours active window (840 minutes)
    const totalActiveMinutes = 14 * 60;
    const freeMinutes = Math.max(60, totalActiveMinutes - fixedMinutes);
    const freeHours = Math.floor(freeMinutes / 60);
    const freeMinsRem = freeMinutes % 60;

    // Count urgent deadlines
    let deadlineCount = 0;
    tasks.forEach(t => {
      if (t.priority === 'Urgent' || t.priority === 'High') deadlineCount++;
    });
    deadlineCount += discordAlerts.length;

    return {
      availableTime: `${freeHours}h ${freeMinsRem > 0 ? freeMinsRem + 'm' : ''}`.trim(),
      availableMinutes: freeMinutes,
      fixedCount: calendarEvents.length,
      taskCount: tasks.length,
      deadlineCount
    };
  }

  /**
   * Checks if today's plan is already generated and saved in Supabase daily_plans
   */
  async getTodayPlan(userId, scopedSupabase) {
    const today = new Date().toISOString().split('T')[0];
    const context = await this.contextEngine.get_full_planning_context(userId, {}, scopedSupabase);
    const summary = this.calculateDayMetrics(context);

    try {
      const { data, error } = await scopedSupabase
        .from('daily_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_date', today)
        .maybeSingle();

      if (!error && data && data.content) {
        return {
          exists: true,
          planDate: data.plan_date,
          plan: data.content,
          summary,
          generatedAt: data.created_at
        };
      }
    } catch (e) {
      console.warn("Could not check today's plan from daily_plans:", e.message);
    }

    return {
      exists: false,
      summary,
      plan: null
    };
  }

  /**
   * Deterministically validates and adjusts a timeline of blocks to guarantee:
   * 1. Fixed calendar events are strictly anchored at their exact start and end times.
   * 2. Zero overlapping intervals.
   * 3. Tasks are sorted and placed into valid open gaps.
   * 4. Realistic block durations.
   */
  validateAndSanitizePlan(blocks = [], realFixedEvents = [], validTasks = []) {
    const validTaskMap = new Map((validTasks || []).map(t => [t.id, t]));
    const fixedIntervals = [];

    // 1. Process and normalize real fixed calendar events
    realFixedEvents.forEach(fe => {
      const startMin = this.parseTimeToMinutes(fe.startTime);
      const endMin = fe.endTime ? this.parseTimeToMinutes(fe.endTime) : startMin + 60;
      fixedIntervals.push({
        id: fe.id || `fixed_${startMin}`,
        title: fe.title.replace('Google Calendar: ', '').replace('📅 ', ''),
        startTime: this.minutesToTimeString(startMin),
        endTime: this.minutesToTimeString(endMin),
        startMin,
        endMin: Math.max(startMin + 30, endMin),
        duration: `${Math.round((endMin - startMin))}m`,
        type: 'calendar',
        category: 'Google Calendar Event',
        notes: fe.description || 'Fixed calendar event',
        isFixed: true,
        status: 'pending',
        taskId: null,
        spotifyFocus: null
      });
    });

    // Sort fixed intervals chronologically
    fixedIntervals.sort((a, b) => a.startMin - b.startMin);

    // 2. Filter flexible blocks from input (excluding hallucinated fixed events)
    const flexibleBlocks = [];
    (blocks || []).forEach((b, idx) => {
      if (b.isFixed || b.type === 'calendar') return; // Fixed events come strictly from realFixedEvents

      const startMin = this.parseTimeToMinutes(b.startTime);
      const endMin = b.endTime ? this.parseTimeToMinutes(b.endTime) : startMin + (b.durationMinutes || 60);
      const dur = Math.max(20, Math.min(120, endMin - startMin));

      const matchedTask = b.taskId ? validTaskMap.get(b.taskId) : null;
      const title = matchedTask ? matchedTask.title : (b.title || `Focus Session ${idx + 1}`);

      flexibleBlocks.push({
        id: b.id || `flex_${idx}_${Date.now()}`,
        title,
        durationMinutes: dur,
        type: b.type || 'focus',
        category: b.category || (b.type === 'workout' ? 'Workout & Fitness' : 'Deep Focus'),
        notes: b.notes || (matchedTask?.description ? matchedTask.description : ''),
        taskId: matchedTask ? matchedTask.id : null,
        spotifyFocus: b.spotifyFocus || null,
        isFixed: false,
        status: b.status || 'pending'
      });
    });

    // 3. Build conflict-free chronological schedule by interleaving flexible blocks into open slots
    const resultSchedule = [];
    const now = new Date();
    const currentNowMin = now.getHours() * 60 + now.getMinutes();
    const roundedNowMin = Math.ceil(currentNowMin / 5) * 5;

    // Start cursor: at least 8:00 AM (480 min). If later in the day, start at current time rounded to 5m.
    let currentCursorMin = Math.max(8 * 60, roundedNowMin);
    const endOfDayMin = 23 * 60 + 50; // 11:50 PM
    if (currentCursorMin > 23 * 60) {
      currentCursorMin = 23 * 60; // Allow late evening slots
    }

    let flexIdx = 0;

    // Add fixed events and insert flexible work in between
    for (const fe of fixedIntervals) {
      // If the fixed event is in the future relative to our cursor, fill the gap with flexible tasks
      if (fe.startMin > currentCursorMin) {
        while (flexIdx < flexibleBlocks.length && currentCursorMin + 20 <= fe.startMin) {
          const item = flexibleBlocks[flexIdx];
          const availBeforeFe = fe.startMin - currentCursorMin;
          const blockDuration = Math.min(item.durationMinutes, availBeforeFe);

          if (blockDuration >= 20) {
            resultSchedule.push({
              id: item.id,
              title: item.title,
              startTime: this.minutesToTimeString(currentCursorMin),
              endTime: this.minutesToTimeString(currentCursorMin + blockDuration),
              duration: `${blockDuration}m`,
              type: item.type,
              category: item.category,
              notes: item.notes,
              taskId: item.taskId,
              spotifyFocus: item.spotifyFocus,
              isFixed: false,
              status: item.status
            });
            currentCursorMin += blockDuration + 10; // add 10m buffer/break
            flexIdx++;
          } else {
            break;
          }
        }
      }

      // Add the fixed event itself at its exact scheduled time
      resultSchedule.push({
        id: fe.id,
        title: fe.title,
        startTime: fe.startTime,
        endTime: fe.endTime,
        duration: fe.duration,
        type: 'calendar',
        category: 'Google Calendar Event',
        notes: fe.notes,
        taskId: null,
        spotifyFocus: null,
        isFixed: true,
        status: fe.status
      });

      if (fe.endMin > currentCursorMin) {
        currentCursorMin = fe.endMin + 10;
      }
    }

    // After all fixed events, schedule any remaining flexible blocks until end of day
    while (flexIdx < flexibleBlocks.length && currentCursorMin + 20 <= endOfDayMin) {
      const item = flexibleBlocks[flexIdx];
      const avail = endOfDayMin - currentCursorMin;
      const blockDuration = Math.min(item.durationMinutes, Math.max(25, avail));

      if (blockDuration >= 20) {
        resultSchedule.push({
          id: item.id,
          title: item.title,
          startTime: this.minutesToTimeString(currentCursorMin),
          endTime: this.minutesToTimeString(currentCursorMin + blockDuration),
          duration: `${blockDuration}m`,
          type: item.type,
          category: item.category,
          notes: item.notes,
          taskId: item.taskId,
          spotifyFocus: item.spotifyFocus,
          isFixed: false,
          status: item.status
        });
        currentCursorMin += blockDuration + 10;
        flexIdx++;
      } else {
        break;
      }
    }

    // Sort final schedule by start time
    resultSchedule.sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime));

    return resultSchedule;
  }

  /**
   * Generates a realistic daily plan using Gemini AI with deterministic validation
   */
  async generateDailyPlan(userId, scopedSupabase, { force = false } = {}) {
    const today = new Date().toISOString().split('T')[0];

    // Idempotency: Return existing plan if already generated today and force is not set
    if (!force) {
      const existing = await this.getTodayPlan(userId, scopedSupabase);
      if (existing.exists && existing.plan) {
        return existing.plan;
      }
    }

    const context = await this.contextEngine.get_full_planning_context(userId, {}, scopedSupabase);
    const summary = this.calculateDayMetrics(context);

    const realFixedEvents = context.calendar || [];
    const realTasks = [...(context.tasks || [])];
    const urgentDiscordPings = context.discordAlerts?.worriedAbout || [];

    // Synthesize urgent Discord pings as top priority planning items
    urgentDiscordPings.forEach((dp, idx) => {
      const actionTitle = dp.actionRequired || `Respond to ${dp.sender}: ${dp.title}`;
      if (!realTasks.some(t => t.title.toLowerCase().includes(dp.sender?.toLowerCase() || 'discord'))) {
        realTasks.unshift({
          id: `discord_alert_${idx}`,
          title: actionTitle,
          description: `Urgent Discord ping from ${dp.sender} in ${dp.channel}: "${dp.title}"`,
          priority: 'Urgent',
          dueDate: 'Today'
        });
      }
    });

    const realHabits = context.habits || [];
    const spotifyConnected = context.audioContext && context.audioContext.connected;
    const spotifyTracks = context.audioContext?.topTracks || [];

    // Build focused Gemini system prompt requesting strict JSON schema
    const prompt = `You are NOVA's Executive Day Planning Engine.
Intelligently schedule the user's day based strictly on their REAL verified tasks, fixed calendar events, habits, and urgent Discord pings.

STRICT CONSTRAINTS:
1. FIXED CALENDAR EVENTS MUST NOT MOVE. Every fixed event must be scheduled at its EXACT time.
2. No two blocks may overlap.
3. Order tasks by priority (Urgent > High > Medium > Low).
4. Break large tasks (>90 mins) into realistic, focused sessions with breaks.
5. Include a 45-minute workout/fitness block if habits or daily routine warrant it.
6. ${spotifyConnected ? 'Spotify is CONNECTED. For deep focus blocks, assign instrumental/focus vibe. For workout blocks, assign a high-energy track from user playlist.' : 'Spotify is DISCONNECTED. Set spotifyFocus to null.'}
7. Return a STRICT JSON object conforming to this schema:
{
  "summary": "Brief 1-sentence executive day strategy",
  "blocks": [
    {
      "id": "blk_1",
      "startTime": "09:00 AM",
      "endTime": "10:30 AM",
      "durationMinutes": 90,
      "title": "Task title or Focus block name",
      "type": "focus | calendar | workout | break | review",
      "category": "Deep Focus | Google Calendar Event | Workout | Break",
      "notes": "Actionable notes",
      "taskId": "UUID of matched task or null",
      "isFixed": false,
      "spotifyFocus": ${spotifyConnected ? '{"title": "Track Title", "artist": "Artist", "vibe": "Deep Focus"}' : 'null'}
    }
  ]
}

REAL USER CONTEXT:
- FIXED CALENDAR EVENTS TODAY:
${realFixedEvents.length > 0 ? realFixedEvents.map(e => `  * ${e.title} (${e.startTime} - ${e.endTime || ''})`).join('\n') : '  No fixed calendar events today.'}

- URGENT DISCORD ALERTS & PINGS:
${urgentDiscordPings.length > 0 ? urgentDiscordPings.map(d => `  * [${d.sender} in ${d.channel}] "${d.title}" -> Action: ${d.actionRequired}`).join('\n') : '  No urgent Discord alerts.'}

- PENDING REAL TASKS:
${realTasks.length > 0 ? realTasks.map(t => `  * [ID: ${t.id}] ${t.title} (Priority: ${t.priority}, Due: ${t.dueDate || 'Today'})`).join('\n') : '  No pending tasks.'}

- HABITS TO COMPLETE:
${realHabits.length > 0 ? realHabits.map(h => `  * ${h.name}`).join('\n') : '  None'}

- SPOTIFY PLAYLIST TRACKS AVAILABLE:
${spotifyConnected && spotifyTracks.length > 0 ? spotifyTracks.slice(0, 10).map(t => `  * ${t.title} by ${t.artist}`).join('\n') : '  None'}

Current Date: ${today}. Current Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
`;

    let generatedBlocks = [];

    // Call Gemini with strict JSON mode
    try {
      const activeKey = this.geminiApiKey || process.env.GEMINI_API_KEY;
      if (activeKey && activeKey.length > 15) {
        const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];
        for (const model of models) {
          try {
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.2
                }
              })
            });

            if (geminiRes.ok) {
              const geminiData = await geminiRes.json();
              const jsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (jsonText) {
                const parsed = JSON.parse(jsonText);
                if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
                  generatedBlocks = parsed.blocks;
                  break;
                }
              }
            }
          } catch (mErr) {
            // continue to next model
          }
        }
      }
    } catch (err) {
      console.warn("Gemini day planning call failed, switching to deterministic scheduler:", err.message);
    }

    // Deterministic fallback: If Gemini didn't return blocks, schedule active tasks and habits directly
    if (generatedBlocks.length === 0) {
      if (realTasks.length > 0) {
        realTasks.forEach((t, idx) => {
          let duration = 45;
          if (t.estimated_minutes && !isNaN(t.estimated_minutes)) {
            duration = parseInt(t.estimated_minutes, 10);
          } else if (t.title) {
            const m = t.title.match(/(\d+)\s*(?:min|m\b)/i);
            if (m) duration = parseInt(m[1], 10);
          }

          generatedBlocks.push({
            id: `blk_task_${t.id || idx}`,
            title: t.title,
            durationMinutes: Math.min(120, Math.max(25, duration)),
            type: 'focus',
            category: t.category || (t.priority === 'Urgent' ? 'Urgent Deliverable' : 'Deep Focus'),
            notes: t.description || `Focused session on "${t.title}".`,
            taskId: t.id || null,
            isFixed: false,
            spotifyFocus: spotifyConnected && spotifyTracks.length > 0 ? {
              title: spotifyTracks[idx % spotifyTracks.length].title,
              artist: spotifyTracks[idx % spotifyTracks.length].artist,
              vibe: 'Deep Focus'
            } : null
          });
        });
      } else {
        // Add a generic focus block if no tasks exist so plan is never empty
        generatedBlocks.push({
          id: 'blk_generic_focus',
          title: 'Deep Focus Session',
          durationMinutes: 60,
          type: 'focus',
          category: 'Deep Focus',
          notes: 'Open focus block to work on whatever is most important.',
          taskId: null,
          isFixed: false,
          spotifyFocus: spotifyConnected && spotifyTracks.length > 0 ? {
            title: spotifyTracks[0].title,
            artist: spotifyTracks[0].artist,
            vibe: 'Deep Focus'
          } : null
        });
      }

      // Add habit/workout block if available
      if (realHabits.length > 0) {
        generatedBlocks.push({
          id: `blk_habit_workout`,
          title: `Daily Habit: ${realHabits[0].name}`,
          durationMinutes: 45,
          type: 'workout',
          category: 'Workout & Fitness',
          notes: 'Consistent daily habit and movement.',
          taskId: null,
          isFixed: false,
          spotifyFocus: spotifyConnected && spotifyTracks.length > 1 ? {
            title: spotifyTracks[1].title,
            artist: spotifyTracks[1].artist,
            vibe: 'Workout'
          } : null
        });
      }
    }

    // Deterministically validate, remove overlaps, anchor fixed events
    const validatedBlocks = this.validateAndSanitizePlan(generatedBlocks, realFixedEvents, realTasks);

    const finalPlan = {
      date: today,
      generatedAt: new Date().toISOString(),
      status: 'active',
      activeBlockIndex: 0,
      summary: {
        ...summary,
        totalBlocks: validatedBlocks.length
      },
      blocks: validatedBlocks
    };

    // Persist to Supabase daily_plans table (with unique constraint on user_id, plan_date)
    try {
      await scopedSupabase
        .from('daily_plans')
        .upsert({
          user_id: userId,
          plan_date: today,
          content: finalPlan,
          created_at: new Date().toISOString()
        }, { onConflict: 'user_id, plan_date' });
    } catch (dbErr) {
      console.warn("Error saving plan to daily_plans:", dbErr.message);
    }

    return finalPlan;
  }

  /**
   * Recalculates remaining flexible hours when a block is missed or user requests replan.
   * Preserves completed blocks and fixed calendar commitments.
   */
  async replanRemainingDay(userId, scopedSupabase, { completedBlockIds = [], currentTime = null }) {
    const today = new Date().toISOString().split('T')[0];
    const existingResult = await this.getTodayPlan(userId, scopedSupabase);
    if (!existingResult.exists || !existingResult.plan) {
      return await this.generateDailyPlan(userId, scopedSupabase);
    }

    const currentPlan = existingResult.plan;
    const allBlocks = currentPlan.blocks || [];
    const context = await this.contextEngine.get_full_planning_context(userId, {}, scopedSupabase);
    const realFixedEvents = context.calendar || [];
    const realTasks = context.tasks || [];

    const nowMinutes = currentTime ? this.parseTimeToMinutes(currentTime) : this.parseTimeToMinutes(new Date().toLocaleTimeString());

    // Separate completed blocks and remaining blocks
    const preservedBlocks = [];
    const remainingFlexibleBlocks = [];

    allBlocks.forEach(b => {
      if (b.status === 'completed' || completedBlockIds.includes(b.id)) {
        preservedBlocks.push({ ...b, status: 'completed' });
      } else if (!b.isFixed) {
        remainingFlexibleBlocks.push(b);
      }
    });

    // Re-sanitize remaining flexible blocks against upcoming fixed events from nowMinutes onwards
    const futureFixedEvents = realFixedEvents.filter(fe => {
      const endMin = fe.endTime ? this.parseTimeToMinutes(fe.endTime) : this.parseTimeToMinutes(fe.startTime) + 60;
      return endMin > nowMinutes;
    });

    // Re-slot remaining flexible blocks
    let cursor = Math.max(nowMinutes, 8 * 60);
    const reslotted = [];

    for (const b of remainingFlexibleBlocks) {
      const dur = parseInt(b.duration, 10) || 45;

      // Find next available gap without colliding with future fixed events
      let foundSlot = false;
      while (!foundSlot && cursor + dur <= 23 * 60) {
        // Check collision with any future fixed event
        const collision = futureFixedEvents.find(fe => {
          const feStart = this.parseTimeToMinutes(fe.startTime);
          const feEnd = fe.endTime ? this.parseTimeToMinutes(fe.endTime) : feStart + 60;
          return (cursor < feEnd && (cursor + dur) > feStart);
        });

        if (collision) {
          const colEnd = collision.endTime ? this.parseTimeToMinutes(collision.endTime) : this.parseTimeToMinutes(collision.startTime) + 60;
          cursor = colEnd + 10;
        } else {
          foundSlot = true;
        }
      }

      if (foundSlot) {
        reslotted.push({
          ...b,
          startTime: this.minutesToTimeString(cursor),
          endTime: this.minutesToTimeString(cursor + dur),
          duration: `${dur}m`
        });
        cursor += dur + 10;
      }
    }

    // Combine preserved completed blocks, future fixed events, and reslotted blocks
    const combined = [
      ...preservedBlocks,
      ...futureFixedEvents.map(fe => ({
        id: fe.id || `fixed_${this.parseTimeToMinutes(fe.startTime)}`,
        title: fe.title.replace('Google Calendar: ', '').replace('📅 ', ''),
        startTime: this.minutesToTimeString(this.parseTimeToMinutes(fe.startTime)),
        endTime: this.minutesToTimeString(fe.endTime ? this.parseTimeToMinutes(fe.endTime) : this.parseTimeToMinutes(fe.startTime) + 60),
        duration: `${Math.round((fe.endTime ? this.parseTimeToMinutes(fe.endTime) - this.parseTimeToMinutes(fe.startTime) : 60))}m`,
        type: 'calendar',
        category: 'Google Calendar Event',
        notes: fe.description || 'Fixed calendar event',
        isFixed: true,
        status: 'pending',
        taskId: null,
        spotifyFocus: null
      })),
      ...reslotted
    ];

    combined.sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime));

    const updatedPlan = {
      ...currentPlan,
      blocks: combined,
      generatedAt: new Date().toISOString(),
      replannedAt: new Date().toISOString()
    };

    // Save to daily_plans
    await scopedSupabase
      .from('daily_plans')
      .upsert({
        user_id: userId,
        plan_date: today,
        content: updatedPlan,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id, plan_date' });

    return updatedPlan;
  }

  /**
   * Updates an individual block's status and updates the corresponding task in Supabase
   */
  async updateBlockAction(userId, scopedSupabase, { blockId, status, taskId }) {
    const today = new Date().toISOString().split('T')[0];
    const { data: planRecord } = await scopedSupabase
      .from('daily_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('plan_date', today)
      .maybeSingle();

    if (!planRecord || !planRecord.content) {
      throw new Error("No active daily plan found for today.");
    }

    const plan = planRecord.content;
    const blocks = plan.blocks || [];
    let targetIdx = -1;

    if (blockId === 'start_day') {
      plan.activeDayStarted = true;
      if (plan.activeBlockIndex === undefined || plan.activeBlockIndex === null) {
        plan.activeBlockIndex = 0;
      }
    } else {
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].id === blockId) {
          blocks[i].status = status;
          targetIdx = i;
          break;
        }
      }

      // If marked completed and has an associated task, update the task in the database
      if (status === 'completed' && taskId) {
        try {
          await scopedSupabase
            .from('tasks')
            .update({ status: 'Completed', updated_at: new Date().toISOString() })
            .eq('id', taskId)
            .eq('user_id', userId);
        } catch (err) {
          console.warn("Could not sync task completion in DB:", err.message);
        }
      }

      // Advance activeBlockIndex to next uncompleted block
      let nextActiveIdx = targetIdx >= 0 ? targetIdx + 1 : 0;
      while (nextActiveIdx < blocks.length && (blocks[nextActiveIdx].status === 'completed' || blocks[nextActiveIdx].status === 'skipped')) {
        nextActiveIdx++;
      }
      plan.activeBlockIndex = nextActiveIdx;
    }

    // Save back to daily_plans
    await scopedSupabase
      .from('daily_plans')
      .upsert({
        user_id: userId,
        plan_date: today,
        content: plan,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id, plan_date' });

    return { success: true, plan };
  }
}
