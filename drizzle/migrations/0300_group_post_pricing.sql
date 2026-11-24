INSERT INTO public.action_pricing (action_key, label_he, unit_he, price_agorot, sort_order)
VALUES ('group_post', 'יצירה ופרסום פוסט בקבוצה', 'פוסט', 25, 8)
ON CONFLICT (action_key) DO NOTHING;