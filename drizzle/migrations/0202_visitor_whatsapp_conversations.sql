CREATE TABLE public.visitor_whatsapp_sessions (phone text PRIMARY KEY CHECK (phone ~ '^[0-9]{8,15}$'), display_name text, initial_message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.visitor_whatsapp_sessions TO service_role;
ALTER TABLE public.visitor_whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.visitor_whatsapp_messages (message_id text PRIMARY KEY, phone text NOT NULL REFERENCES public.visitor_whatsapp_sessions(phone), content text NOT NULL, reply text, state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','sent','failed','blocked')), error_code text, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.visitor_whatsapp_messages TO service_role;
ALTER TABLE public.visitor_whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX visitor_whatsapp_history ON public.visitor_whatsapp_messages(phone, created_at);
CREATE OR REPLACE FUNCTION public.claim_visitor_whatsapp_message(_phone text, _name text, _text text, _message_id text, _introduction boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_session boolean := false; claimed text;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _phone !~ '^[0-9]{8,15}$' OR length(_text) NOT BETWEEN 1 AND 3000 OR length(_message_id) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'Invalid visitor message'; END IF;
 IF _introduction THEN
 INSERT INTO public.visitor_whatsapp_sessions(phone, display_name, initial_message) VALUES (_phone, left(_name,100), _text) ON CONFLICT DO NOTHING;
 new_session := FOUND;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.visitor_whatsapp_sessions WHERE phone = _phone) THEN RETURN 'not_visitor'; END IF;
 INSERT INTO public.visitor_whatsapp_messages(message_id, phone, content) VALUES (_message_id, _phone, _text) ON CONFLICT DO NOTHING RETURNING message_id INTO claimed;
 IF claimed IS NULL THEN RETURN 'duplicate'; END IF;
 IF new_session THEN
 INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel, delivered, delivery_result)
 SELECT DISTINCT user_id, 'visitor_whatsapp', 'פנייה חדשה לריטה מ־TORAFF', coalesce(nullif(left(_name,100),''),'מבקר/ת') || E'\n' || _phone || E'\n' || _text, '/super-admin', 'in_app', true, '{"quiet":true}'::jsonb FROM public.user_roles WHERE role = 'super_admin';
 END IF;
 RETURN 'claimed';
END $$;
REVOKE ALL ON FUNCTION public.claim_visitor_whatsapp_message(text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visitor_whatsapp_message(text,text,text,text,boolean) TO service_role;