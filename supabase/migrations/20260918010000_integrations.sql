-- Migration: 20260918010000_integrations.sql
-- Table: integrations (associated with auth.uid())

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

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Security Policies: users can only manage their own integration records
DROP POLICY IF EXISTS "Users can view their own integrations." ON public.integrations;
CREATE POLICY "Users can view their own integrations." 
    ON public.integrations FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own integrations." ON public.integrations;
CREATE POLICY "Users can insert their own integrations." 
    ON public.integrations FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own integrations." ON public.integrations;
CREATE POLICY "Users can update their own integrations." 
    ON public.integrations FOR UPDATE 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own integrations." ON public.integrations;
CREATE POLICY "Users can delete their own integrations." 
    ON public.integrations FOR DELETE 
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_integrations_user_provider ON public.integrations(user_id, provider);
