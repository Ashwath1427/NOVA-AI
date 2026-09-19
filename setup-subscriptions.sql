-- =====================================================================================
-- SUBSCRIPTIONS & ENTITLEMENTS SETUP
-- =====================================================================================

-- 1. Create Subscriptions Table
DROP TABLE IF EXISTS public.subscriptions CASCADE;
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id)
);

-- RLS for subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

-- Only admins/service role should insert or update this manually for now
-- No public insert/update policies are provided since payments are manual.

-- 2. Trigger to auto-create subscription for new users
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
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Insert subscriptions for any existing users who don't have one
INSERT INTO public.subscriptions (user_id, email, full_name, plan, status)
SELECT 
  id, 
  email, 
  raw_user_meta_data->>'full_name',
  'free', 
  'active' 
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.subscriptions);

-- 3. Resource Limits Enforcement Triggers

-- Function to check resource limits based on subscription plan
CREATE OR REPLACE FUNCTION public.check_resource_limit()
RETURNS trigger AS $$
DECLARE
    user_plan TEXT;
    current_count INTEGER;
    max_allowed INTEGER;
BEGIN
    -- Get user's current plan
    SELECT plan INTO user_plan FROM public.subscriptions WHERE user_id = NEW.user_id;
    IF user_plan IS NULL THEN
        user_plan := 'free';
    END IF;

    -- Define limits based on plan and table
    IF TG_TABLE_NAME = 'projects' THEN
        IF user_plan = 'free' THEN max_allowed := 3;
        ELSIF user_plan = 'pro' THEN max_allowed := 15;
        ELSIF user_plan = 'pro_plus' THEN max_allowed := 50;
        ELSE max_allowed := 999999; -- pro_max / unlimited
        END IF;
    ELSIF TG_TABLE_NAME = 'tasks' THEN
        IF user_plan = 'free' THEN max_allowed := 50;
        ELSIF user_plan = 'pro' THEN max_allowed := 500;
        ELSIF user_plan = 'pro_plus' THEN max_allowed := 2000;
        ELSE max_allowed := 999999;
        END IF;
    ELSIF TG_TABLE_NAME = 'notes' THEN
        IF user_plan = 'free' THEN max_allowed := 50;
        ELSIF user_plan = 'pro' THEN max_allowed := 500;
        ELSIF user_plan = 'pro_plus' THEN max_allowed := 2000;
        ELSE max_allowed := 999999;
        END IF;
    ELSIF TG_TABLE_NAME = 'habits' THEN
        IF user_plan = 'free' THEN max_allowed := 5;
        ELSIF user_plan = 'pro' THEN max_allowed := 20;
        ELSIF user_plan = 'pro_plus' THEN max_allowed := 50;
        ELSE max_allowed := 999999;
        END IF;
    END IF;

    -- Count current items for user in the target table
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', TG_TABLE_NAME)
    INTO current_count
    USING NEW.user_id;

    -- Check if limit is reached
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'LIMIT_REACHED:%', TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers to tables
DROP TRIGGER IF EXISTS enforce_projects_limit ON public.projects;
CREATE TRIGGER enforce_projects_limit
    BEFORE INSERT ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.check_resource_limit();

DROP TRIGGER IF EXISTS enforce_tasks_limit ON public.tasks;
CREATE TRIGGER enforce_tasks_limit
    BEFORE INSERT ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.check_resource_limit();

DROP TRIGGER IF EXISTS enforce_notes_limit ON public.notes;
CREATE TRIGGER enforce_notes_limit
    BEFORE INSERT ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.check_resource_limit();

DROP TRIGGER IF EXISTS enforce_habits_limit ON public.habits;
CREATE TRIGGER enforce_habits_limit
    BEFORE INSERT ON public.habits
    FOR EACH ROW EXECUTE FUNCTION public.check_resource_limit();
