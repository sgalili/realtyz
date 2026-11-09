-- Run against a managed project connection; all changes are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"f12db948-d4dd-4f53-878f-b9f2fb81c0fb","role":"authenticated"}',true);
DO $$ BEGIN
 IF (public.get_broker_license_state('1567fdb9-bce7-4b17-b9b7-2bf254929d3b')->>'status') <> 'approved' THEN RAISE EXCEPTION '30625911 must be manually approved'; END IF;
 IF NOT public.partner_can_view_closing('1567fdb9-bce7-4b17-b9b7-2bf254929d3b') OR NOT public.can_close_deal('1567fdb9-bce7-4b17-b9b7-2bf254929d3b') THEN RAISE EXCEPTION 'manual approval must grant closing privileges'; END IF;
 IF public.broker_license_approved_for('1ca89c52-2163-4fe0-9ec1-3d27795b6232','30625911') THEN RAISE EXCEPTION 'manual approval must not transfer to Doli'; END IF;
END $$;
DO $$ BEGIN
 BEGIN UPDATE public.admin_approved_broker_licenses SET user_id='1ca89c52-2163-4fe0-9ec1-3d27795b6232' WHERE license_number='30625911'; RAISE EXCEPTION 'approval transfer was accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'license_already_approved_for_another_account' THEN RAISE; END IF; END;
END $$;
SELECT public.admin_remove_broker_license('1567fdb9-bce7-4b17-b9b7-2bf254929d3b');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.admin_approved_broker_licenses WHERE user_id='1567fdb9-bce7-4b17-b9b7-2bf254929d3b') THEN RAISE EXCEPTION 'removal must revoke manual approval'; END IF;
 IF public.partner_can_view_closing('1567fdb9-bce7-4b17-b9b7-2bf254929d3b') THEN RAISE EXCEPTION 'removed broker must lose closing entitlement'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id='1567fdb9-bce7-4b17-b9b7-2bf254929d3b' AND broker_license_number IS NOT NULL) THEN RAISE EXCEPTION 'removal must clear license'; END IF;
END $$;
ROLLBACK;