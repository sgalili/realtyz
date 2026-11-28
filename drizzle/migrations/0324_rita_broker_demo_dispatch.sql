ALTER TABLE public.broker_outreach_journeys ADD COLUMN IF NOT EXISTS call_provider text;
COMMENT ON COLUMN public.broker_outreach_journeys.call_provider IS 'Active invitation voice provider; new calls use elevenlabs, historical provider IDs are never replayed.';
CREATE OR REPLACE FUNCTION public.arm_rita_broker_demo(_broker uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_outreach_journeys;
BEGIN
 SELECT * INTO j FROM public.broker_outreach_journeys WHERE broker_id=_broker FOR UPDATE;
 IF NOT FOUND OR NOT j.enabled OR j.call_consent_at IS NULL OR j.interested_at IS NULL OR j.opted_out_at IS NOT NULL OR j.cancel_requested_at IS NOT NULL OR j.otp_verified_phone IS NULL OR j.call_due_at IS NULL OR j.call_due_at < clock_timestamp()+interval '5 seconds' OR j.call_status <> 'ready_to_schedule' OR j.call_provider_id IS NOT NULL THEN RETURN false; END IF;
 UPDATE public.broker_outreach_journeys SET call_status='pending',call_provider='elevenlabs',last_error=NULL WHERE broker_id=_broker;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.arm_rita_broker_demo(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arm_rita_broker_demo(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_rita_broker_demo(_broker uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_outreach_journeys;
BEGIN
 SELECT * INTO j FROM public.broker_outreach_journeys WHERE broker_id=_broker FOR UPDATE;
 IF NOT FOUND OR NOT j.enabled OR j.call_consent_at IS NULL OR j.interested_at IS NULL OR j.opted_out_at IS NOT NULL OR j.cancel_requested_at IS NOT NULL OR j.otp_verified_phone IS NULL OR j.call_due_at IS NULL OR j.call_due_at > clock_timestamp() OR j.call_status <> 'pending' OR j.call_provider <> 'elevenlabs' OR j.call_provider_id IS NOT NULL THEN RETURN NULL; END IF;
 IF j.call_due_at < clock_timestamp()-interval '90 seconds' THEN
  UPDATE public.broker_outreach_journeys SET call_status='blocked',last_error='חלון השיחה חלף; נדרש אישור חדש' WHERE broker_id=_broker;
  RETURN NULL;
 END IF;
 UPDATE public.broker_outreach_journeys SET call_status='scheduling' WHERE broker_id=_broker;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.claim_rita_broker_demo(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rita_broker_demo(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.cancel_rita_broker_demo(_broker uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_outreach_journeys;
BEGIN
 SELECT * INTO j FROM public.broker_outreach_journeys WHERE broker_id=_broker FOR UPDATE;
 IF NOT FOUND OR j.call_due_at IS NULL OR j.call_due_at <= clock_timestamp() THEN RETURN false; END IF;
 UPDATE public.broker_outreach_journeys SET cancel_requested_at=clock_timestamp() WHERE broker_id=_broker;
 IF j.call_status='scheduling' OR j.call_provider_id IS NOT NULL THEN RETURN false; END IF;
 UPDATE public.broker_outreach_journeys SET call_status='cancelled',last_error=NULL WHERE broker_id=_broker;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cancel_rita_broker_demo(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_rita_broker_demo(uuid) TO service_role;