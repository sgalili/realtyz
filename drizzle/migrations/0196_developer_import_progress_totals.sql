ALTER TABLE public.broker_import_jobs
  ADD COLUMN developers_done integer NOT NULL DEFAULT 0,
  ADD COLUMN projects_done integer NOT NULL DEFAULT 0,
  ADD COLUMN units_done integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.broker_import_jobs.developers_done IS 'Number of developer links fully processed by the import queue.';
COMMENT ON COLUMN public.broker_import_jobs.projects_done IS 'Number of private developer projects saved by the import queue.';
COMMENT ON COLUMN public.broker_import_jobs.units_done IS 'Number of detailed apartment/unit records saved inside imported developer projects.';