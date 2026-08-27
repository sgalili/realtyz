create or replace function public.listing_photo_pool(_listing_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with l as (
    select id, city, address, media_photos, image_url, source_metadata
    from listings where id = _listing_id
  ),
  own as (
    select case when jsonb_typeof(e)='string' then e#>>'{}' else coalesce(e->>'url', e->>'src') end as u
    from l, jsonb_array_elements(coalesce(l.media_photos,'[]'::jsonb)) e
    union
    select l.image_url from l where l.image_url is not null and l.image_url <> ''
  ),
  street as (
    select nullif(btrim(regexp_replace(coalesce(address,''), '[0-9].*$', '')), '') as s, city from l
  ),
  sibling as (
    -- Fallback: the same street in the same city often exists as a Yad2/Homely
    -- twin row that DOES carry the gallery. Borrow those photos so a post is
    -- never published without pictures.
    select case when jsonb_typeof(e)='string' then e#>>'{}' else coalesce(e->>'url', e->>'src') end as u
    from listings s2, street st, jsonb_array_elements(coalesce(s2.media_photos,'[]'::jsonb)) e
    where st.s is not null
      and s2.id <> _listing_id
      and s2.city = st.city
      and btrim(regexp_replace(coalesce(s2.address,''), '[0-9].*$', '')) = st.s
      and (not exists (select 1 from own o where o.u is not null and o.u <> ''))
  ),
  raw as (
    select u from own where u is not null and u <> ''
    union
    select u from sibling where u is not null and u <> ''
  ),
  blocked as (
    select lower(k) k from l, jsonb_array_elements_text(coalesce(l.source_metadata->'removed_photo_keys','[]'::jsonb)) k
  )
  select coalesce(array_agg(u), '{}')
  from (
    select distinct u from raw
    where lower(regexp_replace(u, '^.*/([^/?]+).*$', '\1')) not in (select k from blocked)
      and lower(regexp_replace(u, '^.*/([^/?]+).*$', '\1')) not in (select regexp_replace(k,'^.*/([^/?]+).*$','\1') from blocked)
  ) d;
$$;

grant execute on function public.listing_photo_pool(uuid) to authenticated, service_role;