-- Tours created inside the app were auto-marked confirmed even though the
-- client never accepted. Reset those to pending; keep client-accepted ones.
update public.property_tours
set status = 'pending'
where status = 'confirmed'
  and coalesce(metadata->>'client_confirmed_at', metadata->>'confirmed_by_client_at', metadata->>'client_accepted_at') is null;