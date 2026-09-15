ALTER TABLE public.property_tours
  ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_property_tours_reminder_due
  ON public.property_tours (scheduled_at)
  WHERE reminder_sent = false;

CREATE TABLE IF NOT EXISTS public.scheduler_locks (
  job_name text PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  paused boolean NOT NULL DEFAULT false,
  last_error text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.scheduler_locks TO service_role;
ALTER TABLE public.scheduler_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduler_locks service only"
  ON public.scheduler_locks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.acquire_scheduler_lock(_job text, _lease_seconds integer DEFAULT 240, _worker text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ok boolean := false;
BEGIN
  INSERT INTO public.scheduler_locks (job_name, locked_until, locked_by, last_run_at)
  VALUES (_job, now() + make_interval(secs => _lease_seconds), _worker, now())
  ON CONFLICT (job_name) DO UPDATE
    SET locked_until = now() + make_interval(secs => _lease_seconds),
        locked_by = _worker,
        last_run_at = now(),
        updated_at = now()
    WHERE public.scheduler_locks.locked_until < now()
      AND public.scheduler_locks.paused = false
  RETURNING true INTO _ok;

  RETURN coalesce(_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_scheduler_lock(text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_scheduler_lock(text, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_scheduler_lock(_job text, _error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.scheduler_locks
     SET locked_until = now(), last_error = _error, updated_at = now()
   WHERE job_name = _job;
$$;

REVOKE ALL ON FUNCTION public.release_scheduler_lock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_scheduler_lock(text, text) TO service_role;