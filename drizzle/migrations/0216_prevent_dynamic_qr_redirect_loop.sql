ALTER TABLE public.dynamic_qr_config
ADD CONSTRAINT dynamic_qr_destination_not_redirect_loop
CHECK (qr_destination_url !~* '^https?://(www\.)?toraff\.co\.il/go([/?#].*)?$');