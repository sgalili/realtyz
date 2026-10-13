ALTER TABLE public.fb_user_groups
  ADD COLUMN IF NOT EXISTS pool_status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS waiting_reason text,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;

CREATE INDEX IF NOT EXISTS fb_user_groups_pool_idx ON public.fb_user_groups(workspace_owner_id, pool_status);

CREATE OR REPLACE FUNCTION public.fb_user_groups_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fb_user_groups WHERE workspace_owner_id = NEW.workspace_owner_id AND group_id = NEW.group_id) THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM fb_user_groups WHERE workspace_owner_id = NEW.workspace_owner_id) >= 300 THEN
    RAISE EXCEPTION 'group_limit_reached' USING HINT = 'max 300 groups per workspace (100 active)';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fb_rebalance_group_pool(_owner uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE active_count int; promoted int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_access_workspace_owner(_owner) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE fb_user_groups SET pool_status='blocked', waiting_reason=NULL
   WHERE workspace_owner_id=_owner AND is_blocked AND pool_status<>'blocked';
  UPDATE fb_user_groups SET pool_status='waiting', waiting_reason=NULL, cooldown_until=NULL
   WHERE workspace_owner_id=_owner AND NOT is_blocked AND pool_status='blocked';
  UPDATE fb_user_groups SET pool_status='waiting', waiting_reason='not_joined'
   WHERE workspace_owner_id=_owner AND NOT is_blocked AND pool_status='active' AND join_status<>'joined';
  UPDATE fb_user_groups SET cooldown_until=NULL, waiting_reason=NULL
   WHERE workspace_owner_id=_owner AND cooldown_until IS NOT NULL AND cooldown_until<=now();
  UPDATE fb_user_groups g SET pool_status='waiting', waiting_reason='pool_full'
   FROM (SELECT id FROM fb_user_groups WHERE workspace_owner_id=_owner AND pool_status='active'
         ORDER BY member_count DESC NULLS LAST, created_at OFFSET 100) x WHERE g.id=x.id;
  SELECT count(*) INTO active_count FROM fb_user_groups WHERE workspace_owner_id=_owner AND pool_status='active';
  IF active_count < 100 THEN
    WITH c AS (
      SELECT id FROM fb_user_groups
       WHERE workspace_owner_id=_owner AND pool_status='waiting' AND NOT is_blocked
         AND join_status='joined' AND is_selected AND (cooldown_until IS NULL OR cooldown_until<=now())
       ORDER BY member_count DESC NULLS LAST, created_at LIMIT 100-active_count)
    UPDATE fb_user_groups g SET pool_status='active', waiting_reason=NULL, cooldown_until=NULL
      FROM c WHERE g.id=c.id;
    GET DIAGNOSTICS promoted = ROW_COUNT;
  END IF;
  RETURN promoted;
END $$;
GRANT EXECUTE ON FUNCTION public.fb_rebalance_group_pool(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fb_rebalance_all_group_pools()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o uuid;
BEGIN
  FOR o IN SELECT DISTINCT workspace_owner_id FROM fb_user_groups
           WHERE workspace_owner_id IS NOT NULL AND (cooldown_until IS NOT NULL AND cooldown_until<=now()) LOOP
    PERFORM public.fb_rebalance_group_pool(o);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.fb_rebalance_all_group_pools() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fb_group_pool_after_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE gid text;
BEGIN
  IF NEW.activity_type<>'fb_group_post' THEN RETURN NEW; END IF;
  gid := public.fb_group_key(NEW.target_ref);
  IF gid='' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status='completed' THEN
    UPDATE fb_user_groups SET pool_status='waiting', waiting_reason='property_lock_24h',
           cooldown_until=greatest(coalesce(cooldown_until, now()), now()+interval '24 hours')
     WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=gid AND NOT is_blocked;
  ELSIF NEW.status NOT IN ('failed','cancelled') THEN
    RETURN NEW;
  END IF;
  PERFORM public.fb_rebalance_group_pool(NEW.workspace_owner_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fb_group_pool_after_post ON public.campaign_activity_queue;
CREATE TRIGGER trg_fb_group_pool_after_post AFTER INSERT OR UPDATE OF status ON public.campaign_activity_queue
FOR EACH ROW EXECUTE FUNCTION public.fb_group_pool_after_post();

DO $$ DECLARE o uuid; BEGIN
  FOR o IN SELECT DISTINCT workspace_owner_id FROM public.fb_user_groups WHERE workspace_owner_id IS NOT NULL LOOP
    PERFORM public.fb_rebalance_group_pool(o);
  END LOOP;
END $$;

SELECT cron.unschedule('fb-group-pool-rebalance') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='fb-group-pool-rebalance');
SELECT cron.schedule('fb-group-pool-rebalance', '0 * * * *', $$SELECT public.fb_rebalance_all_group_pools();$$);