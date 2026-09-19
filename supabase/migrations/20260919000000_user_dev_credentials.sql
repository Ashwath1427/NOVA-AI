-- Migration: 20260919000000_user_dev_credentials.sql
-- Stores user developer credentials (Spotify Client ID/Secret, Discord keys, Gemini API key, etc.)
-- so they persist across server restarts on ephemeral hosting like Render.

CREATE TABLE IF NOT EXISTS public.user_dev_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    credentials JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_dev_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own credentials
CREATE POLICY "Users can view their own dev credentials."
    ON public.user_dev_credentials FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dev credentials."
    ON public.user_dev_credentials FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dev credentials."
    ON public.user_dev_credentials FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dev credentials."
    ON public.user_dev_credentials FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_dev_credentials_user_provider ON public.user_dev_credentials(user_id, provider);
