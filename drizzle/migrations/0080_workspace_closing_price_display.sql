CREATE OR REPLACE FUNCTION public.can_view_closing_prices(_workspace_owner_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _viewer uuid := auth.uid();
  _owner uuid := public.current_workspace_owner();
BEGIN
  IF _viewer IS NULL OR _owner IS NULL
     OR (_workspace_owner_id IS NOT NULL AND _workspace_owner_id <> _owner)
     OR NOT public.ws_current_access(_owner) THEN
    RETURN false;
  END IF;
  -- Administrative viewing follows the selected owner, never a supplied user
  -- identity. The personal payout/license predicate remains unchanged.
  IF public.has_role(_viewer, 'super_admin'::public.app_role) THEN
    RETURN public.partner_can_view_closing(_owner);
  END IF;
  RETURN public.partner_can_view_closing(_viewer);
END;
$function$;
REVOKE ALL ON FUNCTION public.can_view_closing_prices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_closing_prices(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_view_closing_prices(uuid) IS 'Read-only closing price entitlement: authorized Super Admin uses the selected owner official license; ordinary viewers use their own. Does not authorize payouts or broker actions.';