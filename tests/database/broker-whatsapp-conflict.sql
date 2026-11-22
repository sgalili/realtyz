SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.finish_broker_whatsapp_discovery('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000099','race-worker','972506666666');
DO $$ BEGIN
 IF (SELECT status FROM public.broker_whatsapp_jobs WHERE id='00000000-0000-0000-0000-000000000022')<>'failed' THEN RAISE EXCEPTION 'Conflicting contact falsely completed'; END IF;
 IF (SELECT last_error FROM public.broker_whatsapp_jobs WHERE id='00000000-0000-0000-0000-000000000022')<>'whatsapp_contact_changed_requires_review' THEN RAISE EXCEPTION 'Conflict not recorded'; END IF;
 IF (SELECT whatsapp_phone FROM public.broker_whatsapp_contacts WHERE broker_id='00000000-0000-0000-0000-000000000004')<>'972503333333' THEN RAISE EXCEPTION 'Manual contact overwritten'; END IF;
 IF (SELECT phone FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000004')<>'972504444444' THEN RAISE EXCEPTION 'Login phone changed'; END IF;
END $$;
SELECT 'concurrent manual contact preserved; no false completion or login change';