CREATE TABLE public.quick_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  body text NOT NULL,
  scope text NOT NULL DEFAULT 'lead',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quick_message_templates_channel_check CHECK (channel IN ('whatsapp','sms','both')),
  CONSTRAINT quick_message_templates_scope_check CHECK (scope IN ('lead','listing','both'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_message_templates TO authenticated;
GRANT ALL ON public.quick_message_templates TO service_role;
ALTER TABLE public.quick_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quick templates" ON public.quick_message_templates
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER quick_message_templates_touch
  BEFORE UPDATE ON public.quick_message_templates
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.speed_to_lead_settings (
  user_id uuid PRIMARY KEY,
  greeting_enabled boolean NOT NULL DEFAULT false,
  greeting_body text NOT NULL DEFAULT 'היי {{name}}, זה עודי מריאלטיז. קיבלתי את הפנייה שלך ואחזור אליך עם התאמות רלוונטיות בקרוב.',
  followup_enabled boolean NOT NULL DEFAULT false,
  followup_delay_minutes integer NOT NULL DEFAULT 120,
  followup_body text NOT NULL DEFAULT 'היי {{name}}, רק מוודא שראית את ההודעה שלי. מתי נוח לך לדבר?',
  quiet_hours_start integer NOT NULL DEFAULT 22,
  quiet_hours_end integer NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stl_delay_check CHECK (followup_delay_minutes BETWEEN 1 AND 10080),
  CONSTRAINT stl_quiet_check CHECK (quiet_hours_start BETWEEN 0 AND 23 AND quiet_hours_end BETWEEN 0 AND 23)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speed_to_lead_settings TO authenticated;
GRANT ALL ON public.speed_to_lead_settings TO service_role;
ALTER TABLE public.speed_to_lead_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own speed to lead settings" ON public.speed_to_lead_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER speed_to_lead_settings_touch
  BEFORE UPDATE ON public.speed_to_lead_settings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.trigger_speed_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.speed_to_lead_settings;
  lead_name text;
  greeting text;
  followup text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.phone_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cfg FROM public.speed_to_lead_settings WHERE user_id = NEW.user_id;
  IF cfg.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  lead_name := COALESCE(NULLIF(TRIM(NEW.full_name), ''), 'שלום');

  IF cfg.greeting_enabled THEN
    greeting := replace(cfg.greeting_body, '{{name}}', lead_name);
    INSERT INTO public.autopilot_queue (user_id, lead_id, message_content, template_id, scheduled_at)
    VALUES (NEW.user_id, NEW.id, greeting, 'speed_to_lead_greeting', now());

    INSERT INTO public.interaction_activity_log (user_id, thread_key, platform, action_type, actor_type, actor_label, content, metadata)
    VALUES (NEW.user_id, 'lead:' || NEW.id, 'whatsapp', 'automation', 'system', 'Speed to Lead', greeting,
            jsonb_build_object('lead_id', NEW.id, 'trigger', 'speed_to_lead_greeting'));
  END IF;

  IF cfg.followup_enabled THEN
    followup := replace(cfg.followup_body, '{{name}}', lead_name);
    INSERT INTO public.autopilot_queue (user_id, lead_id, message_content, template_id, scheduled_at)
    VALUES (NEW.user_id, NEW.id, followup, 'speed_to_lead_followup',
            now() + make_interval(mins => cfg.followup_delay_minutes));

    INSERT INTO public.interaction_activity_log (user_id, thread_key, platform, action_type, actor_type, actor_label, content, metadata)
    VALUES (NEW.user_id, 'lead:' || NEW.id, 'whatsapp', 'automation', 'system', 'Speed to Lead', followup,
            jsonb_build_object('lead_id', NEW.id, 'trigger', 'speed_to_lead_followup',
                               'scheduled_at', now() + make_interval(mins => cfg.followup_delay_minutes)));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_speed_to_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_speed_to_lead();

INSERT INTO public.quick_message_templates (user_id, title, channel, body, scope, sort_order)
SELECT p.id, t.title, t.channel, t.body, t.scope, t.ord
FROM public.profiles p
CROSS JOIN (VALUES
  ('פנייה ראשונה', 'whatsapp', 'היי {{name}}, זה עודי מריאלטיז. קיבלתי את הפנייה שלך, אשמח להבין מה אתה מחפש כדי לשלוח לך התאמות מדויקות.', 'lead', 1),
  ('תזכורת עדינה', 'whatsapp', 'היי {{name}}, רק מוודא שההודעה שלי הגיעה. מתי נוח לך לדבר?', 'lead', 2),
  ('הזמנה לצפייה', 'whatsapp', 'היי {{name}}, יש לי צפייה פנויה בנכס ב{{city}}. מתאים לך להצטרף?', 'listing', 3),
  ('שליחת נכס', 'whatsapp', 'היי {{name}}, מצאתי נכס שיכול להתאים לך: {{property}} ב{{city}} במחיר {{price}}. רוצה פרטים?', 'listing', 4),
  ('SMS קצר', 'sms', 'שלום {{name}}, עודי מריאלטיז. חזרתי אליך בנוגע לנכס. אשמח שנתאם שיחה.', 'both', 5)
) AS t(title, channel, body, scope, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.quick_message_templates q WHERE q.user_id = p.id);