DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='whatsapp_provider') THEN
    ALTER TABLE public.profiles ADD COLUMN whatsapp_provider text NOT NULL DEFAULT 'greenapi';
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_whatsapp_provider_check CHECK (whatsapp_provider IN ('meta_wab','greenapi'));
  END IF;
END $$;

UPDATE public.profiles SET whatsapp_provider = 'meta_wab' WHERE id = '8f66ac1a-070a-4485-ac3b-07697d6c4b9e';