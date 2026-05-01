
-- MEETINGS
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  location text,
  conference_link text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed','no_show')),
  google_calendar_event_id text,
  reminder_1h_sent_at timestamptz,
  prospect_email text,
  prospect_phone text,
  prospect_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_user_starts ON public.meetings(user_id, starts_at);
CREATE INDEX idx_meetings_lead ON public.meetings(lead_id);
CREATE INDEX idx_meetings_reminder ON public.meetings(starts_at, reminder_1h_sent_at)
  WHERE status = 'scheduled' AND reminder_1h_sent_at IS NULL;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meetings"
ON public.meetings FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- BOOKING TOKENS
CREATE TABLE public.booking_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  lead_id uuid,
  prospect_name text,
  prospect_phone text,
  prospect_email text,
  proposed_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_slot timestamptz,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','booked','expired','cancelled')),
  duration_minutes integer NOT NULL DEFAULT 30,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_tokens_user ON public.booking_tokens(user_id, created_at DESC);
CREATE INDEX idx_booking_tokens_token ON public.booking_tokens(token);

ALTER TABLE public.booking_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own booking_tokens"
ON public.booking_tokens FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
-- Public read happens via edge function with service role, no anon RLS policy needed.

CREATE TRIGGER update_booking_tokens_updated_at
BEFORE UPDATE ON public.booking_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRON: dispatch 1-hour reminders every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('meeting-reminder-cron');
EXCEPTION WHEN others THEN NULL;
END $$;
