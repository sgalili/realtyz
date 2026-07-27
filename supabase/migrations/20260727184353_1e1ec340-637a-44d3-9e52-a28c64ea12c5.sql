DROP TRIGGER IF EXISTS homely_push_on_lead_insert ON public.leads;
UPDATE public.user_api_keys SET homely_auto_push = false WHERE homely_auto_push IS TRUE;