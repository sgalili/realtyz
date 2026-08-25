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
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eWx5Z2h3ZnlzdnlkeWdxZHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjMxMDEsImV4cCI6MjA5NTk5OTEwMX0.3_sZy9BP9GIXO1yA1PoFYVdO0tDYzx7oFbfflsdk3aE';
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
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_wa_avatar_fetch_for_lead(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_wa_avatar_fetch_for_lead(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.trigger_wa_avatar_fetch_for_lead(uuid, uuid, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.on_lead_write_fetch_wa_avatar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.on_lead_write_fetch_wa_avatar() FROM anon;
REVOKE ALL ON FUNCTION public.on_lead_write_fetch_wa_avatar() FROM authenticated;