CREATE TABLE public.broker_gender_classifications (user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, classified_name text NOT NULL, result text NOT NULL CHECK(result IN ('male','female','skipped')), checked_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.broker_gender_classifications TO service_role;
ALTER TABLE public.broker_gender_classifications ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.admin_classify_verified_broker_genders(_process boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; guessed text; done integer:=0; saved integer:=0; skipped integer:=0; remaining integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _process THEN
  FOR r IN SELECT p.id,p.full_name FROM public.profiles p WHERE p.gender IS NULL AND (p.locked_broker_name IS NOT NULL OR EXISTS(SELECT 1 FROM public.broker_license_verifications v WHERE v.user_id=p.id AND v.license_number=p.broker_license_number AND v.verified_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses a WHERE a.user_id=p.id AND a.license_number=p.broker_license_number)) AND NOT EXISTS(SELECT 1 FROM public.broker_gender_classifications c WHERE c.user_id=p.id AND c.classified_name IS NOT DISTINCT FROM coalesce(p.full_name,'')) ORDER BY p.id LIMIT 25 FOR UPDATE OF p SKIP LOCKED LOOP
   guessed:=public.guess_gender_from_name(r.full_name);
   IF guessed IS NOT NULL THEN UPDATE public.profiles SET gender=guessed WHERE id=r.id AND gender IS NULL; saved:=saved+1; ELSE skipped:=skipped+1; END IF;
   INSERT INTO public.broker_gender_classifications(user_id,classified_name,result) VALUES(r.id,coalesce(r.full_name,''),coalesce(guessed,'skipped')) ON CONFLICT(user_id) DO UPDATE SET classified_name=excluded.classified_name,result=excluded.result,checked_at=now();
   done:=done+1;
  END LOOP;
 END IF;
 SELECT count(*) INTO remaining FROM public.profiles p WHERE p.gender IS NULL AND (p.locked_broker_name IS NOT NULL OR EXISTS(SELECT 1 FROM public.broker_license_verifications v WHERE v.user_id=p.id AND v.license_number=p.broker_license_number AND v.verified_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses a WHERE a.user_id=p.id AND a.license_number=p.broker_license_number)) AND NOT EXISTS(SELECT 1 FROM public.broker_gender_classifications c WHERE c.user_id=p.id AND c.classified_name IS NOT DISTINCT FROM coalesce(p.full_name,''));
 RETURN jsonb_build_object('processed',done,'saved',saved,'skipped',skipped,'remaining',remaining);
END $$;
REVOKE ALL ON FUNCTION public.admin_classify_verified_broker_genders(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_classify_verified_broker_genders(boolean) TO authenticated,service_role;