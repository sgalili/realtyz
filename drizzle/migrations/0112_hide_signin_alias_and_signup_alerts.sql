CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, last_sign_in_at, plan_status, trial_start_date, trial_end_date, wallet_balance_agorot)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email ~* '(@(whatsapp\.)?realtyz\.local|\.invalid)$' THEN NULL ELSE NEW.email END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.last_sign_in_at, 'trial', now(), now() + interval '30 days', 5000
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.balance_adjustments (user_id, amount, reason) VALUES (NEW.id, 50, 'Welcome credit') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.blank_internal_email_alias()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email ~* '(@(whatsapp\.)?realtyz\.local|\.invalid)$' THEN NEW.email := NULL; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_blank_internal_email_alias ON public.profiles;
CREATE TRIGGER trg_blank_internal_email_alias BEFORE INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.blank_internal_email_alias();

CREATE TABLE IF NOT EXISTS public.signup_admin_alerts (
  user_id uuid PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  error text
);
GRANT ALL ON public.signup_admin_alerts TO service_role;
ALTER TABLE public.signup_admin_alerts ENABLE ROW LEVEL SECURITY;