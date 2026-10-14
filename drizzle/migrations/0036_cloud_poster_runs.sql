CREATE TABLE public.cloud_poster_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid,
  ran_at timestamptz NOT NULL DEFAULT now(),
  processed int NOT NULL DEFAULT 0,
  dispatched int NOT NULL DEFAULT 0,
  deferred int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  note text
);
GRANT ALL ON public.cloud_poster_runs TO service_role;
ALTER TABLE public.cloud_poster_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX cloud_poster_runs_ws_idx ON public.cloud_poster_runs (workspace_owner_id, ran_at DESC);
CREATE INDEX cloud_poster_runs_at_idx ON public.cloud_poster_runs (ran_at DESC);