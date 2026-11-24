CREATE OR REPLACE FUNCTION public.get_broker_discovery_overview()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rows jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 WITH sources AS(SELECT DISTINCT ON(broker_id) broker_id,status FROM public.broker_whatsapp_jobs ORDER BY broker_id,created_at DESC,id DESC),
 inquiries AS(SELECT DISTINCT ON(broker_id) broker_id,status,COALESCE(reply_deadline,send_reserved_at,next_source_at,created_at) AS eta_at FROM public.broker_wa_scanner_jobs ORDER BY broker_id,created_at DESC,id DESC)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('broker_id',COALESCE(s.broker_id,i.broker_id),'source_status',s.status,'scanner_status',i.status,'eta_at',i.eta_at,'has_whatsapp',c.broker_id IS NOT NULL)), '[]'::jsonb) INTO rows FROM sources s FULL JOIN inquiries i ON i.broker_id=s.broker_id LEFT JOIN public.broker_whatsapp_contacts c ON c.broker_id=COALESCE(s.broker_id,i.broker_id);
 RETURN jsonb_build_object('rows',rows,'total',jsonb_array_length(rows),'done',(SELECT count(*) FROM jsonb_array_elements(rows) r WHERE COALESCE(r->>'source_status','') NOT IN('pending','running','retry') AND COALESCE(r->>'scanner_status','') NOT IN('pending_source','reading_source','ready','sending','awaiting_reply')));
END $function$;