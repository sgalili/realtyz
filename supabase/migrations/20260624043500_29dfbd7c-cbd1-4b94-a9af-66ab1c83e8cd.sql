
-- =============================================
-- Step 1: Safe deduplication of leads by phone_number
-- =============================================
DO $$
DECLARE
  grp record;
  master_id uuid;
  dup_ids uuid[];
BEGIN
  FOR grp IN
    SELECT btrim(phone_number) AS phone, array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM public.leads
    WHERE phone_number IS NOT NULL AND btrim(phone_number) <> ''
    GROUP BY btrim(phone_number)
    HAVING COUNT(*) > 1
  LOOP
    master_id := grp.ids[1];
    dup_ids := grp.ids[2:array_length(grp.ids,1)];

    -- Repoint child references (only update tables that actually have lead_id columns; guard with EXISTS)
    PERFORM 1;
    -- messages
    BEGIN UPDATE public.messages           SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.chat_history       SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.call_records       SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.meetings           SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.booking_tokens     SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.escalation_alerts  SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.deal_room_matches  SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.deal_room_comments SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.autopilot_queue    SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.approval_queue     SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.campaign_logs      SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.broker_referrals   SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.trial_autopilot_messages SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.notifications      SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN UPDATE public.client_portal_links SET lead_id = master_id WHERE lead_id = ANY(dup_ids); EXCEPTION WHEN undefined_column THEN NULL; END;
    -- interaction_activity_log uses thread_key text
    BEGIN
      UPDATE public.interaction_activity_log
      SET thread_key = master_id::text
      WHERE thread_key = ANY(ARRAY(SELECT unnest(dup_ids)::text));
    EXCEPTION WHEN undefined_column THEN NULL; END;

    -- Finally delete duplicate lead rows
    DELETE FROM public.leads WHERE id = ANY(dup_ids);

    RAISE NOTICE 'Deduped phone=% master=% removed=%', grp.phone, master_id, array_length(dup_ids,1);
  END LOOP;
END$$;

-- =============================================
-- Step 2: Enforce uniqueness on phone_number
-- (case-insensitive trim; allow NULL/empty leads)
-- =============================================
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_number_unique_idx
  ON public.leads (btrim(phone_number))
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';
