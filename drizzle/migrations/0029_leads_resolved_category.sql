ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_category text GENERATED ALWAYS AS (
  CASE
    WHEN preferences->>'lead_kind' IN ('buyer','seller','renter','landlord','broker','affiliate') THEN preferences->>'lead_kind'
    WHEN lower(coalesce(interest_tag,'')) IN ('buyer','קונה','קונים','investor','משקיע') THEN 'buyer'
    WHEN lower(coalesce(interest_tag,'')) IN ('seller','מוכר','מוכרים') THEN 'seller'
    WHEN lower(coalesce(interest_tag,'')) IN ('renter','tenant','שוכר','שוכרים') THEN 'renter'
    WHEN lower(coalesce(interest_tag,'')) IN ('landlord','משכיר','משכירים') THEN 'landlord'
    WHEN lower(coalesce(interest_tag,'')) IN ('broker','מתווך','מתווכת','מתווכים','professional') THEN 'broker'
    WHEN lower(coalesce(interest_tag,'')) IN ('partner','affiliate','שותף','שותפים') THEN 'affiliate'
    WHEN deal_type IN ('rent','rental') THEN 'renter'
    ELSE 'buyer'
  END
) STORED;
CREATE INDEX IF NOT EXISTS leads_workspace_category_idx ON public.leads (workspace_owner_id, lead_category);