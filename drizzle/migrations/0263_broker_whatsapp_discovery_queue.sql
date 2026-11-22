CREATE TABLE public.broker_whatsapp_contacts (
 broker_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 workspace_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 whatsapp_phone text NOT NULL CHECK (whatsapp_phone ~ '^9725[0-9]{8}$'),
 whatsapp_link text NOT NULL,
 source_url text NOT NULL,
 discovered_at timestamptz NOT NULL DEFAULT now(),
 CHECK (workspace_owner_id = broker_id),
 CHECK (whatsapp_link = 'https://wa.me/' || whatsapp_phone)
);
GRANT SELECT ON public.broker_whatsapp_contacts TO authenticated;
GRANT ALL ON public.broker_whatsapp_contacts TO service_role;
ALTER TABLE public.broker_whatsapp_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY super_admin_read ON public.broker_whatsapp_contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin') AND NOT EXISTS (SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=auth.uid()));
CREATE TABLE public.broker_whatsapp_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 broker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 workspace_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
 source_url text NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 outreach boolean NOT NULL DEFAULT false,
 consent_at timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','retry','discovered','completed','not_found','failed','sending','unknown')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 worker_id text,
 last_error text,
 message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (workspace_owner_id=broker_id),
 CHECK (NOT outreach OR consent_at IS NOT NULL)
);
GRANT SELECT ON public.broker_whatsapp_jobs TO authenticated;
GRANT ALL ON public.broker_whatsapp_jobs TO service_role;
ALTER TABLE public.broker_whatsapp_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY super_admin_read ON public.broker_whatsapp_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin') AND NOT EXISTS (SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=auth.uid()));
CREATE UNIQUE INDEX broker_whatsapp_active_job ON public.broker_whatsapp_jobs(broker_id) WHERE status IN ('pending','running','retry','discovered','sending','unknown');
CREATE INDEX broker_whatsapp_ready ON public.broker_whatsapp_jobs(next_attempt_at,created_at) WHERE status IN ('pending','running','retry','discovered');
CREATE OR REPLACE FUNCTION public.claim_broker_whatsapp_job(_worker text) RETURNS SETOF public.broker_whatsapp_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_whatsapp_jobs;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF length(btrim(_worker)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 SELECT * INTO j FROM public.broker_whatsapp_jobs WHERE status IN ('pending','running','retry','discovered') AND attempts<3 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND public.has_role(created_by,'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN (created_by,broker_id)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE public.broker_whatsapp_jobs SET status=CASE WHEN j.status='discovered' THEN 'discovered' ELSE 'running' END, lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',worker_id=_worker,attempts=attempts+1,updated_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_broker_whatsapp_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broker_whatsapp_job(text) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_broker_whatsapp_discovery(_id uuid,_token uuid,_worker text,_phone text,_error text DEFAULT NULL,_retry_seconds integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_whatsapp_jobs; existing text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_whatsapp_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease_token IS DISTINCT FROM _token OR j.worker_id IS DISTINCT FROM _worker OR j.lease_until<=now() THEN RAISE EXCEPTION 'stale_worker_lease' USING ERRCODE='40001'; END IF;
 IF NOT public.has_role(j.created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN (j.created_by,j.broker_id)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings l WHERE l.id=j.listing_id AND l.workspace_owner_id=j.broker_id AND l.user_id=j.broker_id AND l.source_url=j.source_url) THEN RAISE EXCEPTION 'source_owner_changed' USING ERRCODE='42501'; END IF;
 IF _phone IS NOT NULL THEN
  IF _phone !~ '^9725[0-9]{8}$' THEN RAISE EXCEPTION 'invalid_whatsapp_phone'; END IF;
  SELECT whatsapp_phone INTO existing FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id;
  IF existing IS NOT NULL AND existing<>_phone THEN RAISE EXCEPTION 'whatsapp_contact_changed_requires_review'; END IF;
  INSERT INTO public.broker_whatsapp_contacts(broker_id,workspace_owner_id,whatsapp_phone,whatsapp_link,source_url) VALUES(j.broker_id,j.broker_id,_phone,'https://wa.me/'||_phone,j.source_url) ON CONFLICT(broker_id) DO NOTHING;
 END IF;
 UPDATE public.broker_whatsapp_jobs SET status=CASE WHEN _phone IS NOT NULL THEN CASE WHEN j.outreach THEN 'discovered' ELSE 'completed' END WHEN _error IS NULL THEN 'not_found' WHEN _retry_seconds>0 AND j.attempts<3 THEN 'retry' ELSE 'failed' END,last_error=left(_error,2000),next_attempt_at=now()+make_interval(secs=>greatest(0,least(180,_retry_seconds))),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=j.id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.finish_broker_whatsapp_discovery(uuid,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_broker_whatsapp_discovery(uuid,uuid,text,text,text,integer) TO service_role;