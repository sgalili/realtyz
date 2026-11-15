CREATE TABLE public.distribution_funnel_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  added_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','scheduled','posting','done','paused','blocked')),
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_owner_id, listing_id)
);
GRANT SELECT ON public.distribution_funnel_items TO authenticated;
GRANT ALL ON public.distribution_funnel_items TO service_role;
ALTER TABLE public.distribution_funnel_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace reads own funnel" ON public.distribution_funnel_items FOR SELECT TO authenticated USING (public.ws_current_access(workspace_owner_id));

CREATE OR REPLACE FUNCTION public.add_listing_to_distribution_funnel(_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid := public.current_workspace_owner(); _ok boolean; _id uuid; _has_page boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_current_access(_ws) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT (l.workspace_owner_id = _ws OR (l.is_published AND l.status = 'live' AND NOT coalesce(l.distribution_paused,false)))
    INTO _ok FROM public.listings l WHERE l.id = _listing;
  IF NOT coalesce(_ok,false) THEN RAISE EXCEPTION 'listing_not_available'; END IF;
  -- Posting source is exclusively the workspace's own Page, never the shared platform Page.
  SELECT EXISTS (SELECT 1 FROM public.messenger_page_bindings b WHERE b.owner_id = _ws AND NOT b.is_platform_shared) INTO _has_page;
  INSERT INTO public.distribution_funnel_items (workspace_owner_id, listing_id, added_by,
    status, blocked_reason)
  VALUES (_ws, _listing, auth.uid(), CASE WHEN _has_page THEN 'queued' ELSE 'blocked' END, CASE WHEN _has_page THEN NULL ELSE 'own_page_required' END)
  ON CONFLICT (workspace_owner_id, listing_id) DO UPDATE SET
    status = CASE WHEN public.distribution_funnel_items.status IN ('done','paused','blocked') THEN EXCLUDED.status ELSE public.distribution_funnel_items.status END,
    blocked_reason = EXCLUDED.blocked_reason, updated_at = now()
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'own_page', _has_page);
END $$;
REVOKE ALL ON FUNCTION public.add_listing_to_distribution_funnel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_listing_to_distribution_funnel(uuid) TO authenticated;