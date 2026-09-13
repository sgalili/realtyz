CREATE OR REPLACE FUNCTION public.route_landing_lead_to_rita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rita uuid := 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';
  _name text;
  _phone text;
  _email text;
  _notes text;
  _digits text;
BEGIN
  IF TG_TABLE_NAME = 'demo_requests' THEN
    _name := trim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
    _phone := NEW.phone;
    _email := NULL;
    _notes := coalesce(NEW.notes,'') || ' | תיאום דמו: ' || coalesce(NEW.preferred_at::text,'');
  ELSE
    _name := NEW.full_name;
    _phone := NEW.phone_number;
    _email := NEW.email;
    _notes := NEW.message;
  END IF;

  _digits := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  IF _digits = '' THEN RETURN NEW; END IF;
  IF left(_digits,1) = '0' THEN _digits := '972' || substr(_digits,2); END IF;

  IF EXISTS (SELECT 1 FROM public.leads WHERE assigned_to = _rita AND phone_number = _digits) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.leads (full_name, phone_number, email, notes, assigned_to, lead_stage, deal_type, interest_tag, preferences)
  VALUES (
    nullif(_name,''), _digits, _email, nullif(trim(_notes),''), _rita, 'new', 'sale',
    CASE WHEN TG_TABLE_NAME = 'demo_requests' THEN 'דמו מהאתר' ELSE 'פנייה מהאתר' END,
    jsonb_build_object('lead_kind','broker','origin', TG_TABLE_NAME, 'source','landing')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demo_requests_to_rita ON public.demo_requests;
CREATE TRIGGER trg_demo_requests_to_rita
AFTER INSERT ON public.demo_requests
FOR EACH ROW EXECUTE FUNCTION public.route_landing_lead_to_rita();

DROP TRIGGER IF EXISTS trg_contact_submissions_to_rita ON public.contact_submissions;
CREATE TRIGGER trg_contact_submissions_to_rita
AFTER INSERT ON public.contact_submissions
FOR EACH ROW EXECUTE FUNCTION public.route_landing_lead_to_rita();