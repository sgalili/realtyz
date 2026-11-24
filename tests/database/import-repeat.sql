DO $$
#variable_conflict use_variable
DECLARE id uuid; successor uuid; c jsonb; n integer; before_count integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
 PERFORM set_config('request.jwt.claim.role','authenticated',false);
 INSERT INTO broker_import_jobs(created_by,workspace_owner_id,target_brokers,min_listings,max_listings,checkpoint)
 VALUES(auth.uid(),auth.uid(),10,3,10,'{"execution":"external","source":"agencies","phase":"scanning","workerFrontier":["next-directory"],"workerEntities":[{"url":"saved","kind":"broker"},{"url":"next","kind":"broker"}],"workerProcessed":["saved"],"brokerResults":[{"broker_id":"00000000-0000-0000-0000-000000000010","listing_urls":["https://www.yad2.co.il/realestate/item/abcd"]}],"savedListingIds":["draft"]}') RETURNING broker_import_jobs.id INTO id;
 UPDATE broker_import_jobs SET brokers_done=8,listings_done=37,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes' WHERE broker_import_jobs.id=id;
 SELECT checkpoint INTO c FROM broker_import_jobs WHERE broker_import_jobs.id=id;
 PERFORM set_import_repeat(id,true);
 IF NOT EXISTS(SELECT 1 FROM broker_import_jobs WHERE broker_import_jobs.id=id AND repeat_enabled AND checkpoint=c AND brokers_done=8 AND listings_done=37 AND lease_token IS NOT NULL) THEN RAISE EXCEPTION 'ON reset active progress'; END IF;
 -- A worker report cannot overwrite the independent ON flag.
 UPDATE broker_import_jobs SET checkpoint=checkpoint||'{"workerHeartbeatAt":"new"}' WHERE broker_import_jobs.id=id;
 UPDATE broker_import_jobs SET status='completed',stage='completed',checkpoint=checkpoint||'{"workerHeartbeatAt":"final"}',lease_token=NULL,lease_until=NULL WHERE broker_import_jobs.id=id;
 SELECT broker_import_jobs.id INTO successor FROM broker_import_jobs WHERE repeat_parent_id=id;
 IF successor IS NULL THEN RAISE EXCEPTION 'missing automatic next batch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM broker_import_jobs WHERE broker_import_jobs.id=successor AND target_brokers=10 AND min_listings=3 AND max_listings=10 AND repeat_enabled AND brokers_done=0 AND listings_done=0 AND checkpoint->'workerEntities'='[{"url":"next","kind":"broker"}]'::jsonb AND checkpoint->'workerFrontier'='["next-directory"]'::jsonb AND checkpoint->'brokerResults' IS NULL) THEN RAISE EXCEPTION 'next batch configuration or cursor mismatch'; END IF;
 UPDATE broker_import_jobs SET checkpoint=checkpoint||'{"workerHeartbeatAt":"duplicate"}' WHERE broker_import_jobs.id=id;
 SELECT count(*) INTO n FROM broker_import_jobs WHERE repeat_parent_id=id;
 IF n<>1 THEN RAISE EXCEPTION 'duplicate continuation'; END IF;
 -- A stale UI on the previous batch switches OFF the actual active successor.
 PERFORM set_import_repeat(id,false);
 IF EXISTS(SELECT 1 FROM broker_import_jobs WHERE broker_import_jobs.id=successor AND repeat_enabled) THEN RAISE EXCEPTION 'OFF did not follow active successor'; END IF;
 UPDATE broker_import_jobs SET status='completed',stage='completed',checkpoint=checkpoint||'{"workerHeartbeatAt":"last"}' WHERE broker_import_jobs.id=successor;
 IF EXISTS(SELECT 1 FROM broker_import_jobs WHERE repeat_parent_id=successor) THEN RAISE EXCEPTION 'OFF continued'; END IF;
 -- Attaching ON during a developer project read never copies that working project to its successor.
 INSERT INTO broker_import_jobs(created_by,workspace_owner_id,target_brokers,min_listings,max_listings,checkpoint,repeat_enabled) VALUES(auth.uid(),auth.uid(),5,1,10,'{"execution":"external","source":"urls","requestType":"developers","autoDevelopers":true,"maxProjects":7,"expectedProjects":7,"workerDeveloper":{"pendingUrls":["old-project"]},"workerEntities":[{"url":"next-developer","kind":"developer"}],"workerProcessed":[]}',true) RETURNING broker_import_jobs.id INTO successor;
 UPDATE broker_import_jobs SET status='completed',stage='completed',checkpoint=checkpoint||'{"workerHeartbeatAt":"done"}' WHERE broker_import_jobs.id=successor;
 IF NOT EXISTS(SELECT 1 FROM broker_import_jobs WHERE repeat_parent_id=successor AND target_brokers=5 AND checkpoint->>'maxProjects'='7' AND checkpoint->'workerDeveloper' IS NULL AND checkpoint->'workerEntities'='[{"url":"next-developer","kind":"developer"}]'::jsonb) THEN RAISE EXCEPTION 'developer repeat copied active work or lost settings'; END IF;
 -- A failed final batch never starts an automatic paid successor.
 INSERT INTO broker_import_jobs(created_by,workspace_owner_id,target_brokers,min_listings,max_listings,checkpoint,repeat_enabled) VALUES(auth.uid(),auth.uid(),10,3,10,'{"execution":"external","source":"agencies"}',true) RETURNING broker_import_jobs.id INTO successor;
 UPDATE broker_import_jobs SET status='failed',stage='scanning',checkpoint=checkpoint||'{"lastError":"Bright Data insufficient credits"}' WHERE broker_import_jobs.id=successor;
 IF EXISTS(SELECT 1 FROM broker_import_jobs WHERE repeat_parent_id=successor) THEN RAISE EXCEPTION 'failed batch repeated'; END IF;
 -- Real saved source count, never configured maximum or another workspace.
 INSERT INTO listings(workspace_owner_id,source_url) VALUES('00000000-0000-0000-0000-000000000010','https://www.yad2.co.il/realestate/item/abcd'),('00000000-0000-0000-0000-000000000011','https://www.yad2.co.il/realestate/item/abcd');
 SELECT saved_count INTO n FROM get_import_broker_property_counts(id);
 IF n<>1 THEN RAISE EXCEPTION 'count leaked across workspaces or used the maximum'; END IF;
 -- Unauthorized users cannot flip recurrence or inspect saved counts.
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
 BEGIN PERFORM set_import_repeat(id,true); RAISE EXCEPTION 'unprivileged repeat allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM get_import_broker_property_counts(id); RAISE EXCEPTION 'unprivileged count allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.role','service_role',false);
 IF NOT claim_import_balance_alert('00000000-0000-0000-0000-000000000001',id) THEN RAISE EXCEPTION 'first alert not claimed'; END IF;
 IF claim_import_balance_alert('00000000-0000-0000-0000-000000000001',successor) THEN RAISE EXCEPTION 'alert spam not deduplicated across jobs'; END IF;
 UPDATE import_balance_alerts SET last_attempt_at=now()-interval '6 hours 1 second';
 IF NOT claim_import_balance_alert('00000000-0000-0000-0000-000000000001',successor) THEN RAISE EXCEPTION 'alert cooldown did not expire'; END IF;
END $$;