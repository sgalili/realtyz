SELECT set_config('request.jwt.claim.role','service_role',false);
INSERT INTO public.broker_whatsapp_batches(id,created_by) VALUES ('00000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000001');
INSERT INTO public.broker_whatsapp_jobs(id,broker_id,workspace_owner_id,listing_id,source_url,created_by,batch_id,status,lease_token,lease_until,worker_id) VALUES ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000012','https://www.yad2.co.il/realestate/item/ghi789','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000080','running','00000000-0000-0000-0000-000000000098',now()+interval '120 seconds','batch-worker');
INSERT INTO public.broker_whatsapp_jobs(id,broker_id,workspace_owner_id,listing_id,source_url,created_by,batch_id,status) VALUES ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000012','https://www.yad2.co.il/realestate/item/ghi789','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000080','completed');
DO $$ DECLARE n integer; rejected boolean:=false; BEGIN
 n:=public.cancel_broker_whatsapp_batch('00000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000001');
 IF n<>1 THEN RAISE EXCEPTION 'Cancel did not affect exactly the active batch job'; END IF;
 IF (SELECT status FROM public.broker_whatsapp_jobs WHERE id='00000000-0000-0000-0000-000000000024')<>'completed' THEN RAISE EXCEPTION 'Completed job changed'; END IF;
 IF (SELECT status FROM public.broker_whatsapp_jobs WHERE id='00000000-0000-0000-0000-000000000021')<>'pending' THEN RAISE EXCEPTION 'Unrelated discovery changed'; END IF;
 IF (SELECT whatsapp_phone FROM public.broker_whatsapp_contacts WHERE broker_id='00000000-0000-0000-0000-000000000004')<>'972503333333' THEN RAISE EXCEPTION 'Saved contact changed'; END IF;
 IF (SELECT counter FROM public.broker_import_jobs LIMIT 1)<>17 THEN RAISE EXCEPTION 'Import changed'; END IF;
 BEGIN PERFORM public.finish_broker_whatsapp_discovery('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000098','batch-worker','972503333333'); EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Late worker result accepted'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.broker_whatsapp_jobs(broker_id,workspace_owner_id,listing_id,source_url,created_by,batch_id) VALUES('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000012','https://www.yad2.co.il/realestate/item/ghi789','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000080'); EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Late batch enqueue accepted'; END IF;
 IF public.cancel_broker_whatsapp_batch('00000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000001')<>0 THEN RAISE EXCEPTION 'Repeated stop not idempotent'; END IF;
END $$;
SELECT 'bulk cancellation fences late results and enqueues without changing saved contacts, settled jobs or imports';