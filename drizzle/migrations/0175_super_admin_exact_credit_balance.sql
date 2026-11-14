CREATE FUNCTION public.super_admin_credit_balances() RETURNS TABLE(user_id uuid,balance_ils numeric,balance_credits numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'super_admin_only'; END IF;
 RETURN QUERY SELECT p.id,coalesce(w.balance_ils,0),coalesce(w.balance_ils,0)*public.get_credits_per_ils() FROM public.profiles p LEFT JOIN public.credit_wallets w ON w.user_id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.super_admin_credit_balances() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.super_admin_credit_balances() TO authenticated;
CREATE FUNCTION public.super_admin_set_credit_balance(_user_id uuid,_credits numeric,_expected_balance_ils numeric) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet uuid; current_balance numeric; target_balance numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'super_admin_only'; END IF;
 IF _credits IS NULL OR _credits::text IN ('NaN','Infinity','-Infinity') OR _credits<0 OR _credits<>round(_credits,2) THEN RAISE EXCEPTION 'invalid_credit_balance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_user_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
 -- Serialize wallet creation for this account as well as existing-wallet writes.
 PERFORM 1 FROM public.profiles WHERE id=_user_id FOR UPDATE;
 SELECT id,balance_ils INTO wallet,current_balance FROM public.credit_wallets WHERE user_id=_user_id FOR UPDATE;
 IF wallet IS NULL THEN
  IF _expected_balance_ils IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'balance_changed'; END IF;
  wallet:=public.ensure_credit_wallet(_user_id);
  SELECT balance_ils INTO current_balance FROM public.credit_wallets WHERE id=wallet FOR UPDATE;
 ELSE
  IF current_balance IS DISTINCT FROM _expected_balance_ils THEN RAISE EXCEPTION 'balance_changed'; END IF;
 END IF;
 target_balance:=public.credits_to_ils(_credits);
 IF target_balance<>current_balance THEN
  PERFORM public.add_credit(_user_id,target_balance-current_balance,'manual_adjustment',auth.uid(),'Super Admin exact credit balance');
 END IF;
 RETURN (SELECT balance_ils*public.get_credits_per_ils() FROM public.credit_wallets WHERE id=wallet);
END $$;
REVOKE ALL ON FUNCTION public.super_admin_set_credit_balance(uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.super_admin_set_credit_balance(uuid,numeric,numeric) TO authenticated;