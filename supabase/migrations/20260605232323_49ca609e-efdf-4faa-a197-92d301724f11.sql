CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, last_sign_in_at,
    plan_status, trial_start_date, trial_end_date, wallet_balance_agorot
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.last_sign_in_at,
    'trial',
    now(),
    now() + interval '30 days',
    5000
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.balance_adjustments (user_id, amount, reason)
  VALUES (NEW.id, 50, 'Welcome credit')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;