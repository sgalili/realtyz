CREATE TABLE public.broker_wa_avatar_attempts (broker_id uuid PRIMARY KEY, outcome text NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.broker_wa_avatar_attempts TO service_role;
ALTER TABLE public.broker_wa_avatar_attempts ENABLE ROW LEVEL SECURITY;