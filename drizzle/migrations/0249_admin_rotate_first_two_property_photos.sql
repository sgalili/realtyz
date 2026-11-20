create or replace function public.admin_rotate_first_two_photos(
  _scope text,
  _workspace_owner_id uuid default null,
  _listing_id uuid default null,
  _project_id uuid default null,
  _unit_id text default null,
  _building_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listings integer := 0;
  v_projects integer := 0;
  v_apartments integer := 0;
  v_updated integer := 0;
begin
  if auth.uid() is null
    or not public.has_role(auth.uid(), 'super_admin')
    or exists (select 1 from public.demo_view_accounts d where d.user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if _scope = 'workspace' then
    if _workspace_owner_id is null then
      raise exception 'workspace_owner_id is required' using errcode = '22023';
    end if;

    with eligible as (
      select id, (media_photos - 0 - 0) || jsonb_build_array(media_photos -> 0, media_photos -> 1) as rotated
      from public.listings
      where workspace_owner_id = _workspace_owner_id
        and jsonb_typeof(media_photos) = 'array'
        and jsonb_array_length(media_photos) > 2
    ), updated as (
      update public.listings l
      set media_photos = e.rotated, image_url = e.rotated ->> 0, updated_at = now()
      from eligible e
      where l.id = e.id
      returning l.id
    )
    select count(*) into v_listings from updated;

    with eligible as (
      select id, (images - 0 - 0) || jsonb_build_array(images -> 0, images -> 1) as rotated
      from public.developer_projects
      where workspace_owner_id = _workspace_owner_id
        and jsonb_typeof(images) = 'array'
        and jsonb_array_length(images) > 2
    ), updated as (
      update public.developer_projects p
      set images = e.rotated, image_url = e.rotated ->> 0, updated_at = now()
      from eligible e
      where p.id = e.id
      returning p.id
    )
    select count(*) into v_projects from updated;

    select count(*) into v_apartments
    from public.developer_projects p
    cross join lateral jsonb_array_elements(p.apartments) as u(value)
    where p.workspace_owner_id = _workspace_owner_id
      and jsonb_typeof(p.apartments) = 'array'
      and jsonb_typeof(u.value -> 'images') = 'array'
      and jsonb_array_length(u.value -> 'images') > 2;

    with eligible as (
      select p.id, (
        select jsonb_agg(
          case
            when jsonb_typeof(u.value -> 'images') = 'array' and jsonb_array_length(u.value -> 'images') > 2
              then jsonb_set(u.value, '{images}', ((u.value -> 'images') - 0 - 0) || jsonb_build_array(u.value -> 'images' -> 0, u.value -> 'images' -> 1), false)
            else u.value
          end
          order by u.ordinality
        )
        from jsonb_array_elements(p.apartments) with ordinality as u(value, ordinality)
      ) as next_apartments
      from public.developer_projects p
      where p.workspace_owner_id = _workspace_owner_id
        and jsonb_typeof(p.apartments) = 'array'
        and exists (
          select 1 from jsonb_array_elements(p.apartments) as u(value)
          where jsonb_typeof(u.value -> 'images') = 'array'
            and jsonb_array_length(u.value -> 'images') > 2
        )
    ), updated as (
      update public.developer_projects p
      set apartments = e.next_apartments, updated_at = now()
      from eligible e
      where p.id = e.id
      returning p.id
    )
    select count(*) into v_updated from updated;

  elsif _scope = 'listing' then
    if _listing_id is null then
      raise exception 'listing_id is required' using errcode = '22023';
    end if;
    with eligible as (
      select id, (media_photos - 0 - 0) || jsonb_build_array(media_photos -> 0, media_photos -> 1) as rotated
      from public.listings
      where id = _listing_id
        and jsonb_typeof(media_photos) = 'array'
        and jsonb_array_length(media_photos) > 2
    ), updated as (
      update public.listings l
      set media_photos = e.rotated, image_url = e.rotated ->> 0, updated_at = now()
      from eligible e
      where l.id = e.id
      returning l.id
    )
    select count(*) into v_listings from updated;

  elsif _scope = 'project_unit' then
    if _project_id is null or _unit_id is null or length(_unit_id) = 0 then
      raise exception 'project_id and unit_id are required' using errcode = '22023';
    end if;

    select count(*) into v_apartments
    from public.developer_projects p
    cross join lateral jsonb_array_elements(p.apartments) as u(value)
    where p.id = _project_id
      and jsonb_typeof(p.apartments) = 'array'
      and coalesce(u.value ->> 'source_unit_id', u.value ->> 'apartmentId', u.value ->> 'unitId', u.value ->> 'id', u.value ->> 'token') = _unit_id
      and coalesce(u.value ->> 'building_id', u.value ->> 'buildingId', u.value ->> 'towerId', '') = coalesce(_building_id, '')
      and jsonb_typeof(u.value -> 'images') = 'array'
      and jsonb_array_length(u.value -> 'images') > 2;

    with eligible as (
      select p.id, (
        select jsonb_agg(
          case
            when coalesce(u.value ->> 'source_unit_id', u.value ->> 'apartmentId', u.value ->> 'unitId', u.value ->> 'id', u.value ->> 'token') = _unit_id
              and coalesce(u.value ->> 'building_id', u.value ->> 'buildingId', u.value ->> 'towerId', '') = coalesce(_building_id, '')
              and jsonb_typeof(u.value -> 'images') = 'array'
              and jsonb_array_length(u.value -> 'images') > 2
              then jsonb_set(u.value, '{images}', ((u.value -> 'images') - 0 - 0) || jsonb_build_array(u.value -> 'images' -> 0, u.value -> 'images' -> 1), false)
            else u.value
          end
          order by u.ordinality
        )
        from jsonb_array_elements(p.apartments) with ordinality as u(value, ordinality)
      ) as next_apartments
      from public.developer_projects p
      where p.id = _project_id and jsonb_typeof(p.apartments) = 'array'
    ), updated as (
      update public.developer_projects p
      set apartments = e.next_apartments, updated_at = now()
      from eligible e
      where p.id = e.id and v_apartments > 0
      returning p.id
    )
    select count(*) into v_updated from updated;
  else
    raise exception 'invalid scope' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'listings', v_listings,
    'projects', v_projects,
    'apartments', v_apartments,
    'total', v_listings + v_projects + v_apartments
  );
end;
$$;

revoke all on function public.admin_rotate_first_two_photos(text, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_rotate_first_two_photos(text, uuid, uuid, uuid, text, text) to authenticated, service_role;