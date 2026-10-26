CREATE TABLE public.published_post_footer_allocations (
 workspace_owner_id uuid NOT NULL,
 publication_key text NOT NULL,
 ordinal bigint NOT NULL UNIQUE CHECK (ordinal > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (workspace_owner_id, publication_key)
);
GRANT ALL ON public.published_post_footer_allocations TO service_role;
REVOKE ALL ON public.published_post_footer_allocations FROM anon, authenticated;
ALTER TABLE public.published_post_footer_allocations ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.claim_published_post_footer(_workspace uuid, _publication_key text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
 IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF _workspace IS NULL OR length(coalesce(_publication_key,'')) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'invalid publication identity'; END IF;
 PERFORM pg_advisory_xact_lock(92610260546);
 SELECT ordinal INTO n FROM public.published_post_footer_allocations WHERE workspace_owner_id = _workspace AND publication_key = _publication_key;
 IF n IS NULL THEN
  SELECT coalesce(max(ordinal), 0) + 1 INTO n FROM public.published_post_footer_allocations;
  INSERT INTO public.published_post_footer_allocations(workspace_owner_id,publication_key,ordinal) VALUES (_workspace,_publication_key,n);
 END IF;
 RETURN ((n - 1) % 10)::integer;
END $$;
REVOKE ALL ON FUNCTION public.claim_published_post_footer(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_published_post_footer(uuid,text) TO service_role;