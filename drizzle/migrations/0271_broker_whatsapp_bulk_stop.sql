CREATE TABLE public.broker_whatsapp_batches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','stopped','completed')), enqueue_finished boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.broker_whatsapp_batches TO authenticated;
GRANT ALL ON public.broker_whatsapp_batches TO service_role;
ALTER TABLE public.broker_whatsapp_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_super_admin_read ON public.broker_whatsapp_batches FOR SELECT TO authenticated USING (created_by=auth.uid() AND public.has_role(auth.uid(),'super_admin') AND NOT EXISTS (SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=auth.uid()));
CREATE UNIQUE INDEX broker_whatsapp_one_running_batch ON public.broker_whatsapp_batches(created_by) WHERE status='running';
ALTER TABLE public.broker_whatsapp_jobs ADD COLUMN batch_id uuid REFERENCES public.broker_whatsapp_batches(id) ON DELETE SET NULL;
CREATE INDEX broker_whatsapp_batch_jobs ON public.broker_whatsapp_jobs(batch_id,status) WHERE batch_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.guard_broker_whatsapp_batch_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.broker_whatsapp_batches;
BEGIN
 IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO b FROM public.broker_whatsapp_batches WHERE id=NEW.batch_id FOR SHARE;
 IF NOT FOUND OR b.status<>'running' OR b.created_by IS DISTINCT FROM NEW.created_by THEN RAISE EXCEPTION 'whatsapp_batch_stopped' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_broker_whatsapp_batch_insert() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_broker_whatsapp_batch_insert() TO service_role;
CREATE TRIGGER broker_whatsapp_batch_insert BEFORE INSERT ON public.broker_whatsapp_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_broker_whatsapp_batch_insert();
CREATE OR REPLACE FUNCTION public.cancel_broker_whatsapp_batch(_id uuid,_creator uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.broker_whatsapp_batches; n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_creator,'super_admin') OR EXISTS (SELECT 1 FROM public.demo_view_accounts WHERE user_id=_creator) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.broker_whatsapp_batches WHERE id=_id AND created_by=_creator FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden_batch' USING ERRCODE='42501'; END IF;
 IF b.status<>'running' THEN RETURN 0; END IF;
 UPDATE public.broker_whatsapp_batches SET status='stopped',updated_at=now() WHERE id=b.id;
 UPDATE public.broker_whatsapp_jobs SET status='failed',last_error='user_cancelled',lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE batch_id=b.id AND created_by=_creator AND status IN ('pending','running','retry');
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cancel_broker_whatsapp_batch(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_broker_whatsapp_batch(uuid,uuid) TO service_role;