ALTER TABLE public.developer_projects
  ADD COLUMN IF NOT EXISTS source_status text,
  ADD COLUMN IF NOT EXISTS timeline jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.developer_projects.source_status IS 'Exact project status text read from the source page; separate from internal marketing status.';
COMMENT ON COLUMN public.developer_projects.timeline IS 'Source project milestones with display labels, dates and state; no inferred milestones.';