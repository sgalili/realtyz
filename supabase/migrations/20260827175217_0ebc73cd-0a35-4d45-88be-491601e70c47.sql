CREATE OR REPLACE FUNCTION public.trigger_speed_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cfg public.speed_to_lead_settings;
  owner_id uuid;
  lead_name text;
  greeting text;
  followup text;
BEGIN
  owner_id := NEW.assigned_to;
  IF owner_id IS NULL OR NEW.phone_number IS NULL OR btrim(NEW.phone_number) = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cfg FROM public.speed_to_lead_settings WHERE user_id = owner_id;
  IF cfg.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  lead_name := COALESCE(NULLIF(TRIM(NEW.full_name), ''), 'שלום');

  IF cfg.greeting_enabled THEN
    greeting := replace(cfg.greeting_body, '{{name}}', lead_name);
    INSERT INTO public.autopilot_queue (user_id, lead_id, message_content, template_id, scheduled_at)
    VALUES (owner_id, NEW.id, greeting, 'speed_to_lead_greeting', now());

    INSERT INTO public.interaction_activity_log (user_id, thread_key, platform, action_type, actor_type, actor_label, content, metadata)
    VALUES (owner_id, 'lead:' || NEW.id, 'whatsapp', 'automation', 'system', 'Speed to Lead', greeting,
            jsonb_build_object('lead_id', NEW.id, 'trigger', 'speed_to_lead_greeting'));
  END IF;

  IF cfg.followup_enabled THEN
    followup := replace(cfg.followup_body, '{{name}}', lead_name);
    INSERT INTO public.autopilot_queue (user_id, lead_id, message_content, template_id, scheduled_at)
    VALUES (owner_id, NEW.id, followup, 'speed_to_lead_followup',
            now() + make_interval(mins => cfg.followup_delay_minutes));

    INSERT INTO public.interaction_activity_log (user_id, thread_key, platform, action_type, actor_type, actor_label, content, metadata)
    VALUES (owner_id, 'lead:' || NEW.id, 'whatsapp', 'automation', 'system', 'Speed to Lead', followup,
            jsonb_build_object('lead_id', NEW.id, 'trigger', 'speed_to_lead_followup',
                               'scheduled_at', now() + make_interval(mins => cfg.followup_delay_minutes)));
  END IF;

  RETURN NEW;
END;
$fn$;