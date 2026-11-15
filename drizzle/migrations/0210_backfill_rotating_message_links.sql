UPDATE public.rotating_messages SET action_path = CASE
WHEN role_key='broker_partner' AND sort_order=10 THEN '/profile'
WHEN role_key='broker_partner' AND sort_order IN (20,40,50,70,100) THEN '/my-ads'
WHEN role_key='broker_partner' AND sort_order IN (30,60) THEN '/campaigns'
WHEN role_key='broker_partner' AND sort_order=80 THEN '/invite'
WHEN role_key='broker_partner' AND sort_order=90 THEN '/inbox'
WHEN role_key='developer' AND sort_order IN (20,40,70) THEN '/developer-dashboard'
WHEN role_key='developer' THEN '/my-ads'
WHEN role_key='private' AND sort_order=50 THEN '/my-ads'
WHEN role_key='private' AND sort_order IN (20,60,80,100) THEN '/inbox'
WHEN role_key='private' THEN '/'
END WHERE role_key<>'guest' AND action_path IS NULL;