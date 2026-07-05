
CREATE TABLE IF NOT EXISTS public.telegram_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  chat_id text NOT NULL,
  handle text,
  first_name text,
  bound_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_bindings TO authenticated;
GRANT ALL ON public.telegram_bindings TO service_role;
ALTER TABLE public.telegram_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads own tg bindings" ON public.telegram_bindings
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner writes own tg bindings" ON public.telegram_bindings
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.messenger_page_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  page_id text NOT NULL,
  page_name text,
  page_access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_page_bindings TO authenticated;
GRANT ALL ON public.messenger_page_bindings TO service_role;
ALTER TABLE public.messenger_page_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads own page bindings" ON public.messenger_page_bindings
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner writes own page bindings" ON public.messenger_page_bindings
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public._touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_tg_bindings_touch ON public.telegram_bindings;
CREATE TRIGGER trg_tg_bindings_touch BEFORE UPDATE ON public.telegram_bindings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_msgr_bindings_touch ON public.messenger_page_bindings;
CREATE TRIGGER trg_msgr_bindings_touch BEFORE UPDATE ON public.messenger_page_bindings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
