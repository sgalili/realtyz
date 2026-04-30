
-- 768-dim to match Gemini embedding output (text-embedding-004)
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW index for cosine similarity (best general-purpose choice)
CREATE INDEX IF NOT EXISTS idx_listings_embedding_cosine
  ON public.listings USING hnsw (embedding vector_cosine_ops);

-- Build a normalized text blob for embedding from a listing row
CREATE OR REPLACE FUNCTION public.listing_embedding_text(l public.listings)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT concat_ws(E'\n',
    'Title: '       || COALESCE(l.property_title, ''),
    'Description: ' || COALESCE(l.description, ''),
    'Price: '       || COALESCE(l.asking_price::text, ''),
    'Features: '    || COALESCE(l.features::text, '[]')
  );
$$;

-- Matching RPC: caller supplies the query embedding (computed in the edge function).
-- We restrict to listings owned by the lead's user so users only see their own catalog.
CREATE OR REPLACE FUNCTION public.match_listings_to_lead(
  p_lead_id uuid,
  p_query_embedding vector(768),
  p_match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  property_title text,
  description text,
  asking_price numeric,
  features jsonb,
  slug text,
  similarity float
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.leads WHERE id = p_lead_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.property_title,
    l.description,
    l.asking_price,
    l.features,
    l.slug,
    (1 - (l.embedding <=> p_query_embedding))::float AS similarity
  FROM public.listings l
  WHERE l.user_id = owner
    AND l.is_published = true
    AND l.embedding IS NOT NULL
  ORDER BY l.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
