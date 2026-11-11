ALTER TABLE public.credit_conversion_settings ALTER COLUMN credits_per_ils SET DEFAULT 4;
UPDATE public.credit_conversion_settings SET credits_per_ils = 4, updated_at = now() WHERE id;
CREATE OR REPLACE FUNCTION public.get_credits_per_ils() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce((SELECT credits_per_ils FROM public.credit_conversion_settings WHERE id), 4) $$;