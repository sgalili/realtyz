ALTER TABLE public.white_label_settings ADD COLUMN IF NOT EXISTS office_address text, ADD COLUMN IF NOT EXISTS public_email text, ADD COLUMN IF NOT EXISTS brokerage_name text, ADD COLUMN IF NOT EXISTS brokerage_license text;
CREATE TABLE public.platform_branding (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 agency_name text NOT NULL DEFAULT 'TORAF',
 logo_url text,
 landscape_logo_url text,
 office_address text,
 public_email text,
 brokerage_name text,
 brokerage_license text,
 service_areas text[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_branding TO anon, authenticated;
GRANT ALL ON public.platform_branding TO service_role;
ALTER TABLE public.platform_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public master office branding read only" ON public.platform_branding FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.platform_branding (agency_name,logo_url,landscape_logo_url,office_address,public_email,brokerage_name,brokerage_license,service_areas)
SELECT CASE WHEN nullif(trim(w.agency_name),'') IS NULL OR w.agency_name='Realtyz AI' THEN 'TORAF' ELSE w.agency_name END,w.logo_url,w.landscape_logo_url,w.office_address,w.public_email,w.brokerage_name,w.brokerage_license,coalesce(p.service_areas,'{}')
FROM public.profiles p LEFT JOIN public.white_label_settings w ON w.user_id=p.id WHERE p.id='dc819834-1aa9-4aca-bb27-ec2c8cebde69';
CREATE OR REPLACE FUNCTION public.sync_master_office_branding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='white_label_settings' THEN
  IF coalesce(NEW.user_id,OLD.user_id) <> 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid THEN RETURN NULL; END IF;
  IF TG_OP='DELETE' THEN
   UPDATE public.platform_branding SET agency_name='TORAF',logo_url=NULL,landscape_logo_url=NULL,office_address=NULL,public_email=NULL,brokerage_name=NULL,brokerage_license=NULL,updated_at=now() WHERE id;
  ELSE
   INSERT INTO public.platform_branding (id,agency_name,logo_url,landscape_logo_url,office_address,public_email,brokerage_name,brokerage_license)
   VALUES (true,coalesce(nullif(trim(NEW.agency_name),''),'TORAF'),NEW.logo_url,NEW.landscape_logo_url,NEW.office_address,NEW.public_email,NEW.brokerage_name,NEW.brokerage_license)
   ON CONFLICT (id) DO UPDATE SET agency_name=EXCLUDED.agency_name,logo_url=EXCLUDED.logo_url,landscape_logo_url=EXCLUDED.landscape_logo_url,office_address=EXCLUDED.office_address,public_email=EXCLUDED.public_email,brokerage_name=EXCLUDED.brokerage_name,brokerage_license=EXCLUDED.brokerage_license,updated_at=now();
  END IF;
 ELSIF NEW.id='dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid THEN
  UPDATE public.platform_branding SET service_areas=coalesce(NEW.service_areas,'{}'),updated_at=now() WHERE id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_master_office_branding() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_master_office_branding AFTER INSERT OR UPDATE OR DELETE ON public.white_label_settings FOR EACH ROW EXECUTE FUNCTION public.sync_master_office_branding();
CREATE TRIGGER sync_master_office_areas AFTER UPDATE OF service_areas ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_master_office_branding();
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_branding;