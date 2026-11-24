DO $$
DECLARE b uuid:='00000000-0000-0000-0000-000000000010'; j jsonb; n integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
 PERFORM set_config('request.jwt.claim.role','authenticated',false);
 INSERT INTO profiles(id,full_name) VALUES(b,'מתווך בדיקה');
 INSERT INTO admin_broker_onboarding(user_id,imported_license_number,first_login_at) VALUES(b,'3162103',now());
 PERFORM configure_broker_outreach(b,true,true,true,'explicit consent');
 IF NOT EXISTS(SELECT 1 FROM broker_outreach_journeys WHERE broker_id=b AND enabled AND message_consent_at IS NOT NULL AND call_consent_at IS NOT NULL) THEN RAISE EXCEPTION 'consent not saved'; END IF;
 PERFORM set_config('request.jwt.claim.role','service_role',false);
 IF activate_broker_outreach_login(b) IS NOT NULL THEN RAISE EXCEPTION 'login activated without OTP receipt'; END IF;
 UPDATE broker_outreach_journeys SET otp_verified_at=now(),otp_verified_phone='972500000000',outreach_message_id='invitation',outreach_channel='whatsapp' WHERE broker_id=b;
 IF record_broker_outreach_reply(b,'reply-other','positive','מעוניין','different-invitation') IS NOT NULL THEN RAISE EXCEPTION 'unrelated reply accepted'; END IF;
 PERFORM record_broker_outreach_reply(b,'reply','positive','מעוניין','invitation');
 PERFORM record_broker_outreach_reply(b,'reply','positive','מעוניין','invitation');
 SELECT count(*) INTO n FROM broker_outreach_events WHERE event_key='whatsapp:reply';
 IF n<>1 THEN RAISE EXCEPTION 'reply duplicate'; END IF;
 j:=activate_broker_outreach_login(b);
 IF j IS NULL OR j->>'call_status'<>'ready_to_schedule' OR (j->>'call_due_at')::timestamptz-(j->>'first_otp_login_at')::timestamptz<>interval '60 seconds' THEN RAISE EXCEPTION '60 second call deadline mismatch'; END IF;
 IF activate_broker_outreach_login(b) IS NOT NULL THEN RAISE EXCEPTION 'duplicate first login'; END IF;
 SELECT count(*) INTO n FROM notifications WHERE event_type='broker_first_otp_login';
 IF n<>1 THEN RAISE EXCEPTION 'admin notification duplicate or missing'; END IF;
 PERFORM record_broker_outreach_reply(b,'stop','opt_out','הסרה','invitation');
 IF NOT EXISTS(SELECT 1 FROM broker_outreach_journeys WHERE broker_id=b AND NOT enabled AND opted_out_at IS NOT NULL AND cancel_requested_at IS NOT NULL) THEN RAISE EXCEPTION 'opt out did not stop journey'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false);
 PERFORM set_config('request.jwt.claim.role','authenticated',false);
 BEGIN PERFORM configure_broker_outreach(b,true,true,true,'bad caller'); RAISE EXCEPTION 'role escalation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM activate_broker_outreach_login(b); RAISE EXCEPTION 'client forged OTP login'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;