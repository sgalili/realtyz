-- Normalize campaign_logs.media_urls: drop entries that are not absolute URLs
-- (serialized JSON objects / Facebook permalink pages) which rendered as broken images.
WITH cleaned AS (
  SELECT c.id,
         COALESCE(
           jsonb_agg(v ORDER BY ord) FILTER (
             WHERE v LIKE 'http%'
               AND v !~* '^https?://(www\.)?facebook\.com/(photo\.php|permalink\.php|share/|posts/|videos/|watch)'
           ),
           '[]'::jsonb
         ) AS next_media
  FROM public.campaign_logs c
  CROSS JOIN LATERAL jsonb_array_elements_text(c.media_urls) WITH ORDINALITY AS t(v, ord)
  WHERE jsonb_typeof(c.media_urls) = 'array'
  GROUP BY c.id
)
UPDATE public.campaign_logs c
SET media_urls = cleaned.next_media
FROM cleaned
WHERE c.id = cleaned.id
  AND c.media_urls IS DISTINCT FROM cleaned.next_media;