-- =====================================================================================
-- COMPLETE NOVA SUPABASE DATABASE SETUP SCRIPT
-- Paste and run this in your Supabase Project -> SQL Editor -> Run
-- Safe to run multiple times (All statements use IF NOT EXISTS / DROP POLICY IF EXISTS)
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PROFILES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    primary_goal TEXT DEFAULT 'Work',
    typical_available_time TEXT DEFAULT 'Evening',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile." ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile trigger on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- 2. PROJECTS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Planning' CHECK (status IN ('Planning', 'Active', 'Paused', 'Completed')),
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    deadline TIMESTAMPTZ,
    progress_percentage INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own projects." ON public.projects;
CREATE POLICY "Users can manage their own projects." ON public.projects FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- ==========================================
-- 3. PROJECT MEMBERS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own project memberships." ON public.project_members;
CREATE POLICY "Users can manage their own project memberships." ON public.project_members FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 4. TASKS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Todo' CHECK (status IN ('Todo', 'In Progress', 'Completed')),
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    due_date DATE,
    due_time TIME,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own tasks." ON public.tasks;
CREATE POLICY "Users can manage their own tasks." ON public.tasks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- ==========================================
-- 5. NOTES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own notes." ON public.notes;
CREATE POLICY "Users can manage their own notes." ON public.notes FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);

-- ==========================================
-- 6. HABITS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'Daily',
    target INT DEFAULT 1,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own habits." ON public.habits;
CREATE POLICY "Users can manage their own habits." ON public.habits FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON public.habits(user_id);

-- ==========================================
-- 7. HABIT ENTRIES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.habit_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.habit_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own habit entries." ON public.habit_entries;
CREATE POLICY "Users can manage their own habit entries." ON public.habit_entries FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_user ON public.habit_entries(habit_id, user_id);

-- ==========================================
-- 8. CALENDAR EVENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own calendar events." ON public.calendar_events;
CREATE POLICY "Users can manage their own calendar events." ON public.calendar_events FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_time ON public.calendar_events(start_time, end_time);

-- ==========================================
-- 9. DAILY PLANS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.daily_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, plan_date)
);
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own daily plans." ON public.daily_plans;
CREATE POLICY "Users can manage their own daily plans." ON public.daily_plans FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 10. AI CONVERSATIONS & MESSAGES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own AI conversations." ON public.ai_conversations;
CREATE POLICY "Users can manage their own AI conversations." ON public.ai_conversations FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own AI messages." ON public.ai_messages;
CREATE POLICY "Users can manage their own AI messages." ON public.ai_messages FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 11. INTEGRATIONS (Spotify, Discord, Google Calendar)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    credentials JSONB DEFAULT '{}'::JSONB,
    settings JSONB DEFAULT '{"use_for_planning": true}'::JSONB,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own integrations." ON public.integrations;
CREATE POLICY "Users can view their own integrations." ON public.integrations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own integrations." ON public.integrations;
CREATE POLICY "Users can insert their own integrations." ON public.integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own integrations." ON public.integrations;
CREATE POLICY "Users can update their own integrations." ON public.integrations FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own integrations." ON public.integrations;
CREATE POLICY "Users can delete their own integrations." ON public.integrations FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider ON public.integrations(user_id, provider);

-- ==========================================
-- 12. USER DEV CREDENTIALS (Persistent Gemini API Key)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.user_dev_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    credentials JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);
ALTER TABLE public.user_dev_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own dev credentials." ON public.user_dev_credentials;
CREATE POLICY "Users can view their own dev credentials." ON public.user_dev_credentials FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own dev credentials." ON public.user_dev_credentials;
CREATE POLICY "Users can insert their own dev credentials." ON public.user_dev_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own dev credentials." ON public.user_dev_credentials;
CREATE POLICY "Users can update their own dev credentials." ON public.user_dev_credentials FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own dev credentials." ON public.user_dev_credentials;
CREATE POLICY "Users can delete their own dev credentials." ON public.user_dev_credentials FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_dev_credentials_user_provider ON public.user_dev_credentials(user_id, provider);

-- ==========================================
-- 13. SUBSCRIPTIONS (Free, Pro, Power Tier)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.subscriptions;
CREATE POLICY "Users can view their own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, email, full_name, plan, status)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name',
    'free', 
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Auto-enroll existing users who do not have a subscription row
INSERT INTO public.subscriptions (user_id, email, full_name, plan, status)
SELECT id, email, raw_user_meta_data->>'full_name', 'free', 'active' 
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.subscriptions)
ON CONFLICT (user_id) DO NOTHING;
