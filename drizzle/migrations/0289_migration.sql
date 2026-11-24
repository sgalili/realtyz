CREATE TABLE public.workspace_lead_screening (
  workspace_owner_id uuid PRIMARY KEY,
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions_phone jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_lead_screening TO authenticated;
GRANT ALL ON public.workspace_lead_screening TO service_role;
ALTER TABLE public.workspace_lead_screening ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read screening" ON public.workspace_lead_screening FOR SELECT TO authenticated
  USING (public.can_access_workspace_owner(workspace_owner_id));

-- Saves the broker's three lead-type screening setups and applies them to every
-- listing in the active workspace. Pricing fields are never touched.
CREATE OR REPLACE FUNCTION public.save_workspace_lead_screening(_form_fields jsonb, _questions jsonb, _questions_phone jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid := public.current_workspace_owner(); v_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_owner IS NULL OR NOT public.can_access_workspace_owner(v_owner) OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_form_fields)<>'array' OR jsonb_typeof(_questions)<>'array' OR jsonb_typeof(_questions_phone)<>'array'
     OR jsonb_array_length(_form_fields)>20 OR jsonb_array_length(_questions)>10 OR jsonb_array_length(_questions_phone)>10 THEN
    RAISE EXCEPTION 'invalid_screening' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.workspace_lead_screening(workspace_owner_id, form_fields, questions, questions_phone, updated_by, updated_at)
  VALUES (v_owner, _form_fields, _questions, _questions_phone, auth.uid(), now())
  ON CONFLICT (workspace_owner_id) DO UPDATE SET form_fields=EXCLUDED.form_fields, questions=EXCLUDED.questions, questions_phone=EXCLUDED.questions_phone, updated_by=EXCLUDED.updated_by, updated_at=now();
  UPDATE public.listings SET contact_options = coalesce(contact_options,'{}'::jsonb) || jsonb_build_object('form_fields',_form_fields,'questions',_questions,'questions_phone',_questions_phone)
  WHERE workspace_owner_id = v_owner;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'listings',v_count);
END $$;
REVOKE ALL ON FUNCTION public.save_workspace_lead_screening(jsonb,jsonb,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_lead_screening(jsonb,jsonb,jsonb) TO authenticated;

-- New listings inherit the workspace's saved screening when they have none of their own.
CREATE OR REPLACE FUNCTION public.apply_workspace_lead_screening_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.workspace_lead_screening;
BEGIN
  SELECT * INTO d FROM public.workspace_lead_screening WHERE workspace_owner_id = NEW.workspace_owner_id;
  IF d.workspace_owner_id IS NULL THEN RETURN NEW; END IF;
  NEW.contact_options := coalesce(NEW.contact_options,'{}'::jsonb);
  IF NOT (NEW.contact_options ? 'form_fields') THEN NEW.contact_options := NEW.contact_options || jsonb_build_object('form_fields', d.form_fields); END IF;
  IF NOT (NEW.contact_options ? 'questions') THEN NEW.contact_options := NEW.contact_options || jsonb_build_object('questions', d.questions); END IF;
  IF NOT (NEW.contact_options ? 'questions_phone') THEN NEW.contact_options := NEW.contact_options || jsonb_build_object('questions_phone', d.questions_phone); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER listings_workspace_screening_default BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.apply_workspace_lead_screening_default();