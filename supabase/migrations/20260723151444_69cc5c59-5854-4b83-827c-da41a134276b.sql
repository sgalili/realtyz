
CREATE TABLE public.property_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  external_snapshot jsonb,
  workspace_name text,
  broker_wa text,
  lead_phone text,
  views_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_shares_owner_idx ON public.property_shares(owner_id);
CREATE INDEX property_shares_token_idx ON public.property_shares(token);

GRANT SELECT, INSERT, UPDATE ON public.property_shares TO authenticated;
GRANT ALL ON public.property_shares TO service_role;

ALTER TABLE public.property_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own shares"
  ON public.property_shares FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_property_shares_updated
  BEFORE UPDATE ON public.property_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
