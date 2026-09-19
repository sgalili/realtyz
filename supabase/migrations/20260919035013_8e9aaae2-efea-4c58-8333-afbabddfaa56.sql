DROP POLICY IF EXISTS "Anon can view published listings" ON public.listings;

CREATE POLICY "Private owners view their own listings"
  ON public.listings FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Private owners update their own listings"
  ON public.listings FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.public_listing_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  workspace_owner_id uuid NOT NULL,
  visitor_name text NOT NULL,
  visitor_phone text NOT NULL,
  callback_window text,
  access_token text NOT NULL UNIQUE,
  intent text,
  rita_engaged_at timestamp with time zone,
  unlocked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX public_listing_interest_listing_idx ON public.public_listing_interest (listing_id);
CREATE INDEX public_listing_interest_workspace_idx ON public.public_listing_interest (workspace_owner_id);

GRANT SELECT ON public.public_listing_interest TO authenticated;
GRANT ALL ON public.public_listing_interest TO service_role;

ALTER TABLE public.public_listing_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read their public interest records"
  ON public.public_listing_interest FOR SELECT TO authenticated
  USING (ws_current_access(workspace_owner_id));

CREATE TRIGGER public_listing_interest_touch
  BEFORE UPDATE ON public.public_listing_interest
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();