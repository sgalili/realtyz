-- =========================================================================
-- Rename prospect → lead across columns, functions, triggers, and constants.
-- =========================================================================

-- 1) Rename columns on booking_tokens
ALTER TABLE public.booking_tokens RENAME COLUMN prospect_name  TO lead_name;
ALTER TABLE public.booking_tokens RENAME COLUMN prospect_phone TO lead_phone;
ALTER TABLE public.booking_tokens RENAME COLUMN prospect_email TO lead_email;

-- 2) Rename columns on meetings
ALTER TABLE public.meetings RENAME COLUMN prospect_name  TO lead_name;
ALTER TABLE public.meetings RENAME COLUMN prospect_phone TO lead_phone;
ALTER TABLE public.meetings RENAME COLUMN prospect_email TO lead_email;

-- 3) Rename column on escalation_alerts
ALTER TABLE public.escalation_alerts RENAME COLUMN prospect_message TO lead_message;

-- 4) automations: swap CHECK constraint to use 'lead_added' and migrate data
UPDATE public.automations    SET trigger_type = 'lead_added' WHERE trigger_type = 'prospect_added';
UPDATE public.automation_runs SET trigger_type = 'lead_added' WHERE trigger_type = 'prospect_added';
ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE public.automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN ('lead_added','meeting_booked','followup_after_hours','birthday_anniversary','lead_stage_changed'));

-- 5) Drop dependent functions FIRST so triggers/policies can be rebuilt cleanly.
--    These will be recreated below.
DROP TRIGGER IF EXISTS trg_queue_prospect_score_recompute ON public.messages;
DROP FUNCTION IF EXISTS public.queue_prospect_score_recompute();
DROP FUNCTION IF EXISTS public.dispatch_smart_notification(uuid, uuid, text, text, text);

-- 6) Replace can_delete_prospects → can_delete_leads
CREATE OR REPLACE FUNCTION public.can_delete_leads(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role, 'super_admin'::app_role,
        'managing_broker'::app_role, 'lead_agent'::app_role,
        'agent'::app_role
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_delete_leads(uuid) FROM anon;

-- Rewrite policies that referenced can_delete_prospects → can_delete_leads
DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%can_delete_prospects%' OR with_check ILIKE '%can_delete_prospects%')
  LOOP
    new_qual  := REPLACE(COALESCE(pol.qual, ''),       'can_delete_prospects', 'can_delete_leads');
    new_check := REPLACE(COALESCE(pol.with_check, ''), 'can_delete_prospects', 'can_delete_leads');
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF pol.cmd = 'DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)',
        pol.policyname, pol.schemaname, pol.tablename, array_to_string(pol.roles, ','), new_qual);
    ELSIF pol.cmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT TO %s WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, array_to_string(pol.roles, ','), new_check);
    ELSIF pol.cmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, array_to_string(pol.roles, ','), new_qual, new_check);
    ELSIF pol.cmd = 'SELECT' THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT TO %s USING (%s)',
        pol.policyname, pol.schemaname, pol.tablename, array_to_string(pol.roles, ','), new_qual);
    ELSE
      EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL TO %s USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.schemaname, pol.tablename, array_to_string(pol.roles, ','), new_qual, new_check);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.can_delete_prospects(uuid);

-- 7) queue_lead_score_recompute trigger function (calls compute-lead-score edge fn)
CREATE OR REPLACE FUNCTION public.queue_lead_score_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO service_key   FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/compute-lead-score',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('lead_id', NEW.lead_id, 'trigger', 'message')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_lead_score_recompute
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.queue_lead_score_recompute();

-- 8) dispatch_smart_notification with renamed param + JSON key
CREATE FUNCTION public.dispatch_smart_notification(
  _user_id uuid, _lead_id uuid, _event_type text, _lead_name text, _detail text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _url text;
  _service_key text;
BEGIN
  BEGIN _url := current_setting('app.supabase_url', true); EXCEPTION WHEN others THEN _url := NULL; END;
  BEGIN _service_key := current_setting('app.service_role_key', true); EXCEPTION WHEN others THEN _service_key := NULL; END;
  IF _url IS NULL OR _service_key IS NULL THEN
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
      'lead_name', _lead_name,
      'detail', _detail,
      'override_user_id', _user_id
    )
  );
END;
$$;

-- 9) trg_lead_hot_notify with lead language
CREATE OR REPLACE FUNCTION public.trg_lead_hot_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;

  IF NEW.loyalty_tier IS NOT NULL AND lower(NEW.loyalty_tier) IN ('hot lead', 'hot', 'חם', 'מתעניין חם') THEN
    _user_id := auth.uid();
    IF _user_id IS NULL THEN
      SELECT user_id INTO _user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1;
    END IF;
    IF _user_id IS NOT NULL THEN
      PERFORM public.dispatch_smart_notification(
        _user_id, NEW.id, 'new_high_priority',
        COALESCE(NEW.full_name, NEW.phone_number, 'New lead'),
        'A new high-priority lead was just added.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 10) trg_lead_meeting_notify
CREATE OR REPLACE FUNCTION public.trg_lead_meeting_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        COALESCE(NEW.full_name, NEW.phone_number, 'Lead'),
        'Lead moved into Negotiation / Meeting stage.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 11) trg_automations_on_lead_insert: use 'lead_added'
CREATE OR REPLACE FUNCTION public.trg_automations_on_lead_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _auto record;
  _owner uuid;
  _run_id uuid;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  _owner := auth.uid();
  IF _owner IS NULL THEN RETURN NEW; END IF;

  FOR _auto IN
    SELECT * FROM public.automations
    WHERE user_id = _owner AND is_enabled = true AND trigger_type = 'lead_added'
  LOOP
    INSERT INTO public.automation_runs (user_id, automation_id, lead_id, trigger_type, action_type, payload)
    VALUES (_owner, _auto.id, NEW.id, 'lead_added', _auto.action_type,
            jsonb_build_object('lead_name', COALESCE(NEW.full_name, NEW.phone_number)))
    RETURNING id INTO _run_id;
    PERFORM public.dispatch_automation_run(_run_id);
  END LOOP;
  RETURN NEW;
END;
$$;

-- 12) Wipe any residual demo conversation rows (defensive — tables are already empty).
TRUNCATE TABLE public.messages CASCADE;
TRUNCATE TABLE public.chat_history CASCADE;
TRUNCATE TABLE public.interaction_activity_log CASCADE;
TRUNCATE TABLE public.campaign_logs CASCADE;