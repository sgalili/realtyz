
-- Super-admin-created workspaces: unlimited flag + initial balance + workspace owner
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_unlimited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_super_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workspace_owner_id uuid;

-- Default each workspace_owner_id to the user's own id (= their own workspace)
UPDATE public.profiles SET workspace_owner_id = id WHERE workspace_owner_id IS NULL;

-- Bypass the trial 100-lead cap and trial-expiry block for unlimited workspaces
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
  unlimited boolean;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_admin_or_above(uid) THEN RETURN NEW; END IF;

  SELECT is_unlimited INTO unlimited FROM public.profiles WHERE id = uid;
  IF COALESCE(unlimited, false) THEN RETURN NEW; END IF;

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
