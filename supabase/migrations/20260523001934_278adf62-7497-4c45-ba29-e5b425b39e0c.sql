-- Freemium guardrails: trial_end_date + wallet on profiles, with new-signup seeding
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS wallet_balance_agorot integer NOT NULL DEFAULT 5000;

-- Backfill trial_end_date for existing rows (30d from trial_start_date)
UPDATE public.profiles
SET trial_end_date = COALESCE(trial_start_date, created_at) + interval '30 days'
WHERE trial_end_date IS NULL;

-- Updated signup trigger: 30d trial + ₪50 wallet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, last_sign_in_at,
    plan_status, trial_start_date, trial_end_date, wallet_balance_agorot
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.last_sign_in_at,
    'trial',
    now(),
    now() + interval '30 days',
    5000
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Updated trial cap: also block when trial_end_date has passed
CREATE OR REPLACE FUNCTION public.enforce_trial_lead_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  current_count int;
  trial_ends timestamptz;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_admin_or_above(uid) THEN RETURN NEW; END IF;
  IF NOT public.is_on_trial_plan(uid) THEN RETURN NEW; END IF;

  SELECT trial_end_date INTO trial_ends FROM public.profiles WHERE id = uid;
  IF trial_ends IS NOT NULL AND trial_ends < now() THEN
    RAISE EXCEPTION 'TRIAL_TIME_EXPIRED: תקופת ההתנסות הסתיימה. שדרג כדי להמשיך לנהל מתעניינים'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.leads
  WHERE COALESCE(is_demo, false) = false;

  IF current_count >= 100 THEN
    RAISE EXCEPTION 'TRIAL_RECORD_LIMIT: מסלול ההתנסות מוגבל ל-100 אנשי קשר. שדרג כדי להמשיך'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;