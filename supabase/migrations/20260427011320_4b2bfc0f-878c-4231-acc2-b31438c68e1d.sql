-- Add trial fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz NOT NULL DEFAULT now();

-- Update the new-user trigger to seed trial fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, last_sign_in_at, plan_status, trial_start_date)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.last_sign_in_at,
    'trial',
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Helper: returns true if the given user is on an active trial
CREATE OR REPLACE FUNCTION public.is_trial_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND plan_status = 'trial'
      AND trial_start_date > now() - interval '7 days'
  );
$$;

-- Helper: returns true if the given user is on trial (regardless of expiry)
CREATE OR REPLACE FUNCTION public.is_on_trial_plan(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND plan_status = 'trial'
  );
$$;

-- DB-level cap: 100 voter rows when on trial plan
-- Voters is a shared table, so we cap the total real (non-demo) voter count
-- when the acting user is still on the trial plan.
CREATE OR REPLACE FUNCTION public.enforce_trial_voter_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  current_count int;
BEGIN
  -- Skip enforcement for service role / no auth context (server-side jobs)
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip for admins / super admins
  IF public.is_admin_or_above(uid) THEN
    RETURN NEW;
  END IF;

  -- Only enforce if the user is on a trial plan
  IF NOT public.is_on_trial_plan(uid) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.voters
  WHERE COALESCE(is_demo, false) = false;

  IF current_count >= 100 THEN
    RAISE EXCEPTION 'TRIAL_RECORD_LIMIT: מסלול הניסיון מוגבל ל-100 רשומות. שדרג עכשיו כדי לנהל את כל מאגר הבוחרים שלך'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_trial_voter_cap ON public.voters;
CREATE TRIGGER trg_enforce_trial_voter_cap
  BEFORE INSERT ON public.voters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_trial_voter_cap();

-- Backfill existing profiles to mark them as 'active' so we don't lock out
-- existing users; only brand-new signups will start on trial.
UPDATE public.profiles
SET plan_status = 'active'
WHERE plan_status = 'trial'
  AND created_at < now() - interval '1 minute';