
ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS homely_client_code text,
  ADD COLUMN IF NOT EXISTS homely_provider text,
  ADD COLUMN IF NOT EXISTS homely_default_agent text,
  ADD COLUMN IF NOT EXISTS homely_auto_push boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.homely_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  http_status int,
  category text,
  request jsonb,
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homely_push_log_lead ON public.homely_push_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_homely_push_log_user ON public.homely_push_log(user_id, created_at DESC);

ALTER TABLE public.homely_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own homely push logs" ON public.homely_push_log;
CREATE POLICY "Users view own homely push logs"
  ON public.homely_push_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

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
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  _owner := COALESCE(NEW.assigned_to, auth.uid());
  IF _owner IS NULL THEN RETURN NEW; END IF;

  SELECT (homely_client_code IS NOT NULL AND length(trim(homely_client_code)) > 0 AND homely_auto_push)
    INTO _has_key
  FROM public.user_api_keys
  WHERE user_id = _owner;
  IF NOT COALESCE(_has_key, false) THEN RETURN NEW; END IF;

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

DROP TRIGGER IF EXISTS homely_push_on_lead_insert ON public.leads;
CREATE TRIGGER homely_push_on_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_homely_push_lead();
