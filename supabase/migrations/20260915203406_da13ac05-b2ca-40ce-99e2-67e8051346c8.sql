-- 1) Udi Vitman is no longer a platform super admin (stays managing broker / owner).
DELETE FROM public.user_roles
WHERE user_id = '8f66ac1a-070a-4485-ac3b-07697d6c4b9e'
  AND role = 'super_admin'::app_role;

-- 2) Stop auto-granting super_admin to Udi's WhatsApp-based login.
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_wa_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Super admin is granted to the platform owner only (see grant_super_admin_to_owner).
  RETURN NEW;
END;
$function$;

-- 3) Udi keeps exactly two workspaces: his own (owner) and Rita's (full broker access).
UPDATE public.workspace_memberships
SET role = 'managing_broker'
WHERE user_id = '8f66ac1a-070a-4485-ac3b-07697d6c4b9e'
  AND workspace_owner_id = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';

DELETE FROM public.workspace_memberships
WHERE user_id = '8f66ac1a-070a-4485-ac3b-07697d6c4b9e'
  AND workspace_owner_id NOT IN (
    '8f66ac1a-070a-4485-ac3b-07697d6c4b9e',
    'dc819834-1aa9-4aca-bb27-ec2c8cebde69'
  );