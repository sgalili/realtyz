CREATE TABLE public.broker_whatsapp_shared_numbers (
  whatsapp_phone text PRIMARY KEY CHECK (whatsapp_phone ~ '^9725[0-9]{8}$'),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.broker_whatsapp_shared_numbers TO service_role;
REVOKE ALL ON public.broker_whatsapp_shared_numbers FROM anon, authenticated;
ALTER TABLE public.broker_whatsapp_shared_numbers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.broker_whatsapp_shared_numbers(whatsapp_phone, reason)
VALUES ('972559895695', 'yad2_central_whatsapp_observed_on_unrelated_ads')
ON CONFLICT DO NOTHING;

-- Clear any automatically discovered copy of a shared number.
DELETE FROM public.broker_whatsapp_contacts c
USING public.broker_whatsapp_shared_numbers s
WHERE c.whatsapp_phone = s.whatsapp_phone AND c.source_url <> 'manual';

CREATE OR REPLACE FUNCTION public.finish_broker_whatsapp_discovery(_id uuid, _token uuid, _worker text, _phone text, _error text DEFAULT NULL::text, _retry_seconds integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE j public.broker_whatsapp_jobs; existing text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_whatsapp_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease_token IS DISTINCT FROM _token OR j.worker_id IS DISTINCT FROM _worker OR j.lease_until<=now() THEN RAISE EXCEPTION 'stale_worker_lease' USING ERRCODE='40001'; END IF;
 IF NOT public.has_role(j.created_by,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id IN (j.created_by,j.broker_id)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings l WHERE l.id=j.listing_id AND l.workspace_owner_id=j.broker_id AND l.user_id=j.broker_id AND l.source_url=j.source_url) THEN RAISE EXCEPTION 'source_owner_changed' USING ERRCODE='42501'; END IF;
 IF _phone IS NOT NULL THEN
  IF _phone !~ '^9725[0-9]{8}$' THEN RAISE EXCEPTION 'invalid_whatsapp_phone'; END IF;
  -- Serialize shared-number decisions for this phone.
  PERFORM pg_advisory_xact_lock(hashtext('broker_whatsapp_phone:'||_phone));
  IF NOT EXISTS(SELECT 1 FROM public.broker_whatsapp_shared_numbers s WHERE s.whatsapp_phone=_phone)
     AND EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts c WHERE c.whatsapp_phone=_phone AND c.broker_id<>j.broker_id) THEN
   -- A number seen for two different brokers is a central/shared line, not a personal account.
   INSERT INTO public.broker_whatsapp_shared_numbers(whatsapp_phone,reason) VALUES(_phone,'seen_for_multiple_brokers') ON CONFLICT DO NOTHING;
   DELETE FROM public.broker_whatsapp_contacts c WHERE c.whatsapp_phone=_phone AND c.source_url<>'manual';
  END IF;
  IF EXISTS(SELECT 1 FROM public.broker_whatsapp_shared_numbers s WHERE s.whatsapp_phone=_phone) THEN
   UPDATE public.broker_whatsapp_jobs SET status='not_found',last_error='shared_whatsapp_number',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=j.id;
   RETURN jsonb_build_object('ok',true,'shared',true);
  END IF;
  INSERT INTO public.broker_whatsapp_contacts(broker_id,workspace_owner_id,whatsapp_phone,whatsapp_link,source_url) VALUES(j.broker_id,j.broker_id,_phone,'https://wa.me/'||_phone,j.source_url) ON CONFLICT(broker_id) DO NOTHING;
  SELECT whatsapp_phone INTO existing FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id FOR UPDATE;
  IF existing IS DISTINCT FROM _phone THEN
   UPDATE public.broker_whatsapp_jobs SET status='failed',last_error='whatsapp_contact_changed_requires_review',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=j.id;
   RETURN jsonb_build_object('ok',false,'error','whatsapp_contact_changed_requires_review');
  END IF;
 END IF;
 UPDATE public.broker_whatsapp_jobs SET status=CASE WHEN _phone IS NOT NULL THEN 'completed' WHEN _error IS NULL THEN 'not_found' WHEN _retry_seconds>0 AND j.attempts<3 THEN 'retry' ELSE 'failed' END,last_error=left(_error,2000),next_attempt_at=now()+make_interval(secs=>greatest(0,least(180,_retry_seconds))),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=j.id;
 RETURN jsonb_build_object('ok',true);
END $function$;