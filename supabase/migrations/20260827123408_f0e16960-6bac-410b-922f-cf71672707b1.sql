ALTER TABLE public.messenger_page_bindings
  DROP CONSTRAINT IF EXISTS messenger_page_bindings_page_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS messenger_page_bindings_owner_page_key
  ON public.messenger_page_bindings (owner_id, page_id);