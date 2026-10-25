CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Broker roles always see closing pricing, even when the same account also
  -- publishes its own properties (property_owner) or browses as a seeker.
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'managing_broker')
    OR public.has_role(_user_id, 'lead_agent')
    OR public.has_role(_user_id, 'agent')
    OR (
      NOT public.has_role(_user_id, 'developer')
      AND NOT public.has_role(_user_id, 'property_owner')
      AND NOT public.has_role(_user_id, 'property_seeker')
      AND (
        EXISTS(SELECT 1 FROM public.test_broker_licenses t WHERE t.user_id=_user_id)
        OR public.affiliate_tier3_eligible(_user_id)
      )
    )
  );
$function$;