
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.homely_broker_credentials (
  user_id uuid PRIMARY KEY,
  homely_username text,
  homely_password_encrypted bytea,
  webhook_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  connection_status text NOT NULL DEFAULT 'not_configured',
  last_verified_at timestamptz,
  last_error text,
  disabled_by uuid,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homely_creds_status_chk CHECK (connection_status IN
    ('not_configured','ok','failed','disabled_by_admin','manually_verified'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homely_creds_token
  ON public.homely_broker_credentials(webhook_token);

ALTER TABLE public.homely_broker_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own homely creds" ON public.homely_broker_credentials;
CREATE POLICY "Owner reads own homely creds"
  ON public.homely_broker_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

DROP POLICY IF EXISTS "Owner upserts own homely creds" ON public.homely_broker_credentials;
CREATE POLICY "Owner upserts own homely creds"
  ON public.homely_broker_credentials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owner may update non-status fields; admins may update anything (incl. disable)
DROP POLICY IF EXISTS "Owner updates own homely creds" ON public.homely_broker_credentials;
CREATE POLICY "Owner updates own homely creds"
  ON public.homely_broker_credentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

CREATE TRIGGER trg_homely_creds_updated_at
BEFORE UPDATE ON public.homely_broker_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Inbound events from Homely ──
CREATE TABLE IF NOT EXISTS public.homely_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processing_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_homely_inbound_user ON public.homely_inbound_events(user_id, created_at DESC);
ALTER TABLE public.homely_inbound_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own homely inbound" ON public.homely_inbound_events;
CREATE POLICY "Owner reads own homely inbound"
  ON public.homely_inbound_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

-- ── Crypto helpers (use Vault-stored HOMELY_CRED_KEY, fallback to current_setting) ──
CREATE OR REPLACE FUNCTION public.set_homely_password(_user_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _key text;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> _user_id AND NOT public.is_admin_or_above(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to set this password';
  END IF;

  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'HOMELY_CRED_KEY' LIMIT 1;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'HOMELY_CRED_KEY not configured';
  END IF;

  INSERT INTO public.homely_broker_credentials (user_id, homely_password_encrypted)
  VALUES (_user_id, extensions.pgp_sym_encrypt(_password, _key))
  ON CONFLICT (user_id)
  DO UPDATE SET
    homely_password_encrypted = extensions.pgp_sym_encrypt(_password, _key),
    last_error = NULL,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_homely_password(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _key text;
  _enc bytea;
BEGIN
  -- Only the owner edge function (service role bypasses RLS) or super_admin should call this.
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized to read this password';
  END IF;

  SELECT homely_password_encrypted INTO _enc
  FROM public.homely_broker_credentials WHERE user_id = _user_id;
  IF _enc IS NULL THEN RETURN NULL; END IF;

  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'HOMELY_CRED_KEY' LIMIT 1;
  IF _key IS NULL THEN RAISE EXCEPTION 'HOMELY_CRED_KEY not configured'; END IF;

  RETURN extensions.pgp_sym_decrypt(_enc, _key);
END;
$$;

REVOKE ALL ON FUNCTION public.get_homely_password(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_homely_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_homely_password(uuid, text) TO authenticated;

-- ── Admin oversight RPC ──
CREATE OR REPLACE FUNCTION public.get_homely_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT jsonb_build_object(
    'brokers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', p.id,
        'email', p.email,
        'full_name', p.full_name,
        'connection_status', COALESCE(c.connection_status, 'not_configured'),
        'homely_username', c.homely_username,
        'last_verified_at', c.last_verified_at,
        'last_error', c.last_error,
        'webhook_token', c.webhook_token,
        'has_client_code', (k.homely_client_code IS NOT NULL AND length(trim(k.homely_client_code)) > 0),
        'auto_push', COALESCE(k.homely_auto_push, false),
        'pushes_last_24h', COALESCE(s.total_24h, 0),
        'push_failures_24h', COALESCE(s.fail_24h, 0),
        'last_push_at', s.last_push_at
      ) ORDER BY p.email)
      FROM public.profiles p
      LEFT JOIN public.homely_broker_credentials c ON c.user_id = p.id
      LEFT JOIN public.user_api_keys k ON k.user_id = p.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int total_24h,
          COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours' AND status='failed')::int fail_24h,
          MAX(created_at) last_push_at
        FROM public.homely_push_log
        WHERE user_id = p.id
      ) s ON true
      WHERE c.user_id IS NOT NULL
         OR k.homely_client_code IS NOT NULL
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'configured', (SELECT COUNT(*) FROM public.homely_broker_credentials WHERE connection_status IN ('ok','manually_verified'))::int,
      'failing',    (SELECT COUNT(*) FROM public.homely_broker_credentials WHERE connection_status = 'failed')::int,
      'disabled',   (SELECT COUNT(*) FROM public.homely_broker_credentials WHERE connection_status = 'disabled_by_admin')::int,
      'pushes_today', (SELECT COUNT(*) FROM public.homely_push_log WHERE created_at::date = current_date)::int,
      'failures_today', (SELECT COUNT(*) FROM public.homely_push_log WHERE created_at::date = current_date AND status='failed')::int
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_homely_admin_overview() TO authenticated;

-- ── Admin disable/enable RPC ──
CREATE OR REPLACE FUNCTION public.set_homely_broker_disabled(_user_id uuid, _disabled boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  INSERT INTO public.homely_broker_credentials (user_id, connection_status, disabled_by, disabled_reason)
  VALUES (_user_id,
          CASE WHEN _disabled THEN 'disabled_by_admin' ELSE 'not_configured' END,
          CASE WHEN _disabled THEN auth.uid() ELSE NULL END,
          CASE WHEN _disabled THEN _reason ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE
    SET connection_status = CASE WHEN _disabled THEN 'disabled_by_admin' ELSE 'not_configured' END,
        disabled_by = CASE WHEN _disabled THEN auth.uid() ELSE NULL END,
        disabled_reason = CASE WHEN _disabled THEN _reason ELSE NULL END,
        updated_at = now();

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_table, target_id, details)
  VALUES (auth.uid(), auth.email(),
          CASE WHEN _disabled THEN 'homely.disabled' ELSE 'homely.reenabled' END,
          'homely_broker_credentials', _user_id::text,
          jsonb_build_object('reason', _reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_homely_broker_disabled(uuid, boolean, text) TO authenticated;

-- ── Update existing auto-push trigger to honor disabled_by_admin ──
CREATE OR REPLACE FUNCTION public.trg_homely_push_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _url text;
  _service_key text;
  _owner uuid;
  _has_key boolean;
  _disabled boolean;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  _owner := COALESCE(NEW.assigned_to, auth.uid());
  IF _owner IS NULL THEN RETURN NEW; END IF;

  SELECT (homely_client_code IS NOT NULL AND length(trim(homely_client_code)) > 0 AND homely_auto_push)
    INTO _has_key
  FROM public.user_api_keys WHERE user_id = _owner;
  IF NOT COALESCE(_has_key, false) THEN RETURN NEW; END IF;

  SELECT (connection_status = 'disabled_by_admin') INTO _disabled
  FROM public.homely_broker_credentials WHERE user_id = _owner;
  IF COALESCE(_disabled, false) THEN RETURN NEW; END IF;

  BEGIN _url := current_setting('app.supabase_url', true); EXCEPTION WHEN others THEN _url := NULL; END;
  BEGIN _service_key := current_setting('app.service_role_key', true); EXCEPTION WHEN others THEN _service_key := NULL; END;
  IF _url IS NULL OR _service_key IS NULL THEN
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;
  IF _url IS NULL OR _service_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := _url || '/functions/v1/homely-push-lead',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || _service_key,
      'apikey', _service_key
    ),
    body := jsonb_build_object('lead_id', NEW.id, 'owner_id', _owner)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
