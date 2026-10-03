DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proname = ANY(ARRAY['add_credit','admin_link_referral','admin_unlink_referral','affiliate_can_access_lead','affiliate_tier3_eligible','can_access_campaign_log_owner','can_close_deal','can_manage_data','crm_import_merge','dispatch_automation_run','dispatch_smart_notification','email_queue_dispatch','enqueue_calendar_autosync','ensure_affiliate_onboarding_access','ensure_credit_wallet','ensure_profile_row','ensure_rita_crm_contact','get_affiliate_marketplace_v2','get_affiliate_marketplace_v3','get_match_stats','get_my_referral_code','get_workspace_member_ids','in_current_workspace','is_affiliate','is_on_trial_plan','is_trial_active','match_knowledge_chunks','matcher_periodic_sweep','merge_lead_into','merge_lead_pair','queue_autopilot_messages','release_fb_group_post_slot','review_affiliate_license','trigger_match_for_lead','trigger_wa_avatar_fetch_for_lead','upsert_lead_by_social'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;