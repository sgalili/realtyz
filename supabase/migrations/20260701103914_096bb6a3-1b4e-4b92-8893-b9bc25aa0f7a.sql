DELETE FROM public.campaign_settings WHERE key = 'ayrshare_circuit_state';
UPDATE public.campaign_logs SET status = 'failed' WHERE status = 'paused' OR failure_reason = 'ayrshare_circuit_open';