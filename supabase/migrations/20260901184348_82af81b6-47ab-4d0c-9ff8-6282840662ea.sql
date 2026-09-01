CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  result jsonb;
  q text := trim(query_text);
BEGIN
  IF upper(q) NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Strip a trailing semicolon so the wrapper subquery stays valid.
  q := regexp_replace(q, ';\s*$', '');

  IF q ~* ';' THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;

  -- Block dangerous keywords as WHOLE WORDS only, so legitimate identifiers
  -- such as created_at / updated_at / is_deleted no longer trip the guard.
  IF q ~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|execute|copy|vacuum)\M' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || q || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.execute_readonly_query(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text) TO service_role;