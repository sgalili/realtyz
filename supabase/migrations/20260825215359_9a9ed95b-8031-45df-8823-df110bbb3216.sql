CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_wa_avatar_fetch_for_lead(
  p_lead_id uuid,
  p_owner_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/fetch-wa-avatars';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWIiOiJhbm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjMxMDEsImV4cCI6MjA5NTk5OTEwMX0.invalid';
BEGIN
  IF p_lead_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'lead_ids', jsonb_build_array(p_lead_id),
      'owner_id', p_owner_id,
      'force', p_force
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Avatar fetching must never block lead creation or updates.
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_lead_write_fetch_wa_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(NEW.phone_number, ''), '\D', '', 'g');
  v_has_valid_phone boolean := NEW.phone_number IS NOT NULL
    AND NEW.phone_number !~* '^new-'
    AND length(v_digits) >= 9;
  v_has_avatar boolean := NULLIF(btrim(COALESCE(NEW.profile_picture_url, '')), '') IS NOT NULL;
  v_phone_changed boolean := TG_OP = 'UPDATE' AND NEW.phone_number IS DISTINCT FROM OLD.phone_number;
  v_owner_changed boolean := TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to;
BEGIN
  IF NOT v_has_valid_phone THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NOT v_has_avatar THEN
    PERFORM public.trigger_wa_avatar_fetch_for_lead(NEW.id, NEW.assigned_to, false);
  ELSIF TG_OP = 'UPDATE' AND v_phone_changed THEN
    PERFORM public.trigger_wa_avatar_fetch_for_lead(NEW.id, NEW.assigned_to, true);
  ELSIF TG_OP = 'UPDATE' AND v_owner_changed AND NOT v_has_avatar THEN
    PERFORM public.trigger_wa_avatar_fetch_for_lead(NEW.id, NEW.assigned_to, false);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_wa_avatar_after_write ON public.leads;
CREATE TRIGGER trg_leads_wa_avatar_after_write
AFTER INSERT OR UPDATE OF phone_number, assigned_to ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.on_lead_write_fetch_wa_avatar();

GRANT EXECUTE ON FUNCTION public.trigger_wa_avatar_fetch_for_lead(uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.on_lead_write_fetch_wa_avatar() TO authenticated, service_role;