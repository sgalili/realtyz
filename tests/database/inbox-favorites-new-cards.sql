BEGIN;
DO $$
DECLARE actor uuid; peer uuid; other_workspace uuid;
BEGIN
 SELECT p.id INTO actor FROM public.profiles p WHERE public.is_community_chat_member(p.id) LIMIT 1;
 SELECT p.id INTO peer FROM public.profiles p WHERE p.id<>actor AND public.is_community_chat_member(p.id)
 AND NOT EXISTS (SELECT 1 FROM public.community_chat_messages m WHERE (m.sender_id=actor AND m.recipient_id=p.id) OR (m.recipient_id=actor AND m.sender_id=p.id)) LIMIT 1;
 IF actor IS NULL OR peer IS NULL THEN RAISE EXCEPTION 'Two eligible accounts without prior messages required'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 IF NOT public.inbox_favorite_target_access(actor,'peer',peer) THEN RAISE EXCEPTION 'New eligible peer favorite denied'; END IF;
 IF public.inbox_favorite_target_access(actor,'peer',actor) THEN RAISE EXCEPTION 'Self favorite accepted'; END IF;
 SELECT p.id INTO other_workspace FROM public.profiles p WHERE NOT public.ws_current_access(p.id) LIMIT 1;
 IF other_workspace IS NULL THEN RAISE EXCEPTION 'An unauthorized workspace required'; END IF;
 IF public.inbox_favorite_target_access(other_workspace,'peer',peer) THEN RAISE EXCEPTION 'Unrelated workspace accepted'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 IF public.inbox_favorite_target_access(actor,'peer',peer) THEN RAISE EXCEPTION 'Anonymous favorite accepted'; END IF;
END $$;
ROLLBACK;