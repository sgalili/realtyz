
DO $$
DECLARE
  v_old uuid := '13cf8784-caae-425e-8598-a28c9b1ae0a5';
  v_new uuid := '8f66ac1a-070a-4485-ac3b-07697d6c4b9e';
BEGIN
  UPDATE auth.users SET phone = NULL, phone_confirmed_at = NULL WHERE id = v_old;

  UPDATE auth.users
     SET phone = '972522973500',
         phone_confirmed_at = COALESCE(phone_confirmed_at, now())
   WHERE id = v_new;

  DELETE FROM auth.identities WHERE user_id = v_old;
  DELETE FROM auth.users WHERE id = v_old;
END $$;
