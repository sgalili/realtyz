
-- Ensure pg_net is available (most Supabase projects have it preinstalled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper that POSTs to the notify-agent edge function in the background
CREATE OR REPLACE FUNCTION public.dispatch_smart_notification(
  _user_id uuid,
  _lead_id uuid,
  _event_type text,
  _prospect_name text,
  _detail text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text;
  _service_key text;
BEGIN
  -- These are project-level settings; fall back gracefully if missing
  BEGIN
    _url := current_setting('app.supabase_url', true);
  EXCEPTION WHEN others THEN _url := NULL;
  END;
  BEGIN
    _service_key := current_setting('app.service_role_key', true);
  EXCEPTION WHEN others THEN _service_key := NULL;
  END;

  IF _url IS NULL OR _service_key IS NULL THEN
    -- Settings not configured in DB; the app layer will call notify-agent directly.
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _url || '/functions/v1/notify-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key,
      'apikey', _service_key
    ),
    body := jsonb_build_object(
      'event_type', _event_type,
      'lead_id', _lead_id,
      'prospect_name', _prospect_name,
      'detail', _detail,
      'override_user_id', _user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_smart_notification(uuid, uuid, text, text, text) FROM public, anon, authenticated;

-- Hot Lead trigger: fires when a new lead is inserted with loyalty_tier='Hot Lead'
CREATE OR REPLACE FUNCTION public.trg_lead_hot_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;

  IF NEW.loyalty_tier IS NOT NULL AND lower(NEW.loyalty_tier) IN ('hot lead', 'hot', 'חם', 'ליד חם') THEN
    -- Pick an owner: use auth.uid() if invoked by a user; otherwise the first super admin.
    _user_id := auth.uid();
    IF _user_id IS NULL THEN
      SELECT user_id INTO _user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1;
    END IF;
    IF _user_id IS NOT NULL THEN
      PERFORM public.dispatch_smart_notification(
        _user_id, NEW.id, 'new_high_priority',
        COALESCE(NEW.full_name, NEW.phone_number, 'New prospect'),
        'A new high-priority prospect was just added.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_hot_notify ON public.leads;
CREATE TRIGGER lead_hot_notify
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_hot_notify();

-- Meeting booked trigger: when lead_stage changes into the negotiation/meeting bucket
CREATE OR REPLACE FUNCTION public.trg_lead_meeting_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _new_stage text;
  _old_stage text;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;

  _new_stage := lower(COALESCE(NEW.lead_stage, ''));
  _old_stage := lower(COALESCE(OLD.lead_stage, ''));

  IF _new_stage <> _old_stage
     AND _new_stage IN ('negotiation', 'qualified', 'meeting')
     AND _old_stage NOT IN ('negotiation', 'qualified', 'meeting') THEN
    _user_id := auth.uid();
    IF _user_id IS NULL THEN
      SELECT user_id INTO _user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1;
    END IF;
    IF _user_id IS NOT NULL THEN
      PERFORM public.dispatch_smart_notification(
        _user_id, NEW.id, 'meeting_booked',
        COALESCE(NEW.full_name, NEW.phone_number, 'Prospect'),
        'Prospect moved into Negotiation / Meeting stage.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_meeting_notify ON public.leads;
CREATE TRIGGER lead_meeting_notify
AFTER UPDATE OF lead_stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_meeting_notify();
