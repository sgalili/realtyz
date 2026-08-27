CREATE OR REPLACE FUNCTION public.crm_import_merge()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid := '8f66ac1a-070a-4485-ac3b-07697d6c4b9e';
  data jsonb := (SELECT payload FROM public.crm_import_staging ORDER BY created_at DESC LIMIT 1);
  c jsonb; p jsonb; f jsonb; itx jsonb;
  v_lead uuid; v_listing uuid;
  v_norm text; v_city text; v_deal text; v_title text; v_slug text;
  lead_map jsonb := '{}'::jsonb; prop_map jsonb := '{}'::jsonb;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(data->'contacts') LOOP
    v_norm := NULL;
    IF nullif(c->>'phone','') IS NOT NULL THEN
      v_norm := regexp_replace(c->>'phone','\D','','g');
      IF left(v_norm,1) = '0' THEN v_norm := '972' || substr(v_norm,2); END IF;
      IF left(v_norm,3) <> '972' THEN v_norm := '972' || v_norm; END IF;
    END IF;

    v_city := CASE
      WHEN (c->'areas')::text ILIKE '%רמת השרון%' THEN 'רמת השרון'
      WHEN (c->'areas')::text ILIKE '%הרצליה%' THEN 'הרצליה'
      WHEN (c->'areas')::text ILIKE '%תל אביב%' THEN 'תל אביב'
      ELSE NULL END;

    v_deal := CASE WHEN c->>'contact_type' IN ('renter','renter_lead','tenant','landlord','landlord_lead') THEN 'rent' ELSE 'sale' END;

    v_lead := NULL;
    SELECT id INTO v_lead FROM public.leads
    WHERE (v_norm IS NOT NULL AND regexp_replace(phone_number,'\D','','g') IN (v_norm, '0' || substr(v_norm,4)))
    LIMIT 1;

    IF v_lead IS NULL AND nullif(c->>'email','') IS NOT NULL THEN
      SELECT id INTO v_lead FROM public.leads WHERE lower(email) = lower(c->>'email') LIMIT 1;
    END IF;

    IF v_lead IS NULL THEN
      SELECT id INTO v_lead FROM public.leads
      WHERE lower(trim(coalesce(full_name,''))) = lower(trim(c->>'name'))
        AND (assigned_to = v_owner OR assigned_to IS NULL)
      LIMIT 1;
    END IF;

    IF v_lead IS NULL THEN
      SELECT id INTO v_lead FROM public.leads WHERE preferences->'crm_import'->>'id' = c->>'id' LIMIT 1;
    END IF;

    IF v_lead IS NULL THEN
      INSERT INTO public.leads (phone_number, full_name, email, city, deal_type, interest_tag,
                                assigned_to, is_demo, ai_autopilot, preferences, last_interaction_at)
      VALUES (coalesce(v_norm, 'crm-' || (c->>'id')), c->>'name', nullif(c->>'email',''), v_city,
              v_deal, c->>'contact_type', v_owner, false, true,
              jsonb_build_object('crm_import', c),
              coalesce((c->>'last_contact_date')::timestamptz, now()))
      RETURNING id INTO v_lead;
    ELSE
      UPDATE public.leads SET
        full_name = coalesce(nullif(c->>'name',''), full_name),
        email = coalesce(nullif(c->>'email',''), email),
        city = coalesce(v_city, city),
        deal_type = coalesce(v_deal, deal_type),
        interest_tag = coalesce(nullif(c->>'contact_type',''), interest_tag),
        assigned_to = coalesce(assigned_to, v_owner),
        phone_number = CASE WHEN v_norm IS NOT NULL AND phone_number LIKE 'crm-%' THEN v_norm ELSE phone_number END,
        preferences = coalesce(preferences,'{}'::jsonb) || jsonb_build_object('crm_import', c),
        last_interaction_at = greatest(coalesce(last_interaction_at, '1970-01-01'::timestamptz),
                                       coalesce((c->>'last_contact_date')::timestamptz, '1970-01-01'::timestamptz))
      WHERE id = v_lead;
    END IF;

    lead_map := lead_map || jsonb_build_object(c->>'id', v_lead);
  END LOOP;

  FOR p IN SELECT * FROM jsonb_array_elements(data->'properties') LOOP
    v_deal := CASE WHEN p->>'purpose' = 'rent' THEN 'rent' ELSE 'sale' END;
    v_title := concat_ws(' · ',
      CASE WHEN p->>'property_type' = 'apartment' THEN 'דירה'
           WHEN p->>'property_type' = 'penthouse' THEN 'פנטהאוס'
           WHEN p->>'property_type' = 'cottage' THEN 'קוטג'
           WHEN p->>'property_type' = 'house' THEN 'בית'
           ELSE 'נכס' END,
      p->>'city', p->>'address');

    v_listing := NULL;
    SELECT id INTO v_listing FROM public.listings
    WHERE source = 'import' AND external_id = (p->>'id') LIMIT 1;

    IF v_listing IS NULL THEN
      SELECT id INTO v_listing FROM public.listings
      WHERE user_id = v_owner
        AND lower(trim(coalesce(address,''))) = lower(trim(p->>'address'))
        AND lower(trim(coalesce(city,''))) = lower(trim(p->>'city'))
      ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_listing IS NULL THEN
      v_slug := 'crm-' || lower(p->>'id') || '-' || substr(md5(random()::text),1,6);
      INSERT INTO public.listings (user_id, slug, is_published, property_title, description,
        asking_price, city, neighborhood, address, rooms, sqm, floor, elevator, parking,
        deal_type, status, source, external_id, office_notes, additional_details, available_from)
      VALUES (v_owner, v_slug,
        NOT coalesce((p->>'referral_only')::boolean, false),
        v_title, coalesce(nullif(p->>'notes',''), v_title),
        coalesce((p->>'price')::numeric, (p->>'asking_price')::numeric, 0),
        p->>'city', nullif(p->>'neighborhood',''), nullif(p->>'address',''),
        (p->>'rooms')::numeric, (p->>'built_area_sqm')::int, (p->>'floor')::int,
        CASE WHEN p->>'elevator' = 'yes' THEN true WHEN p->>'elevator' = 'no' THEN false ELSE NULL END,
        CASE WHEN nullif(p->>'parking','') IS NULL THEN NULL WHEN p->>'parking' = 'no' THEN false ELSE true END,
        v_deal, 'live', 'import', p->>'id', nullif(p->>'notes',''),
        jsonb_build_object('crm_import', p),
        CASE WHEN (p->>'entry_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (p->>'entry_date')::date ELSE NULL END)
      RETURNING id INTO v_listing;
    ELSE
      UPDATE public.listings SET
        property_title = coalesce(nullif(property_title,''), v_title),
        asking_price = coalesce((p->>'price')::numeric, (p->>'asking_price')::numeric, asking_price),
        city = coalesce(nullif(p->>'city',''), city),
        neighborhood = coalesce(nullif(p->>'neighborhood',''), neighborhood),
        address = coalesce(nullif(p->>'address',''), address),
        rooms = coalesce((p->>'rooms')::numeric, rooms),
        sqm = coalesce((p->>'built_area_sqm')::int, sqm),
        floor = coalesce((p->>'floor')::int, floor),
        elevator = coalesce(CASE WHEN p->>'elevator' = 'yes' THEN true WHEN p->>'elevator' = 'no' THEN false END, elevator),
        parking = coalesce(CASE WHEN nullif(p->>'parking','') IS NULL THEN NULL WHEN p->>'parking' = 'no' THEN false ELSE true END, parking),
        deal_type = coalesce(v_deal, deal_type),
        external_id = coalesce(external_id, p->>'id'),
        office_notes = coalesce(nullif(p->>'notes',''), office_notes),
        additional_details = coalesce(additional_details,'{}'::jsonb) || jsonb_build_object('crm_import', p),
        is_published = CASE WHEN coalesce((p->>'referral_only')::boolean, false) THEN false ELSE is_published END,
        available_from = coalesce(CASE WHEN (p->>'entry_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (p->>'entry_date')::date ELSE NULL END, available_from),
        updated_at = now()
      WHERE id = v_listing;
    END IF;

    prop_map := prop_map || jsonb_build_object(p->>'id', v_listing);

    IF nullif(p->>'owner_contact_id','') IS NOT NULL AND lead_map ? (p->>'owner_contact_id') THEN
      UPDATE public.leads
      SET linked_listing_id = coalesce(linked_listing_id, v_listing)
      WHERE id = (lead_map->>(p->>'owner_contact_id'))::uuid;
    END IF;
  END LOOP;

  FOR c IN SELECT * FROM jsonb_array_elements(data->'contacts') LOOP
    IF jsonb_typeof(c->'linked_property_ids') = 'array'
       AND jsonb_array_length(c->'linked_property_ids') > 0
       AND prop_map ? (c->'linked_property_ids'->>0) THEN
      UPDATE public.leads
      SET linked_listing_id = coalesce(linked_listing_id, (prop_map->>(c->'linked_property_ids'->>0))::uuid)
      WHERE id = (lead_map->>(c->>'id'))::uuid;
    END IF;
  END LOOP;

  FOR f IN SELECT * FROM jsonb_array_elements(data->'followups') LOOP
    IF EXISTS (SELECT 1 FROM public.scheduled_items WHERE metadata->>'crm_id' = f->>'id' AND user_id = v_owner) THEN
      UPDATE public.scheduled_items SET
        content = f->>'description',
        status = coalesce(f->>'status', status),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('crm_id', f->>'id', 'crm_followup', f),
        updated_at = now()
      WHERE metadata->>'crm_id' = f->>'id' AND user_id = v_owner;
    ELSE
      INSERT INTO public.scheduled_items (user_id, title, content, item_type, channel, status, scheduled_for, metadata)
      VALUES (v_owner,
        concat_ws(' · ', f->>'action_type',
          coalesce((SELECT full_name FROM public.leads WHERE id = (lead_map->>(f->>'contact_id'))::uuid), f->>'contact_id')),
        f->>'description', 'task', 'internal', coalesce(f->>'status','open'),
        coalesce(nullif(f->>'due_at','')::timestamptz, now()),
        jsonb_build_object('crm_id', f->>'id', 'crm_followup', f,
          'lead_id', lead_map->>(f->>'contact_id'),
          'listing_id', prop_map->>(f->>'property_id'),
          'priority', f->>'priority'));
    END IF;
  END LOOP;

  FOR itx IN SELECT * FROM jsonb_array_elements(data->'interactions') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.interaction_activity_log WHERE metadata->>'crm_id' = itx->>'id' AND user_id = v_owner) THEN
      INSERT INTO public.interaction_activity_log (user_id, thread_key, platform, action_type, actor_type,
        actor_id, actor_label, content, created_at, metadata)
      VALUES (v_owner,
        'crm:' || coalesce(lead_map->>(itx->>'contact_id'), itx->>'contact_id'),
        CASE WHEN itx->>'channel' IN ('phone','message','in_person','update','email') THEN itx->>'channel' ELSE 'other' END,
        'crm_interaction', 'human',
        (lead_map->>(itx->>'contact_id'))::uuid,
        coalesce((SELECT full_name FROM public.leads WHERE id = (lead_map->>(itx->>'contact_id'))::uuid), itx->>'contact_id'),
        itx->>'summary',
        coalesce((itx->>'date')::timestamptz, now()),
        jsonb_build_object('crm_id', itx->>'id', 'crm_interaction', itx,
          'lead_id', lead_map->>(itx->>'contact_id'),
          'listing_id', prop_map->>(itx->>'property_id'),
          'outcome', itx->>'outcome'));
    END IF;
  END LOOP;

  RETURN 'ok';
END;
$fn$;