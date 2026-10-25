ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS call_reminder_status text DEFAULT NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS call_reminder_error text DEFAULT NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS call_reminder_claimed_at timestamptz DEFAULT NULL;
CREATE OR REPLACE FUNCTION public.schedule_workspace_call(_owner uuid, _lead uuid, _starts_at timestamptz, _notes text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _l public.leads;
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
 IF _starts_at IS NULL OR _starts_at <= now() THEN RAISE EXCEPTION 'Call time must be in the future'; END IF;
 IF nullif(trim(_notes),'') IS NULL THEN RAISE EXCEPTION 'Call notes required'; END IF;
 SELECT * INTO _l FROM public.leads WHERE id=_lead AND workspace_owner_id=_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead not available in workspace'; END IF;
 INSERT INTO public.meetings(user_id,workspace_owner_id,lead_id,title,description,starts_at,ends_at,timezone,status,lead_name,lead_phone,metadata,call_reminder_status)
 VALUES(auth.uid(),_owner,_lead,'שיחה · '||coalesce(_l.full_name,'ליד'),trim(_notes),_starts_at,_starts_at+interval '30 minutes','Asia/Jerusalem','scheduled',_l.full_name,_l.phone_number,jsonb_build_object('action_type','call','reminder_recipient','scheduler'),'pending') RETURNING id INTO _id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.schedule_workspace_call(uuid,uuid,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_workspace_call(uuid,uuid,timestamptz,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.validate_scheduled_call() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.metadata->>'action_type'='call' THEN
  IF TG_OP='INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
   IF NEW.starts_at <= now() THEN RAISE EXCEPTION 'Call time must be in the future'; END IF;
   NEW.call_reminder_status:='pending'; NEW.call_reminder_error:=NULL; NEW.call_reminder_claimed_at:=NULL; NEW.reminder_1h_sent_at:=NULL;
   NEW.ends_at:=NEW.starts_at+interval '30 minutes';
  END IF;
  IF NEW.lead_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=NEW.lead_id AND workspace_owner_id=NEW.workspace_owner_id) THEN RAISE EXCEPTION 'Lead not available in workspace'; END IF;
  IF NEW.status='cancelled' THEN NEW.call_reminder_status:='cancelled'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_scheduled_call BEFORE INSERT OR UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.validate_scheduled_call();
CREATE INDEX IF NOT EXISTS meetings_pending_call_reminders ON public.meetings(starts_at) WHERE status='scheduled' AND metadata->>'action_type'='call' AND call_reminder_status='pending';