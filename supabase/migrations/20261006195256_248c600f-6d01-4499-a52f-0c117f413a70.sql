CREATE TABLE public.listing_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);
GRANT SELECT, INSERT, DELETE ON public.listing_favorites TO authenticated;
GRANT ALL ON public.listing_favorites TO service_role;
ALTER TABLE public.listing_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own favorites" ON public.listing_favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX listing_favorites_user_idx ON public.listing_favorites (user_id);