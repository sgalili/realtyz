CREATE POLICY "Active workspace members view user_api_keys"
ON public.user_api_keys FOR SELECT TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members insert user_api_keys"
ON public.user_api_keys FOR INSERT TO authenticated
WITH CHECK (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members update user_api_keys"
ON public.user_api_keys FOR UPDATE TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id))
WITH CHECK (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members view homely credentials"
ON public.homely_broker_credentials FOR SELECT TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members insert homely credentials"
ON public.homely_broker_credentials FOR INSERT TO authenticated
WITH CHECK (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE POLICY "Active workspace members update homely credentials"
ON public.homely_broker_credentials FOR UPDATE TO authenticated
USING (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id))
WITH CHECK (user_id = public.current_workspace_owner() AND public.ws_current_access(user_id));

CREATE OR REPLACE FUNCTION public.set_homely_password(_user_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _key text;
BEGIN
  IF auth.uid() IS NULL
     OR _user_id <> public.current_workspace_owner()
     OR NOT public.ws_current_access(_user_id) THEN
    RAISE EXCEPTION 'Not authorized to set this password';
  END IF;

  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'HOMELY_CRED_KEY' LIMIT 1;
  IF _key IS NULL THEN RAISE EXCEPTION 'HOMELY_CRED_KEY not configured'; END IF;

  INSERT INTO public.homely_broker_credentials (user_id, homely_password_encrypted)
  VALUES (_user_id, extensions.pgp_sym_encrypt(_password, _key))
  ON CONFLICT (user_id)
  DO UPDATE SET homely_password_encrypted = extensions.pgp_sym_encrypt(_password, _key), last_error = NULL, updated_at = now();
END;
$$;