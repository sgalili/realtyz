CREATE OR REPLACE FUNCTION public.enforce_plan_contact_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _limit INT; _count INT; _unlimited BOOLEAN; _owner uuid;
BEGIN
  _owner := COALESCE(NEW.assigned_to, auth.uid());
  IF _owner IS NULL OR coalesce(NEW.is_demo,false) THEN RETURN NEW; END IF;

  SELECT is_unlimited INTO _unlimited FROM public.profiles WHERE id = _owner;
  IF coalesce(_unlimited,false) THEN RETURN NEW; END IF;

  SELECT p.contact_limit INTO _limit
    FROM public.user_subscriptions s JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = _owner AND s.status = 'active'
    ORDER BY s.created_at LIMIT 1;
  IF _limit IS NULL THEN SELECT contact_limit INTO _limit FROM public.plans WHERE name = 'free'; END IF;
  IF _limit IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO _count FROM public.leads
    WHERE coalesce(is_demo,false) = false
      AND (assigned_to = _owner OR assigned_to IS NULL);
  IF _count >= _limit THEN
    RAISE EXCEPTION 'CONTACT_LIMIT_REACHED: הגעת למגבלת אנשי הקשר בחבילה (%). שדרג חבילה כדי להוסיף עוד.', _limit;
  END IF;
  RETURN NEW;
END; $function$;