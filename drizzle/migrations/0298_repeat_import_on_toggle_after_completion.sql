CREATE OR REPLACE FUNCTION public.continue_repeated_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT NEW.repeat_enabled OR NEW.status<>'completed' OR OLD.status<>'running' OR NEW.stage<>'completed' OR NEW.error IS NOT NULL THEN RETURN NEW; END IF;
 PERFORM public.spawn_repeated_import(NEW);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.continue_repeated_import() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_import_repeat(_id uuid,_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.broker_import_jobs; next_id uuid; spawn text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.broker_import_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'job_unavailable'; END IF;
 SELECT id INTO next_id FROM public.broker_import_jobs WHERE repeat_parent_id=j.id;
 IF next_id IS NOT NULL THEN RETURN public.set_import_repeat(next_id,_enabled); END IF;
 UPDATE public.broker_import_jobs SET repeat_enabled=_enabled,repeat_seed=COALESCE(repeat_seed,checkpoint) WHERE id=j.id RETURNING * INTO j;
 INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(auth.uid(),'import.repeat_changed','broker_import_jobs',j.id::text,jsonb_build_object('enabled',_enabled));
 IF _enabled AND j.status='completed' AND j.error IS NULL THEN spawn:=public.spawn_repeated_import(j); END IF;
 RETURN jsonb_build_object('job_id',j.id,'enabled',_enabled,'spawn',spawn);
END $$;
REVOKE ALL ON FUNCTION public.set_import_repeat(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_import_repeat(uuid,boolean) TO authenticated;