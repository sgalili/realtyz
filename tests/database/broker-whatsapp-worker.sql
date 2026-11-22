SELECT set_config('request.jwt.claim.role','service_role',false);
INSERT INTO public.profiles(id,phone) VALUES ('00000000-0000-0000-0000-000000000001','972501111111'),('00000000-0000-0000-0000-000000000002','972503333333');
INSERT INTO public.listings(id,user_id,workspace_owner_id,source_url) VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','https://www.yad2.co.il/realestate/item/abc123');
INSERT INTO public.broker_import_jobs(id,counter) VALUES ('00000000-0000-0000-0000-000000000090',17);
INSERT INTO public.broker_whatsapp_jobs(id,broker_id,workspace_owner_id,listing_id,source_url,created_by) VALUES ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','https://www.yad2.co.il/realestate/item/abc123','00000000-0000-0000-0000-000000000001');
DO $$
DECLARE j public.broker_whatsapp_jobs; rejected boolean:=false;
BEGIN
 IF has_function_privilege('authenticated','public.claim_broker_whatsapp_job(text)','EXECUTE') THEN RAISE EXCEPTION 'User can claim'; END IF;
 IF has_table_privilege('anon','public.broker_whatsapp_contacts','SELECT') THEN RAISE EXCEPTION 'Public contacts'; END IF;
 SELECT * INTO j FROM public.claim_broker_whatsapp_job('test-worker');
 IF j.id IS NULL OR j.attempts<>1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_broker_whatsapp_job('second-worker')) THEN RAISE EXCEPTION 'Double claim'; END IF;
 BEGIN PERFORM public.finish_broker_whatsapp_discovery(j.id,gen_random_uuid(),'test-worker','972502222222'); EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale lease accepted'; END IF;
 PERFORM public.finish_broker_whatsapp_discovery(j.id,j.lease_token,'test-worker','972502222222');
 IF (SELECT phone FROM public.profiles WHERE id=j.broker_id)<>'972503333333' THEN RAISE EXCEPTION 'Main phone changed'; END IF;
 IF (SELECT whatsapp_link FROM public.broker_whatsapp_contacts WHERE broker_id=j.broker_id)<>'https://wa.me/972502222222' THEN RAISE EXCEPTION 'WhatsApp not saved'; END IF;
 IF (SELECT status FROM public.broker_whatsapp_jobs WHERE id=j.id)<>'completed' THEN RAISE EXCEPTION 'Unexpected discovery status'; END IF;
 IF (SELECT counter FROM public.broker_import_jobs LIMIT 1)<>17 THEN RAISE EXCEPTION 'Import was changed'; END IF;
 UPDATE public.broker_whatsapp_jobs SET status='running',attempts=3,lease_until=now()-interval '1 second' WHERE id=j.id;
 PERFORM public.claim_broker_whatsapp_job('test-worker');
 IF (SELECT status FROM public.broker_whatsapp_jobs WHERE id=j.id)<>'failed' THEN RAISE EXCEPTION 'Exhausted job stuck'; END IF;
 rejected:=false;
 BEGIN UPDATE public.broker_whatsapp_jobs SET outreach=true,consent_at=now() WHERE id=j.id; EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Automatic outreach allowed'; END IF;
END $$;
SELECT 'broker WhatsApp isolation, contact preservation and lease tests passed';