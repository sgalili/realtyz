CREATE TABLE public.broker_outreach_journeys (
 broker_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 workspace_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_by uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 message_consent_at timestamptz,
 call_consent_at timestamptz,
 consent_note text,
 stage text NOT NULL DEFAULT 'prepared',
 outreach_message_id text,
 outreach_channel text,
 interested_at timestamptz,
 opted_out_at timestamptz,
 otp_verified_at timestamptz,
 first_otp_login_at timestamptz,
 call_due_at timestamptz,
 call_status text NOT NULL DEFAULT 'not_scheduled',
 cancel_requested_at timestamptz,
 call_provider_id text,
 voice_status text NOT NULL DEFAULT 'not_requested',
 voice_message_id text,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT outreach_workspace_identity CHECK(workspace_owner_id=broker_id)
);
GRANT SELECT ON public.broker_outreach_journeys TO authenticated;
GRANT ALL ON public.broker_outreach_journeys TO service_role;
ALTER TABLE public.broker_outreach_journeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_outreach_super_admin_read ON public.broker_outreach_journeys FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()));
CREATE TABLE public.broker_outreach_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 broker_id uuid NOT NULL REFERENCES public.broker_outreach_journeys(broker_id) ON DELETE CASCADE,
 workspace_owner_id uuid NOT NULL,
 event_key text NOT NULL UNIQUE,
 kind text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broker_outreach_events TO authenticated;
GRANT ALL ON public.broker_outreach_events TO service_role;
ALTER TABLE public.broker_outreach_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_events_admin_read ON public.broker_outreach_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()));
CREATE INDEX outreach_events_broker_time ON public.broker_outreach_events(broker_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.configure_broker_outreach(_broker uuid,_enabled boolean,_message_consent boolean,_call_consent boolean,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_broker AND imported_license_number IS NOT NULL) OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_broker AND role::text IN ('developer','marketing_company','super_admin')) THEN RAISE EXCEPTION 'imported_broker_required'; END IF;
 IF (_message_consent OR _call_consent) AND length(trim(COALESCE(_note,'')))<3 THEN RAISE EXCEPTION 'consent_evidence_required'; END IF;
 INSERT INTO public.broker_outreach_journeys(broker_id,workspace_owner_id,created_by,enabled,message_consent_at,call_consent_at,consent_note) VALUES(_broker,_broker,auth.uid(),_enabled,CASE WHEN _message_consent THEN now() END,CASE WHEN _call_consent THEN now() END,left(_note,500))
 ON CONFLICT(broker_id) DO UPDATE SET enabled=_enabled,message_consent_at=CASE WHEN _message_consent THEN COALESCE(broker_outreach_journeys.message_consent_at,now()) END,call_consent_at=CASE WHEN _call_consent THEN COALESCE(broker_outreach_journeys.call_consent_at,now()) END,consent_note=left(_note,500),cancel_requested_at=CASE WHEN NOT _enabled OR NOT _call_consent THEN now() ELSE broker_outreach_journeys.cancel_requested_at END,updated_at=now();
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'broker.outreach_configured','broker_outreach_journeys',_broker::text,jsonb_build_object('enabled',_enabled,'message_consent',_message_consent,'call_consent',_call_consent));
END $$;
REVOKE ALL ON FUNCTION public.configure_broker_outreach(uuid,boolean,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_broker_outreach(uuid,boolean,boolean,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.activate_broker_outreach_login(_broker uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_outreach_journeys; recipient record; broker_name text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_outreach_journeys WHERE broker_id=_broker FOR UPDATE;
 IF NOT FOUND OR NOT j.enabled OR j.first_otp_login_at IS NOT NULL OR j.otp_verified_at IS NULL OR j.otp_verified_at<now()-interval '15 minutes' OR j.opted_out_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding WHERE user_id=_broker AND first_login_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=_broker) THEN RETURN NULL; END IF;
 UPDATE public.broker_outreach_journeys SET first_otp_login_at=now(),call_due_at=CASE WHEN j.call_consent_at IS NOT NULL AND j.interested_at IS NOT NULL THEN now()+interval '60 seconds' END,call_status=CASE WHEN j.call_consent_at IS NOT NULL AND j.interested_at IS NOT NULL THEN 'ready_to_schedule' ELSE 'consent_required' END,stage='first_login',updated_at=now() WHERE broker_id=_broker RETURNING * INTO j;
 SELECT full_name INTO broker_name FROM public.profiles WHERE id=_broker;
 FOR recipient IN SELECT user_id FROM public.user_roles WHERE role='super_admin' LOOP
 INSERT INTO public.notifications(user_id,event_type,title,body,deep_link,channel,delivered) VALUES(recipient.user_id,'broker_first_otp_login','כניסה ראשונה של מתווך',COALESCE(broker_name,'מתווך')||' נכנס לחשבון בפעם הראשונה. אפשר לפתוח את החשבון ולנהל את שיחת ההדגמה.','/super-admin/broker/'||_broker::text,'in_app',true);
 END LOOP;
 INSERT INTO public.broker_outreach_events(broker_id,workspace_owner_id,event_key,kind) VALUES(_broker,_broker,'first-otp-login:'||_broker::text,'first_otp_login') ON CONFLICT(event_key) DO NOTHING;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.activate_broker_outreach_login(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_broker_outreach_login(uuid) TO service_role;