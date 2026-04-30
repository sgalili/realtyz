-- Extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Tables (only created if missing; existing richer schemas are preserved)
CREATE TABLE IF NOT EXISTS public.wa_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text,
  config jsonb,
  is_active boolean DEFAULT false,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text UNIQUE,
  full_name text,
  preferences jsonb,
  lead_stage text,
  is_demo boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_title text,
  description text,
  asking_price numeric(12,2),
  features jsonb,
  embedding vector(768),
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.autopilot_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  message_content text,
  status text DEFAULT 'pending',
  scheduled_at timestamptz,
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3
);

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id uuid PRIMARY KEY,
  step int,
  is_complete boolean DEFAULT false,
  status text
);

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  message text,
  created_at timestamptz DEFAULT now()
);

-- Trial lead cap trigger (preserve existing function definition; just ensure trigger is attached)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_trial_lead_cap'
      AND tgrelid = 'public.leads'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_trial_lead_cap
    BEFORE INSERT ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_trial_lead_cap();
  END IF;
END$$;