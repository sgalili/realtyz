create or replace function public.admin_rotate_project_photos(_project_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_projects integer := 0; v_apartments integer := 0;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin')
    or exists (select 1 from public.demo_view_accounts d where d.user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _project_id is null then raise exception 'project_id is required' using errcode = '22023'; end if;

  select count(*) into v_apartments from public.developer_projects p
  cross join lateral jsonb_array_elements(p.apartments) u(value)
  where p.id = _project_id and jsonb_typeof(p.apartments) = 'array'
    and jsonb_typeof(u.value -> 'images') = 'array' and jsonb_array_length(u.value -> 'images') > 2;

  update public.developer_projects p set
    images = case when jsonb_typeof(p.images) = 'array' and jsonb_array_length(p.images) > 2
      then (p.images - 0 - 0) || jsonb_build_array(p.images -> 0, p.images -> 1) else p.images end,
    image_url = case when jsonb_typeof(p.images) = 'array' and jsonb_array_length(p.images) > 2
      then p.images ->> 2 else p.image_url end,
    apartments = case when v_apartments > 0 then (
      select jsonb_agg(case when jsonb_typeof(u.value -> 'images') = 'array' and jsonb_array_length(u.value -> 'images') > 2
        then jsonb_set(u.value, '{images}', ((u.value -> 'images') - 0 - 0) || jsonb_build_array(u.value -> 'images' -> 0, u.value -> 'images' -> 1), false)
        else u.value end order by u.ordinality)
      from jsonb_array_elements(p.apartments) with ordinality u(value, ordinality)) else p.apartments end,
    updated_at = now()
  where p.id = _project_id
    and ((jsonb_typeof(p.images) = 'array' and jsonb_array_length(p.images) > 2) or v_apartments > 0);
  get diagnostics v_projects = row_count;
  if v_projects > 0 and not exists (select 1 from public.developer_projects where id = _project_id and jsonb_typeof(images) = 'array' and jsonb_array_length(images) > 2 and false) then null; end if;

  return jsonb_build_object('listings', 0, 'projects', v_projects, 'apartments', v_apartments, 'total', v_projects + v_apartments);
end; $$;
revoke all on function public.admin_rotate_project_photos(uuid) from public, anon;
grant execute on function public.admin_rotate_project_photos(uuid) to authenticated;