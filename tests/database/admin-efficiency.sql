INSERT INTO profiles VALUES
 ('00000000-0000-0000-0000-000000000010','מיכל כהן',NULL,'מיכל כהן','10'),
 ('00000000-0000-0000-0000-000000000011','שי לוי',NULL,'שי לוי','11'),
 ('00000000-0000-0000-0000-000000000012','משה לוי','female','משה לוי','12'),
 ('00000000-0000-0000-0000-000000000013','משה כהן',NULL,NULL,'13'),
 ('00000000-0000-0000-0000-000000000014','דוד כהן',NULL,NULL,'14');
INSERT INTO broker_license_verifications VALUES ('00000000-0000-0000-0000-000000000014','999',now());
DO $$ BEGIN
 BEGIN PERFORM admin_classify_verified_broker_genders(true); RAISE EXCEPTION 'anonymous access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM admin_classify_verified_broker_genders(true); RAISE EXCEPTION 'non-admin access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r jsonb; BEGIN
 r:=admin_classify_verified_broker_genders(false); IF (r->>'remaining')::int<>2 THEN RAISE EXCEPTION 'wrong eligible count %',r; END IF;
 r:=admin_classify_verified_broker_genders(true); IF (r->>'saved')::int<>1 OR (r->>'skipped')::int<>1 THEN RAISE EXCEPTION 'classification failed %',r; END IF;
 IF (SELECT gender FROM profiles WHERE id='00000000-0000-0000-0000-000000000010')<>'female' THEN RAISE EXCEPTION 'clear name not classified'; END IF;
 IF (SELECT gender FROM profiles WHERE id='00000000-0000-0000-0000-000000000012')<>'female' THEN RAISE EXCEPTION 'manual gender overwritten'; END IF;
 IF EXISTS(SELECT 1 FROM profiles WHERE id IN ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000014') AND gender IS NOT NULL) THEN RAISE EXCEPTION 'unverified gender changed'; END IF;
 r:=admin_classify_verified_broker_genders(false); IF (r->>'remaining')::int<>0 THEN RAISE EXCEPTION 'ambiguous skip counted again'; END IF;
END $$;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000010',NULL),('00000000-0000-0000-0000-000000000011',now()),('00000000-0000-0000-0000-000000000012',NULL);
INSERT INTO admin_broker_onboarding VALUES
 ('00000000-0000-0000-0000-000000000010','yad2',NULL,NULL,NULL),
 ('00000000-0000-0000-0000-000000000011','yad2',NULL,NULL,now()),
 ('00000000-0000-0000-0000-000000000012','yad2',now(),now(),now());
INSERT INTO listings VALUES('00000000-0000-0000-0000-000000000012','live',false,false,NULL),('00000000-0000-0000-0000-000000000012','sold',false,false,NULL);
DO $$ DECLARE r jsonb; BEGIN
 IF (SELECT count(*) FROM pending_import_account_ids())<>1 THEN RAISE EXCEPTION 'invitation eligibility changed'; END IF;
 r:=admin_broker_onboarding_statuses();
 IF r->'00000000-0000-0000-0000-000000000010'->>'stage'<>'not_invited' THEN RAISE EXCEPTION 'incorrect uninvited stage'; END IF;
 IF r->'00000000-0000-0000-0000-000000000011'->>'stage'<>'pending_otp' THEN RAISE EXCEPTION 'incorrect OTP stage'; END IF;
 IF r->'00000000-0000-0000-0000-000000000012'->>'stage'<>'pending_property_review' OR (r->'00000000-0000-0000-0000-000000000012'->>'pending_properties')::int<>1 THEN RAISE EXCEPTION 'inventory filters changed'; END IF;
END $$;