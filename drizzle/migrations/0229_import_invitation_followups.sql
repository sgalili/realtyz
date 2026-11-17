ALTER TABLE public.admin_broker_onboarding ADD COLUMN invitation_link_token uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN invitation_clicked_at timestamptz, ADD COLUMN first_invitation_at timestamptz, ADD COLUMN first_invitation_channel text;
CREATE UNIQUE INDEX admin_onboarding_invitation_token_idx ON public.admin_broker_onboarding(invitation_link_token);
CREATE TABLE public.import_invitation_followups (user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, channel text NOT NULL CHECK(channel IN ('whatsapp','email')), due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','pending','cancelled')), message text NOT NULL, queued_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.import_invitation_followups TO authenticated; GRANT ALL ON public.import_invitation_followups TO service_role;
ALTER TABLE public.import_invitation_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY super_admin_read_invitation_followups ON public.import_invitation_followups FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));
CREATE FUNCTION public.queue_import_invitation_followup(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE j record; BEGIN
UPDATE public.import_invitation_followups f SET status=CASE WHEN o.invitation_clicked_at IS NOT NULL OR o.first_login_at IS NOT NULL OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id=f.user_id AND u.last_sign_in_at IS NOT NULL) OR (f.channel='email' AND (o.email_consent_at IS NULL OR o.email_unsubscribed_at IS NOT NULL)) THEN 'cancelled' ELSE 'pending' END, queued_at=now() FROM public.admin_broker_onboarding o WHERE f.user_id=p_user AND o.user_id=f.user_id AND f.status='scheduled' AND f.due_at<=now();
FOR j IN SELECT jobid FROM cron.job WHERE jobname='import-invitation-'||p_user::text LOOP PERFORM cron.unschedule(j.jobid); END LOOP; END $$;
REVOKE ALL ON FUNCTION public.queue_import_invitation_followup(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.queue_import_invitation_followup(uuid) TO service_role;
CREATE FUNCTION public.track_import_invitation_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE sent timestamptz; channel text; due timestamptz; j record; BEGIN
IF NEW.first_invitation_at IS NULL THEN
IF NEW.invitation_message_id IS NOT NULL AND NEW.invited_at IS NOT NULL THEN sent:=NEW.invited_at; channel:='whatsapp'; END IF;
IF NEW.email_message_id IS NOT NULL AND NEW.email_invited_at IS NOT NULL AND (sent IS NULL OR NEW.email_invited_at<sent) THEN sent:=NEW.email_invited_at; channel:='email'; END IF;
IF sent IS NOT NULL THEN NEW.first_invitation_at:=sent; NEW.first_invitation_channel:=channel; END IF; END IF;
IF NEW.first_invitation_at IS NOT NULL AND NEW.import_source IS NOT NULL THEN
 due:=NEW.first_invitation_at+interval '48 hours';
INSERT INTO public.import_invitation_followups(user_id,channel,due_at,message) VALUES(NEW.user_id,NEW.first_invitation_channel,due,'שלום, החשבון שלך ב-TORAFF כבר מוכן ומחכה לך. פרסום נכסים ופרויקטים של יזמים הוא חינם לחלוטין, ללא דמי מנוי חודשיים וללא התחייבות. אפשר להיכנס, לבדוק את הפרטים ולקבוע דמי סגירה ותגמולים להפצה בלוח וברשת השותפים. נשמח לראות אותך!') ON CONFLICT(user_id) DO NOTHING;
IF NEW.invitation_clicked_at IS NOT NULL OR NEW.first_login_at IS NOT NULL THEN
UPDATE public.import_invitation_followups SET status='cancelled' WHERE user_id=NEW.user_id AND status IN ('scheduled','pending');
FOR j IN SELECT jobid FROM cron.job WHERE jobname='import-invitation-'||NEW.user_id::text LOOP PERFORM cron.unschedule(j.jobid); END LOOP;
ELSIF EXISTS(SELECT 1 FROM public.import_invitation_followups WHERE user_id=NEW.user_id AND status='scheduled') AND NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='import-invitation-'||NEW.user_id::text) THEN
 due:=greatest(due,now())+interval '1 minute';
PERFORM cron.schedule('import-invitation-'||NEW.user_id::text,to_char(due AT TIME ZONE 'UTC','MI HH24 DD MM')||' *',format('SELECT public.queue_import_invitation_followup(%L::uuid)',NEW.user_id)); END IF; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.track_import_invitation_state() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER track_import_invitation_state BEFORE INSERT OR UPDATE ON public.admin_broker_onboarding FOR EACH ROW EXECUTE FUNCTION public.track_import_invitation_state();
UPDATE public.admin_broker_onboarding SET invited_at=invited_at WHERE import_source IS NOT NULL AND (invitation_message_id IS NOT NULL OR email_message_id IS NOT NULL);
INSERT INTO public.admin_broker_onboarding(user_id,created_by,import_source,contact_status) SELECT DISTINCT p.id,a.actor_id,'developer_import',CASE WHEN p.phone IS NULL THEN 'pending_contact' ELSE 'complete' END FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id AND r.role='developer' JOIN public.audit_logs a ON a.target_id=p.id::text AND a.action='super_admin.create_user' AND a.details->>'import_job_id' IS NOT NULL WHERE NOT EXISTS(SELECT 1 FROM public.admin_broker_onboarding o WHERE o.user_id=p.id) ON CONFLICT(user_id) DO NOTHING;