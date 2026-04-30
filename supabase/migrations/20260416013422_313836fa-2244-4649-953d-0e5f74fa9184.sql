
CREATE OR REPLACE FUNCTION public.bulk_update_voters(
  voter_ids uuid[],
  new_status text DEFAULT NULL,
  new_interest_tag text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Validate input
  IF array_length(voter_ids, 1) IS NULL OR array_length(voter_ids, 1) = 0 THEN
    RAISE EXCEPTION 'voter_ids array cannot be empty';
  END IF;

  IF array_length(voter_ids, 1) > 10000 THEN
    RAISE EXCEPTION 'Cannot update more than 10,000 voters at once';
  END IF;

  IF new_status IS NULL AND new_interest_tag IS NULL THEN
    RAISE EXCEPTION 'At least one field must be provided for update';
  END IF;

  UPDATE public.voters
  SET
    status = COALESCE(new_status, status),
    interest_tag = COALESCE(new_interest_tag, interest_tag),
    last_interaction_at = now()
  WHERE id = ANY(voter_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
