CREATE TABLE public.developer_import_identities (identity_key text PRIMARY KEY, developer_id uuid, workspace_owner_id uuid, lease_token uuid, lease_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.developer_import_identities TO service_role;
ALTER TABLE public.developer_import_identities ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.claim_developer_import_identity(_key text, _token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.developer_import_identities;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR length(_key)<2 OR length(_key)>250 THEN RAISE EXCEPTION 'forbidden'; END IF;
 INSERT INTO public.developer_import_identities(identity_key,lease_token,lease_until) VALUES(_key,_token,now()+interval '180 seconds') ON CONFLICT(identity_key) DO NOTHING;
 SELECT * INTO r FROM public.developer_import_identities WHERE identity_key=_key FOR UPDATE;
 IF r.lease_token IS NOT NULL AND r.lease_token<>_token AND r.lease_until>now() THEN RETURN jsonb_build_object('busy',true); END IF;
 UPDATE public.developer_import_identities SET lease_token=_token,lease_until=now()+interval '180 seconds',updated_at=now() WHERE identity_key=_key;
 RETURN jsonb_build_object('busy',false,'developer_id',r.developer_id,'workspace_owner_id',r.workspace_owner_id);
END $$;
REVOKE ALL ON FUNCTION public.claim_developer_import_identity(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_developer_import_identity(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_developer_import_identity(_key text,_token uuid,_developer uuid,_workspace uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.developers WHERE id=_developer AND workspace_owner_id=_workspace) THEN RAISE EXCEPTION 'identity_unavailable'; END IF;
 UPDATE public.developer_import_identities SET developer_id=_developer,workspace_owner_id=_workspace,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE identity_key=_key AND lease_token=_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'identity_lease_lost'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.finish_developer_import_identity(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_developer_import_identity(text,uuid,uuid,uuid) TO service_role;