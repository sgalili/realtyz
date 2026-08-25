DROP TRIGGER IF EXISTS fetch_wa_avatar_on_lead_insert ON public.leads;
DROP TRIGGER IF EXISTS fetch_wa_avatar_on_lead_update ON public.leads;
DROP FUNCTION IF EXISTS public.trg_fetch_wa_avatar();