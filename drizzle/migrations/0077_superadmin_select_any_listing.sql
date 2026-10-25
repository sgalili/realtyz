create policy "superadmin_select_any_listing"
on public.listings
for select
to authenticated
using (has_role(auth.uid(), 'super_admin'::app_role));