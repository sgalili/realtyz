CREATE TABLE public.oauth_connection_states (
  state text PRIMARY KEY,
  provider text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_origin text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_connection_states TO service_role;
ALTER TABLE public.oauth_connection_states ENABLE ROW LEVEL SECURITY;
CREATE INDEX oauth_connection_states_expiry_idx ON public.oauth_connection_states (expires_at);
CREATE TRIGGER update_oauth_connection_states_updated_at
BEFORE UPDATE ON public.oauth_connection_states
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();