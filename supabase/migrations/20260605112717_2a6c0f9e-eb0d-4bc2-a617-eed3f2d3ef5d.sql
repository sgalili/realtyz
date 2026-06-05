DO $$
DECLARE
  _exists uuid;
BEGIN
  SELECT id INTO _exists FROM vault.secrets WHERE name = 'HOMELY_CRED_KEY' LIMIT 1;
  IF _exists IS NULL THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'HOMELY_CRED_KEY', 'Symmetric key for encrypting Homely broker passwords at rest');
  END IF;
END $$;