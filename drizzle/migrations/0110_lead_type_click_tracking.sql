CREATE TABLE public.lead_type_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  workspace_owner_id uuid NOT NULL,
  lead_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_type_clicks TO authenticated;
GRANT ALL ON public.lead_type_clicks TO service_role;
ALTER TABLE public.lead_type_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace reads own lead clicks" ON public.lead_type_clicks FOR SELECT TO authenticated
  USING (public.can_access_workspace_owner(workspace_owner_id));
CREATE INDEX lead_type_clicks_ws_idx ON public.lead_type_clicks (workspace_owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_lead_type_click(_listing_id uuid, _lead_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF _lead_type NOT IN ('form','whatsapp','phone') THEN RETURN; END IF;
  SELECT workspace_owner_id INTO _owner FROM public.listings WHERE id = _listing_id;
  IF _owner IS NULL THEN RETURN; END IF;
  INSERT INTO public.lead_type_clicks (listing_id, workspace_owner_id, lead_type) VALUES (_listing_id, _owner, _lead_type);
END $$;
GRANT EXECUTE ON FUNCTION public.record_lead_type_click(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_lead_type_conversion(_owner uuid, _days integer DEFAULT 90)
RETURNS TABLE(lead_type text, clicks bigint, leads bigint, closed bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_workspace_owner(_owner) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH t(lead_type, tier) AS (VALUES ('form',1),('whatsapp',2),('phone',3)),
  c AS (SELECT k.lead_type, count(*) n FROM public.lead_type_clicks k
        WHERE k.workspace_owner_id = _owner AND k.created_at >= now() - make_interval(days => _days) GROUP BY 1),
  l AS (SELECT DISTINCT ON (ch.lead_id) ch.lead_id, ch.tier FROM public.listing_lead_charges ch
        WHERE ch.workspace_owner_id = _owner AND ch.lead_id IS NOT NULL AND ch.created_at >= now() - make_interval(days => _days)
        ORDER BY ch.lead_id, ch.created_at),
  s AS (SELECT l.tier, count(*) n,
          count(*) FILTER (WHERE lower(coalesce(ld.lead_stage,'')) IN ('closed','won','converted') OR ld.interaction_outcome = 'Closed Won') w
        FROM l JOIN public.leads ld ON ld.id = l.lead_id GROUP BY 1)
  SELECT t.lead_type, coalesce(c.n,0), coalesce(s.n,0), coalesce(s.w,0)
  FROM t LEFT JOIN c ON c.lead_type = t.lead_type LEFT JOIN s ON s.tier = t.tier ORDER BY t.tier;
END $$;
GRANT EXECUTE ON FUNCTION public.get_lead_type_conversion(uuid, integer) TO authenticated;