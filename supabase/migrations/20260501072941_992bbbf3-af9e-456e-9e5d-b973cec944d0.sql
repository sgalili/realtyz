-- HARD PURGE of legacy political/survey terminology from schema
-- 1. Drop political-survey artifact table
DROP TABLE IF EXISTS public.survey_insights CASCADE;

-- 2. Drop political columns from listings (real-estate now)
ALTER TABLE public.listings DROP COLUMN IF EXISTS candidate_name;
ALTER TABLE public.listings DROP COLUMN IF EXISTS headline;
ALTER TABLE public.listings DROP COLUMN IF EXISTS thesis;
ALTER TABLE public.listings DROP COLUMN IF EXISTS pillars;
ALTER TABLE public.listings DROP COLUMN IF EXISTS mandate_goal;
ALTER TABLE public.listings DROP COLUMN IF EXISTS supporter_count;
ALTER TABLE public.listings DROP COLUMN IF EXISTS election_type;

-- 3. Drop political columns from onboarding_state
ALTER TABLE public.onboarding_state DROP COLUMN IF EXISTS candidate_or_party;
ALTER TABLE public.onboarding_state DROP COLUMN IF EXISTS election_type;
ALTER TABLE public.onboarding_state DROP COLUMN IF EXISTS mandate_target;
ALTER TABLE public.onboarding_state DROP COLUMN IF EXISTS months_to_election;

-- 4. Rename voter_id -> lead_id wherever it still exists
ALTER TABLE public.campaign_logs RENAME COLUMN voter_id TO lead_id;
ALTER TABLE public.trial_autopilot_messages RENAME COLUMN voter_id TO lead_id;
ALTER TABLE public.trial_inbound_replies RENAME COLUMN voter_id TO lead_id;
ALTER TABLE public.approval_queue RENAME COLUMN target_voter_id TO target_lead_id;

-- 5. Drop political column from admin_leads (election_type field is for political races)
ALTER TABLE public.admin_leads DROP COLUMN IF EXISTS election_type;