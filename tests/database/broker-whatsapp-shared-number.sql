SELECT set_config('request.jwt.claim.role','service_role',false);
INSERT INTO public.profiles(id,phone) VALUES('00000000-0000-0000-0000-000000000031','972505555551'),('00000000-0000-0000-0000-000000000032','972505555552'),('00000000-0000-0000-0000-000000000033','972505555553');
INSERT INTO public.listings(id,user_id,workspace_owner_id,source_url) VALUES
 ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000031','https://www.yad2.co.il/realestate/item/sh1'),
 ('00000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000032','https://www.yad2.co.il/realestate/item/sh2'),
 ('00000000-0000-0000-0000-000000000043','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000033','https://www.yad2.co.il/realestate/item/sh3');
INSERT INTO public.broker_whatsapp_jobs(id,broker_id,workspace_owner_id,listing_id,source_url,created_by,status,attempts,lease_token,lease_until,worker_id) VALUES
 ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000041','https://www.yad2.co.il/realestate/item/sh1','00000000-0000-0000-0000-000000000001','running',1,'00000000-0000-0000-0000-000000000061',now()+interval '120 seconds','w'),
 ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000042','https://www.yad2.co.il/realestate/item/sh2','00000000-0000-0000-0000-000000000001','running',1,'00000000-0000-0000-0000-000000000062',now()+interval '120 seconds','w'),
 ('00000000-0000-0000-0000-000000000053','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000043','https://www.yad2.co.il/realestate/item/sh3','00000000-0000-0000-0000-000000000001','running',1,'00000000-0000-0000-0000-000000000063',now()+interval '120 seconds','w');
DO $$
BEGIN
 IF has_table_privilege('authenticated','public.broker_whatsapp_shared_numbers','SELECT') THEN RAISE EXCEPTION 'Shared list exposed'; END IF;
 -- Known Yad2 central number is never saved.
 PERFORM public.finish_broker_whatsapp_discovery('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000061','w','972559895695');
 IF EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id='00000000-0000-0000-0000-000000000031') THEN RAISE EXCEPTION 'Yad2 central number saved'; END IF;
 IF (SELECT last_error FROM public.broker_whatsapp_jobs WHERE id='00000000-0000-0000-0000-000000000051')<>'shared_whatsapp_number' THEN RAISE EXCEPTION 'Shared rejection not recorded'; END IF;
 -- First broker gets a number; a second broker with the same discovered number marks it shared and clears both.
 PERFORM public.finish_broker_whatsapp_discovery('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000062','w','972507777777');
 IF NOT EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE broker_id='00000000-0000-0000-0000-000000000032') THEN RAISE EXCEPTION 'Unique number not saved'; END IF;
 PERFORM public.finish_broker_whatsapp_discovery('00000000-0000-0000-0000-000000000053','00000000-0000-0000-0000-000000000063','w','972507777777');
 IF EXISTS(SELECT 1 FROM public.broker_whatsapp_contacts WHERE whatsapp_phone='972507777777') THEN RAISE EXCEPTION 'Shared number stayed on a broker'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.broker_whatsapp_shared_numbers WHERE whatsapp_phone='972507777777') THEN RAISE EXCEPTION 'Shared number not blocked'; END IF;
END $$;
SELECT 'broker WhatsApp shared-number tests passed';
