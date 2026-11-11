DO $do$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.begin_social_draft'::regproc);
 IF position('price:=0.08;' in d) = 0 THEN RAISE EXCEPTION 'social price pattern missing'; END IF;
 EXECUTE replace(d, 'price:=0.08;', 'price:=public.credits_to_ils(2);');
 d := pg_get_functiondef('public.get_scraping_usage_report'::regproc);
 IF position('sum(-amount_ils)*25' in d) = 0 THEN RAISE EXCEPTION 'usage pattern missing'; END IF;
 EXECUTE replace(d, 'sum(-amount_ils)*25', 'sum(-amount_ils)*public.get_credits_per_ils()');
END $do$;