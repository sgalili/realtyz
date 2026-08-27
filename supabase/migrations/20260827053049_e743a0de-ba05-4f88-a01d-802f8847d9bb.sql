CREATE OR REPLACE FUNCTION public.crm_safe_numeric(_t text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (regexp_match(coalesce(_t,''), '(-?\d+(?:\.\d+)?)'))[1]::numeric
$$;