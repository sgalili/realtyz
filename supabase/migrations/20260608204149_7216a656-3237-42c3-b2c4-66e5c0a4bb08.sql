WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, external_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.engagement_events
  WHERE external_id IS NOT NULL
)
DELETE FROM public.engagement_events e
USING ranked r
WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS engagement_events_user_external_id_uniq
  ON public.engagement_events (user_id, external_id)
  WHERE external_id IS NOT NULL;